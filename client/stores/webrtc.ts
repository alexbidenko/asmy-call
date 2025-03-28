import { io, Socket } from 'socket.io-client'

export interface RemoteStreamObj {
  id: string
  socketId: string
  stream: MediaStream
  video: boolean
  audio: boolean
}

export const useWebrtcStore = defineStore('webrtc', () => {
  const screenShareStore = useScreenShareStore();
  const deviceStore = useDeviceStore();

  // -------------------
  // State (Composition API refs)
  // -------------------
  const rtcSocket = ref<Socket | null>(null)
  const mySocketId = ref('')
  const room = ref('')
  const localStream = ref<MediaStream>(new MediaStream())
  const remoteStreams = ref<RemoteStreamObj[]>([])
  const peerConnections = ref<Record<string, RTCPeerConnection>>({})

  // Контролы
  const isMicOn = ref(false)
  const isCamOn = ref(false)

  const previousAudioConstraints = ref<any>(null)
  const previousVideoConstraints = ref<any>(null)

  // У нас в UI <video ref="localVideo" />
  const localVideo = ref<HTMLVideoElement | null>(null)

  // На каждого удалённого: (mic / sysAudio / cam / screen)
  const transceivers = ref<Record<string, RTCPeerConnection>>({})

  const senders = ref<Record<string, RTCRtpSender>>({})
  const remoteTracks = ref<string[]>([])
  const negotiationInProgress = ref(false)


  // --------------------------------------------------
  // initSocket, joinWebrtcRoom
  // --------------------------------------------------
  const initSocket = (r: string) => {
    const config = useRuntimeConfig()

    if (rtcSocket.value) {
      rtcSocket.value.disconnect()
    }
    room.value = r
    remoteStreams.value = []
    peerConnections.value = {}
    remoteTracks.value = []
    transceivers.value = {}

    rtcSocket.value = io(config.public.apiHost || '', { forceNew: true })

    rtcSocket.value.on('connect', () => {
      if (rtcSocket.value?.id) {
        mySocketId.value = rtcSocket.value.id
        console.log('[WebRTC] mySocketId=', mySocketId.value)
      }
    })

    rtcSocket.value.on('existingUsers', (users: { socketId: string; username: string }[]) => {
      const memberStore = useMemberStore()
      users.forEach((u) => {
        createPeerConnection(u.socketId)
        memberStore.join({ id: u.socketId, username: u.username })
      })
    })

    rtcSocket.value.on('user-joined', (data) => {
      const memberStore = useMemberStore()
      const pc = createPeerConnection(data.socketId)
      memberStore.join({ id: data.socketId, username: data.username })

      if (mySocketId.value < data.socketId) {
        if (pc.signalingState === 'stable' && !negotiationInProgress.value) {
          negotiationInProgress.value = true
          console.log('[user-joined] => doOffer to new user', data.socketId)
          doOffer(pc, data.socketId).finally(() => {
            negotiationInProgress.value = false
          })
        }
      } else {
        console.log('[user-joined] => slaveForceOffer for new user', data.socketId)
        slaveForceOffer()
      }
    })

    rtcSocket.value.on('webrtcSignal', (payload) => {
      handleSignal(payload)
    })

    rtcSocket.value.on('user-left', (data) => {
      const memberStore = useMemberStore()
      const socketId = data.socketId
      if (peerConnections.value[socketId]) {
        peerConnections.value[socketId].close()
        delete peerConnections.value[socketId]
      }
      remoteStreams.value = remoteStreams.value.filter((r) => r.socketId !== socketId)
      memberStore.leave(socketId)
    })
  }

  const joinWebrtcRoom = () => {
    const userStore = useUserStore()
    rtcSocket.value?.emit('joinWebrtcRoom', {
      room: room.value,
      username: userStore.username
    })
  }

  const createPeerConnection = (remoteId: string) => {
    if (peerConnections.value[remoteId]) return peerConnections.value[remoteId]

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })

    transceivers.value[remoteId] = pc

    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        rtcSocket.value?.emit('webrtcSignal', {
          room: room.value,
          from: mySocketId.value,
          to: remoteId,
          signalData: { candidate: evt.candidate }
        })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[ICE state] ${mySocketId.value}->${remoteId}:`, pc.iceConnectionState)
    }

    pc.ontrack = (evt) => {
      const track = evt.track
      if (!track) return
      if (remoteTracks.value.includes(track.id)) {
        return
      }
      remoteTracks.value.push(track.id)

      if (evt?.streams[0]) {
        evt.streams[0].onremovetrack = () => {
          removeRemoteStream(evt.streams[0], remoteId)
        }
        evt.streams[0].onaddtrack = () => {
          pushRemoteStream(evt.streams[0], remoteId)
        }
        pushRemoteStream(evt.streams[0], remoteId)
      }
    }

    pc.onnegotiationneeded = async () => {
      if (mySocketId.value >= remoteId) {
        console.log('[onnegotiationneeded] skip => I am slave for', remoteId)
        return
      }
      if (negotiationInProgress.value) {
        console.log('[onnegotiationneeded] skip => negotiationInProgress=true')
        return
      }
      if (pc.signalingState !== 'stable') {
        console.log('[onnegotiationneeded] skip => state=', pc.signalingState)
        return
      }

      negotiationInProgress.value = true
      try {
        console.log('[onnegotiationneeded => doOffer]', mySocketId.value, '->', remoteId)
        await doOffer(pc, remoteId)
      } finally {
        negotiationInProgress.value = false
      }
    }

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      if (state === 'closed' || state === 'failed') {
        console.log(`[oniceconnectionstatechange] => state=${state}, cleaning up remoteId=${remoteId}`)
        pc.close()
        delete peerConnections.value[remoteId]
        remoteStreams.value = remoteStreams.value.filter(r => r.socketId !== remoteId)
      }
    }

    if (localStream.value) {
      localStream.value.getTracks().forEach(track => {
        pc.addTrack(track, localStream.value!)
      })
    }
    if (screenShareStore.stream) {
      screenShareStore.stream.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          pc.addTrack(track, screenShareStore.stream!)
        }
      })
    }

    peerConnections.value[remoteId] = pc
    return pc
  }

  const pushRemoteStream = (stream: MediaStream, socketId: string) => {
    const found = remoteStreams.value.find(
      (x) => x.socketId === socketId && x.stream.id === stream.id
    )
    if (!found) {
      remoteStreams.value.push({
        id: stream.id,
        stream,
        socketId,
        audio: !!stream.getAudioTracks().length,
        video: !!stream.getVideoTracks().length,
      })
    } else {
      found.audio = !!stream.getAudioTracks().length
      found.video = !!stream.getVideoTracks().length
    }
  }

  const removeRemoteStream = (stream: MediaStream, socketId: string) => {
    if (stream.getTracks().length) {
      const found = remoteStreams.value.find(
        (x) => x.socketId === socketId && x.stream.id === stream.id
      )
      if (found) {
        found.audio = !!stream.getAudioTracks().length
        found.video = !!stream.getVideoTracks().length
      }
      return
    }
    remoteStreams.value = remoteStreams.value.filter(
      (x) => !(x.socketId === socketId && x.stream.id === stream.id)
    )
  }

  // --------------------------------------------------
  // Offer / Answer / handleSignal
  // --------------------------------------------------
  const doOffer = async (pc: RTCPeerConnection, remoteId: string) => {
    if (pc.signalingState !== 'stable') {
      console.warn('[doOffer] skip => state=', pc.signalingState)
      return
    }
    console.log('[doOffer] =>', remoteId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    rtcSocket.value?.emit('webrtcSignal', {
      room: room.value,
      from: mySocketId.value,
      to: remoteId,
      signalData: { sdp: pc.localDescription }
    })
  }

  const doAnswer = async (pc: RTCPeerConnection, remoteId: string) => {
    if (pc.signalingState !== 'have-remote-offer') {
      console.warn('[doAnswer] skip => state=', pc.signalingState)
      return
    }
    console.log('[doAnswer] =>', remoteId)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    rtcSocket.value?.emit('webrtcSignal', {
      room: room.value,
      from: mySocketId.value,
      to: remoteId,
      signalData: { sdp: pc.localDescription }
    })
  }

  const handleSignal = async (payload: any) => {
    const { from, signalData } = payload
    if (!peerConnections.value[from]) {
      createPeerConnection(from)
    }
    const pc = peerConnections.value[from]

    if (signalData.sdp) {
      console.log('[handleSignal] sdp from=', from, 'type=', signalData.sdp.type)
      await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp))
      console.log('[handleSignal] after setRemoteDescription => state=', pc.signalingState)
      if (signalData.sdp.type === 'offer') {
        await doAnswer(pc, from)
      }
    } else if (signalData.candidate) {
      console.log('[handleSignal] candidate from=', from)
      await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate))
    }
  }

  // --------------------------------------------------
  // SLAVE: вызвать doOffer, если я хочу отправлять свои треки
  // --------------------------------------------------
  const slaveForceOffer = async () => {
    for (const [remoteId, pc] of Object.entries(transceivers.value)) {
      if (mySocketId.value > remoteId) {
        if (pc.signalingState === 'stable' && !negotiationInProgress.value) {
          negotiationInProgress.value = true
          console.log('[slaveForceOffer] => doOffer, me=', mySocketId.value, '->', remoteId)
          await doOffer(pc, remoteId)
          negotiationInProgress.value = false
        } else {
          console.log('[slaveForceOffer] skip => state=', pc.signalingState)
        }
      }
    }
  }

  // --------------------------------------------------
  // Локальный стрим: кам+мик
  // --------------------------------------------------
  const initLocalStream = async (audioDevId?: string, videoDevId?: string) => {
    const audioConstraints = isMicOn.value
      ? (audioDevId && audioDevId !== 'default')
        ? { deviceId: { exact: audioDevId } }
        : true
      : false

    const videoConstraints = isCamOn.value
      ? (videoDevId && videoDevId !== 'default')
        ? { deviceId: { exact: videoDevId } }
        : true
      : false

    if (!localStream.value.getTracks().length) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints || true,
        video: videoConstraints
      });
      const newAudioTrack = stream.getAudioTracks()[0];
      newAudioTrack.enabled = false;
      localStream.value.addTrack(newAudioTrack);

      updateRemoteTracks()
      return
    }

    const getConstraintKey = (constraint: any) =>
      typeof constraint === 'boolean' ? constraint : constraint.deviceId.exact

    if (!!getConstraintKey(audioConstraints) !== !!previousAudioConstraints.value) {
      const audioTracks = localStream.value.getAudioTracks()
      audioTracks.forEach(track => {
        track.enabled = !!audioConstraints;
      });
    } else {
      // Если localStream уже есть, обновляем только необходимые треки
      // Обновляем аудио-треки, только если состояние изменилось
      if (getConstraintKey(audioConstraints) !== previousAudioConstraints.value) {
        const audioTracks = localStream.value.getAudioTracks();

        if (audioConstraints) {
          // Если включаем микрофон
          if (audioTracks.length === 0) {
            // Если трек отсутствует, добавляем его заново
            try {
              const audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
              const newAudioTrack = audioStream.getAudioTracks()[0];
              localStream.value.addTrack(newAudioTrack);
            } catch (error) {
              console.error('Ошибка при обновлении аудио:', error);
            }
          } else {
            // Если трек есть, просто включаем его
            audioTracks.forEach(track => {
              track.enabled = true;
            });
          }
        } else {
          // Если выключаем микрофон, не удаляем треки, а просто отключаем их
          audioTracks.forEach(track => {
            track.enabled = false;
          });
        }
        previousAudioConstraints.value = getConstraintKey(audioConstraints);
      }
    }

    if (getConstraintKey(videoConstraints) !== previousVideoConstraints.value) {
      const videoTracks = localStream.value.getVideoTracks()
      videoTracks.forEach(track => {
        localStream.value?.removeTrack(track)
        track.stop()
      })

      if (videoConstraints) {
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints })
          const newVideoTrack = videoStream.getVideoTracks()[0]
          localStream.value.addTrack(newVideoTrack)
        } catch (error) {
          console.error('Ошибка при обновлении видео:', error)
        }
      }

      previousVideoConstraints.value = getConstraintKey(videoConstraints)
    }

    await updateRemoteTracks()
  }

  const updateRemoteTracks = async () => {
    if (!localStream.value) return

    void deviceStore.enumerateDevices()

    // Обходим всех PC
    for (const pc of Object.values(transceivers.value)) {
      if (pc.signalingState === 'closed') {
        continue
      }

      const senders = pc.getSenders()

      for (const track of localStream.value.getTracks()) {
        const existingSender = senders.find(s => s.track === track)

        if (!existingSender) {
          try {
            pc.addTrack(track, localStream.value!)
          } catch (err) {
            console.warn('[updateRemoteTracks] addTrack failed', err)
          }
        }
      }
    }

    // 2) Обновляем SDP
    for (const [remoteId, pc] of Object.entries(transceivers.value)) {
      if (pc.signalingState === 'closed') {
        continue
      }

      if (mySocketId.value > remoteId) {
        // я SLAVE, пропускаем
      } else {
        // я MASTER => doOffer
        if (pc.signalingState === 'stable' && !negotiationInProgress.value) {
          negotiationInProgress.value = true
          console.log('[updateRemoteTracks] MASTER -> doOffer for', remoteId)
          try {
            await doOffer(pc, remoteId)
          } catch (err) {
            console.warn('[updateRemoteTracks] doOffer failed', err)
          } finally {
            negotiationInProgress.value = false
          }
        }
      }
    }

    // Если мы SLAVE
    if (mySocketId.value &&
      Object.keys(transceivers.value).some(id => id < mySocketId.value)) {
      await slaveForceOffer()
    }
  }

  const toggleMic = (state: boolean) => {
    isMicOn.value = state
    if (localStream.value) {
      const track = localStream.value.getAudioTracks()[0]
      if (track) {
        track.enabled = state
        if (!state) {
          updateRemoteTracks()
          startOrUpdateStream()
        }
      }
    }
    if (state) {
      startOrUpdateStream()
    }
  }

  const toggleCam = (state: boolean) => {
    isCamOn.value = state
    if (localStream.value) {
      const track = localStream.value.getVideoTracks()[0]
      if (track) {
        track.enabled = state
        if (!state) {
          updateRemoteTracks()
          startOrUpdateStream()
        }
      }
    }
    if (state) {
      startOrUpdateStream()
    }
  }

  const startOrUpdateStream = async () => {
    await initLocalStream(
      deviceStore.selectedAudioInput,
      deviceStore.selectedVideoInput
    )

    nextTick(() => {
      if (localVideo.value && localStream.value) {
        localVideo.value.srcObject = localStream.value
      }
    })
  };

  watch(() => screenShareStore.stream, async (screen, prev) => {
    let didOffer = false;

    if (screen) {
      for (const [remoteId, pc] of Object.entries(transceivers.value)) {
        if (pc.signalingState === 'closed') {
          console.log(`[startScreenShare] skip PC ${remoteId}, because signalingState=closed`)
          continue
        }

        const sVid = screen.getVideoTracks()[0] || null
        if (sVid) {
          try {
            senders.value.audioTx2 = pc.addTrack(sVid, screen)
          } catch (err) {
            console.warn(`[startScreenShare] addTrack (video) failed:`, err)
          }
        }
        const sAud = screen.getAudioTracks()[0] || null
        if (sAud) {
          try {
            senders.value.videoTx2 = pc.addTrack(sAud, screen)
          } catch (err) {
            console.warn(`[startScreenShare] addTrack (audio) failed:`, err)
          }
        }
      }

      didOffer = true;
    } else {
      if (prev) {
        for (const [remoteId, pc] of Object.entries(transceivers.value)) {
          if (pc.signalingState === 'closed') {
            console.log('[stopScreenShare] skip closed PC remoteId=', remoteId)
            continue
          }
          const sendersList = pc.getSenders()
          prev.getTracks().forEach((track) => {
            const sender = sendersList.find(s => s.track === track)
            if (sender) {
              try {
                pc.removeTrack(sender)
              } catch (err) {
                console.warn('[stopScreenShare] removeTrack fail:', err)
              }
            }
          })
        }
      }

      for (const [remoteId, pc] of Object.entries(transceivers.value)) {
        if (pc.signalingState === 'closed') continue
        if (mySocketId.value < remoteId) {
          if (pc.signalingState === 'stable' && !negotiationInProgress.value) {
            negotiationInProgress.value = true
            console.log('[stopScreenShare] master => doOffer to', remoteId)
            try {
              await doOffer(pc, remoteId)
            } finally {
              negotiationInProgress.value = false
            }
          }
          didOffer = true
        }
      }
    }

    if (!didOffer) {
      console.log('[updateScreenShare] => slaveForceOffer()')
      await slaveForceOffer()
    }
  });

  onBeforeUnmount(() => {
    rtcSocket.value?.disconnect()
    rtcSocket.value = null

    // 2) Закрыть все PeerConnections
    for (const pcObj of Object.values(peerConnections.value)) {
      pcObj.close()
    }

    // 3) Остановить локальные треки (камера/микрофон)
    if (localStream.value) {
      localStream.value.getTracks().forEach(t => t.stop())
      localStream.value = new MediaStream();
    }
  });

  return {
    rtcSocket,
    room,
    localStream,
    remoteStreams,
    isMicOn,
    isCamOn,
    localVideo,

    initSocket,
    joinWebrtcRoom,
    toggleMic,
    toggleCam,
    startOrUpdateStream,
  }
});

import {io, Socket} from 'socket.io-client'

export interface RemoteStreamObj {
  id: string
  socketId: string
  stream: MediaStream
}

export const useWebrtcStore = defineStore('webrtc', () => {
  const screenShareStore = useScreenShareStore();
  const deviceStore = useDeviceStore();
  const localStreamStore = useLocalStreamStore();
  const memberStore = useMemberStore();
  const senderStore = useSenderStore();

  // -------------------
  // State (Composition API refs)
  // -------------------
  const rtcSocket = ref<Socket | null>(null)
  const mySocketId = ref('')
  const room = ref('')
  const remoteStreams = ref<RemoteStreamObj[]>([])
  const peerConnections = ref<Record<string, RTCPeerConnection>>({})

  // У нас в UI <video ref="localVideo" />
  const localVideo = ref<HTMLVideoElement | null>(null)

  // На каждого удалённого: (mic / sysAudio / cam / screen)
  const transceivers = ref<Record<string, RTCPeerConnection>>({})

  const remoteTracks = ref<string[]>([])
  const negotiationInProgress = reactive<Record<string, boolean>>({})
  const pendingCandidate = ref<RTCIceCandidate[]>([]);

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
      users.forEach((u) => {
        createPeerConnection(u.socketId)
        memberStore.join({ id: u.socketId, username: u.username })
      })
    })

    rtcSocket.value.on('user-joined', (data) => {
      const pc = createPeerConnection(data.socketId)
      memberStore.join({ id: data.socketId, username: data.username })

      if (mySocketId.value < data.socketId) {
        if (pc.signalingState === 'stable' && !negotiationInProgress[data.socketId]) {
          negotiationInProgress[data.socketId] = true
          console.log('[user-joined] => doOffer to new user', data.socketId)
          doOffer(pc, data.socketId).finally(() => {
            delete negotiationInProgress[data.socketId]
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
      const socketId = data.socketId
      if (peerConnections.value[socketId]) {
        peerConnections.value[socketId].close()
        delete peerConnections.value[socketId]
      }
      remoteStreams.value = remoteStreams.value.filter((r) => r.socketId !== socketId)
      memberStore.leave(socketId)
    })

    // Запускаем локальный стрим (камера/микрофон) — если хотим "автоматически"
    // (если user сам потом включает кнопкой, можно убрать эту строку)
    updateLocalStreamForRemote()
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

    transceivers.value[remoteId] = pc;

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

      evt.streams.forEach((stream) => {
        stream.onremovetrack = () => {
          removeRemoteStream(stream, remoteId)
        }
        stream.onaddtrack = () => {
          pushRemoteStream(stream, remoteId)
        }
        pushRemoteStream(stream, remoteId)
      });
    }

    pc.onnegotiationneeded = async () => {
      try {
        negotiationInProgress[remoteId] = true;

        const offer = await pc.createOffer()

        await pc.setLocalDescription(offer);

        if (pc.localDescription) {
          rtcSocket.value?.emit('webrtcSignal', {
            room: room.value,
            from: mySocketId.value,
            to: remoteId,
            signalData: { sdp: pc.localDescription }
          })
        }
      } catch (error) {
        console.error('[onnegotiationneeded] process failed:', error);
      } finally {
        delete negotiationInProgress[remoteId];
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

    if (localStreamStore.stream) {
      for (const track of localStreamStore.stream.getTracks()) {
        const sender = pc.addTrack(track, localStreamStore.stream);
        senderStore.save(SenderTypeEnum.default, remoteId, sender);
      }
    }
    if (screenShareStore.stream) {
      screenShareStore.stream.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          pc.addTrack(track, screenShareStore.stream!)
        }
      })
    }

    peerConnections.value[remoteId] = pc;
    return pc
  }

  const pushRemoteStream = (stream: MediaStream, socketId: string) => {
    const found = remoteStreams.value.some(
      (x) => x.socketId === socketId && x.stream.id === stream.id
    );

    if (!found) {
      remoteStreams.value.push({
        id: stream.id,
        stream,
        socketId,
      })
    }
  }

  const removeRemoteStream = (stream: MediaStream, socketId: string) => {
    if (stream.getTracks().length) return

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

    if (pc.signalingState !== 'stable') {
      console.warn(`[doOffer] ABORTING => state changed to ${pc.signalingState} after createOffer, likely glare. Aborting our offer for ${remoteId}.`);
      // Просто выходим. Входящий offer будет обработан в handleSignal -> doAnswer.
      // Можно также установить флаг, что нужно пересогласование позже, если требуется.
      return;
    }

    await pc.setLocalDescription(offer);
    if (pc.localDescription) {
      rtcSocket.value?.emit('webrtcSignal', {
        room: room.value,
        from: mySocketId.value,
        to: remoteId,
        signalData: { sdp: pc.localDescription }
      })
    }
  }

  const doAnswer = async (pc: RTCPeerConnection, remoteId: string) => {
    if (pc.signalingState !== 'have-remote-offer') {
      console.warn('[doAnswer] skip => state=', pc.signalingState)
      return
    }

    console.log('[doAnswer] =>', remoteId)
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer)

    if (pc.localDescription) {
      rtcSocket.value?.emit('webrtcSignal', {
        room: room.value,
        from: mySocketId.value,
        to: remoteId,
        signalData: { sdp: pc.localDescription }
      })
    }
  }

  const handleCandidateSignal = async (pc: RTCPeerConnection, payload: any) => {
    const { from, signalData } = payload;

    try {
      const candidate = new RTCIceCandidate(signalData.candidate);

      console.log('[handleSignal] candidate from=', from)
      if (!pc.localDescription) pendingCandidate.value.push(candidate)
      else await pc.addIceCandidate(candidate)
    } catch (error) {
      console.error('[handleCandidateSignal] add ice candidate failed from=', from, 'remoteDescription=', pc.localDescription, error);
    }
  };

  const handleDescriptionSignal = async (pc: RTCPeerConnection, payload: any) => {
    const { from, signalData } = payload;

    const sdp = new RTCSessionDescription(signalData.sdp);

    if (
      sdp.type === 'offer' &&
      (negotiationInProgress[from] || pc.signalingState !== 'stable') &&
      mySocketId.value < from
    ) {
      console.log('[handleSignal] remote offer skipped from=', from);
      return;
    }

    console.log('[handleSignal] sdp from=', from, 'type=', sdp.type)

    try {
      await pc.setRemoteDescription(sdp);
    } catch (err) {
      console.error('[handleSignal] setRemoteDescription error:', err)
      return
    }

    if (sdp.type === 'offer') {
      console.log('[handleSignal] after setRemoteDescription => state=', pc.signalingState)
      await doAnswer(pc, from);
    }

    try {
      pendingCandidate.value.forEach(pc.addIceCandidate);
      pendingCandidate.value = [];
    } catch (error) {
      console.error('[handleDescriptionSignal] add ice candidate failed from=', from, 'remoteDescription=', pc.localDescription, error);
    }
  };

  const handleSignal = async (payload: any) => {
    const { from, signalData } = payload;
    if (!peerConnections.value[from]) {
      createPeerConnection(from)
    }
    const pc = peerConnections.value[from]

    if (signalData.sdp) {
      await handleDescriptionSignal(pc, payload);
    } else if (signalData.candidate) {
      await handleCandidateSignal(pc, payload);
    }
  }

  // --------------------------------------------------
  // SLAVE: вызвать doOffer, если я хочу отправлять свои треки
  // --------------------------------------------------
  const slaveForceOffer = async () => {
    for (const [remoteId, pc] of Object.entries(transceivers.value)) {
      if (mySocketId.value > remoteId) {
        if (pc.signalingState === 'stable' && !negotiationInProgress[remoteId]) {
          negotiationInProgress[remoteId] = true
          console.log('[slaveForceOffer] => doOffer, me=', mySocketId.value, '->', remoteId)
          await doOffer(pc, remoteId)
          delete negotiationInProgress[remoteId]
        } else {
          console.warn('[slaveForceOffer] skip => state=', pc.signalingState)
        }
      }
    }
  }

  const updateLocalStreamForRemote = async () => {
    if (!localStreamStore.stream) return

    void deviceStore.enumerateDevices()

    // Обходим всех PC
    for (const [remoteId, pc] of Object.entries(transceivers.value)) {
      if (pc.signalingState === 'closed') {
        continue
      }

      const nextAudio = localStreamStore.stream.getAudioTracks()[0];
      const nextVideo = localStreamStore.stream.getVideoTracks()[0];
      const {
        audio: prevAudio,
        video: prevVideo,
      } = senderStore.find(SenderTypeEnum.default, remoteId);

      await Promise.allSettled([
        (async () => {
          if (!localStreamStore.stream) return;

          if (nextAudio && !prevAudio) {
            const sender = pc.addTrack(nextAudio, localStreamStore.stream)
            senderStore.save(SenderTypeEnum.default, remoteId, sender);
          } else if (!nextAudio && prevAudio) {
            senderStore.remove(SenderTypeEnum.default, remoteId, prevAudio);
            pc.removeTrack(prevAudio);
          } else if (nextAudio && prevAudio) {
            await prevAudio.replaceTrack(nextAudio);
          }
        })(),
        (async () => {
          if (!localStreamStore.stream) return;

          if (nextVideo && !prevVideo) {
            const sender = pc.addTrack(nextVideo, localStreamStore.stream)
            senderStore.save(SenderTypeEnum.default, remoteId, sender);
          } else if (!nextVideo && prevVideo) {
            senderStore.remove(SenderTypeEnum.default, remoteId, prevVideo);
            pc.removeTrack(prevVideo);
          } else if (nextVideo && prevVideo) {
            await prevVideo.replaceTrack(nextVideo);
          }
        })(),
      ]);
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
        if (pc.signalingState === 'stable' && !negotiationInProgress[remoteId]) {
          negotiationInProgress[remoteId] = true
          console.log('[_updateRemoteTracks] MASTER -> doOffer for', remoteId)
          try {
            await doOffer(pc, remoteId)
          } catch (err) {
            console.warn('[_updateRemoteTracks] doOffer failed', err)
          } finally {
            delete negotiationInProgress[remoteId]
          }
        } else {
          console.warn('[masterForceOffer] skip => state=', pc.signalingState)
        }
      }
    }

    await slaveForceOffer()
  }

  const updateScreenShareForRemote = async (screen: MediaStream | null, prev: MediaStream | null) => {
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
            const sender = pc.addTrack(sVid, screen);
            senderStore.save(SenderTypeEnum.screen, remoteId, sender);
          } catch (err) {
            console.warn(`[startScreenShare] addTrack (video) failed:`, err)
          }
        }
        const sAud = screen.getAudioTracks()[0] || null
        if (sAud) {
          try {
            const sender = pc.addTrack(sAud, screen);
            senderStore.save(SenderTypeEnum.screen, remoteId, sender);
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
          prev.getTracks().forEach((track) => {
            const sender = senderStore.remove(SenderTypeEnum.screen, remoteId, track);
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
          if (pc.signalingState === 'stable' && !negotiationInProgress[remoteId]) {
            negotiationInProgress[remoteId] = true
            console.log('[stopScreenShare] master => doOffer to', remoteId)
            try {
              await doOffer(pc, remoteId)
            } finally {
              delete negotiationInProgress[remoteId]
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
  };

  watch(localVideo, (element) => {
    if (element && localStreamStore.stream) element.srcObject = localStreamStore.stream;
  });

  watch(() => localStreamStore.constraints, () => {
    updateLocalStreamForRemote();
  }, { deep: true });

  watch(() => screenShareStore.stream, async (screen, prev) => {
    updateScreenShareForRemote(screen, prev);
  });

  onBeforeUnmount(() => {
    rtcSocket.value?.disconnect()
    rtcSocket.value = null

    // 2) Закрыть все PeerConnections
    for (const pcObj of Object.values(peerConnections.value)) {
      pcObj.close()
    }
  });

  return {
    rtcSocket,
    room,
    remoteStreams,
    localVideo,

    initSocket,
    joinWebrtcRoom,
  }
});

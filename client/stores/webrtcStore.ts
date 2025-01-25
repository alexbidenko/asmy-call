import { io, Socket } from 'socket.io-client'

export interface RemoteStreamObj {
  id: string
  socketId: string
  stream: MediaStream
  video: boolean;
  audio: boolean;
}

export const useWebrtcStore = defineStore('webrtc', {
  state: () => ({
    rtcSocket: null as Socket | null,
    mySocketId: '' as string,

    room: '',
    localStream: null as MediaStream | null,
    remoteStreams: [] as RemoteStreamObj[],
    peerConnections: {} as Record<string, RTCPeerConnection>,

    screenStream: null as MediaStream | null,
    isScreenSharing: false,

    // Контролы
    isMicOn: false,
    isCamOn: false,
    isOutputOn: true,

    previousAudioConstraints: null as any,
    previousVideoConstraints: null as any,

    // У нас в UI <video ref="localVideo" />
    localVideo: null as HTMLVideoElement | null,
    localScreen: null as HTMLVideoElement | null,

    // На каждого удалённого: (mic / sysAudio / cam / screen)
    transceivers: {} as Record<
      string,
      {
        pc: RTCPeerConnection
        audioTx1?: RTCRtpTransceiver
        audioTx2?: RTCRtpTransceiver
        videoTx1?: RTCRtpTransceiver
        videoTx2?: RTCRtpTransceiver
      }
    >,
    senders: {} as Record<string, RTCRtpSender>,

    remoteTracks: [] as string[],
    negotiationInProgress: false
  }),

  actions: {
    // --------------------------------------------------
    // initSocket, joinWebrtcRoom
    // --------------------------------------------------
    initSocket(room: string) {
      const config = useRuntimeConfig();

      if (this.rtcSocket) {
        this.rtcSocket.disconnect()
      }
      this.room = room
      this.remoteStreams = []
      this.peerConnections = {}
      this.remoteTracks = []
      this.transceivers = {}

      this.rtcSocket = io(config.public.apiHost || '', { forceNew: true })

      this.rtcSocket.on('connect', () => {
        if (this.rtcSocket) {
          this.mySocketId = this.rtcSocket.id
          console.log('[WebRTC] mySocketId=', this.mySocketId)
        }
      })

      this.rtcSocket.on('existingUsers', (users: { socketId: string; username: string }[]) => {
        const memberStore = useMemberStore()
        users.forEach((u) => {
          this.createPeerConnection(u.socketId)
          memberStore.join({ id: u.socketId, username: u.username })
        })
      })

      this.rtcSocket.on('user-joined', (data) => {
        const memberStore = useMemberStore()
        const pc = this.createPeerConnection(data.socketId)
        memberStore.join({ id: data.socketId, username: data.username })

        // Проверяем, есть ли у нас уже включённая камера/микрофон (localStream) ИЛИ экран (screenStream).
        // Важно не только "exists", но и "tracks действительно активны".
        const localActive = !!(this.localStream && this.localStream.getTracks().some(t => t.enabled));
        // Для screenStream проверяем, что в ней есть треки (например, .readyState === 'live').
        const screenActive = !!(this.screenStream && this.screenStream.getTracks().some(t => t.readyState === 'live'));

        if (localActive || screenActive) {
          // Если я "мастер" (mySocketId < data.socketId) => делаю Offer напрямую
          if (this.mySocketId < data.socketId) {
            if (pc.signalingState === 'stable' && !this.negotiationInProgress) {
              this.negotiationInProgress = true;
              console.log('[user-joined] => doOffer to new user', data.socketId);
              this.doOffer(pc, data.socketId).finally(() => {
                this.negotiationInProgress = false;
              });
            }
          } else {
            // Иначе я "слэйв", делаем slaveForceOffer().
            console.log('[user-joined] => slaveForceOffer for new user', data.socketId);
            this.slaveForceOffer();
          }
        }
      })

      this.rtcSocket.on('webrtcSignal', (payload) => {
        this.handleSignal(payload)
      })

      this.rtcSocket.on('user-left', (data) => {
        const memberStore = useMemberStore()
        const socketId = data.socketId
        if (this.peerConnections[socketId]) {
          this.peerConnections[socketId].close()
          delete this.peerConnections[socketId]
        }
        this.remoteStreams = this.remoteStreams.filter((r) => r.socketId !== socketId)
        memberStore.leave(socketId)
      })
    },

    joinWebrtcRoom() {
      const userStore = useUserStore()
      this.rtcSocket?.emit('joinWebrtcRoom', {
        room: this.room,
        username: userStore.username
      })
    },

    createPeerConnection(remoteId: string) {
      if (this.peerConnections[remoteId]) return this.peerConnections[remoteId]

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })

      this.transceivers[remoteId] = { pc }

      pc.onicecandidate = (evt) => {
        if (evt.candidate) {
          this.rtcSocket?.emit('webrtcSignal', {
            room: this.room,
            from: this.mySocketId,
            to: remoteId,
            signalData: { candidate: evt.candidate }
          })
        }
      }

      pc.oniceconnectionstatechange = () => {
        console.log(`[ICE state] ${this.mySocketId}->${remoteId}:`, pc.iceConnectionState)
      }

      pc.ontrack = (evt) => {
        const track = evt.track
        if (!track) return
        if (this.remoteTracks.includes(track.id)) {
          return
        }
        this.remoteTracks.push(track.id)

        if (evt?.streams[0]) {
          evt.streams[0].onremovetrack = () => {
            this.removeRemoteStream(evt.streams[0], remoteId)
          };
          evt.streams[0].onaddtrack = () => {
            this.pushRemoteStream(evt.streams[0], remoteId)
          };
          this.pushRemoteStream(evt.streams[0], remoteId)
        }
      }

      // onnegotiationneeded => Только если я "мастер" (mySocketId < remoteId)
      pc.onnegotiationneeded = async () => {
        if (this.mySocketId >= remoteId) {
          console.log('[onnegotiationneeded] skip => I am slave for', remoteId)
          return
        }
        if (this.negotiationInProgress) {
          console.log('[onnegotiationneeded] skip => negotiationInProgress=true')
          return
        }
        if (pc.signalingState !== 'stable') {
          console.log('[onnegotiationneeded] skip => state=', pc.signalingState)
          return
        }

        this.negotiationInProgress = true
        try {
          console.log('[onnegotiationneeded => doOffer]', this.mySocketId, '->', remoteId)
          await this.doOffer(pc, remoteId)
        } finally {
          this.negotiationInProgress = false
        }
      }

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState
        if (state === 'closed' || state === 'failed') {
          console.log(`[oniceconnectionstatechange] => state=${state}, cleaning up remoteId=${remoteId}`)
          // Закрываем PC, убираем из peerConnections
          pc.close()
          delete this.peerConnections[remoteId]
          // Возможно, удаляем this.transceivers[remoteId], и чистим remoteStreams
          this.remoteStreams = this.remoteStreams.filter(r => r.socketId !== remoteId)
        }
      }

      if (this.localStream) {
        // например, если camera/mic уже включены:
        this.localStream.getTracks().forEach(track => {
          if (track.enabled) {
            pc.addTrack(track, this.localStream!)
          }
        })
      }
      // если у вас screenStream есть, тоже добавим:
      if (this.isScreenSharing && this.screenStream) {
        this.screenStream.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            pc.addTrack(track, this.screenStream!)
          }
        })
      }

      this.peerConnections[remoteId] = pc
      return pc
    },

    pushRemoteStream(stream: MediaStream, socketId: string) {
      const found = this.remoteStreams.find(
        (x) => x.socketId === socketId && x.stream.id === stream.id
      )
      if (!found) {
        this.remoteStreams.push({
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
    },

    removeRemoteStream(stream: MediaStream, socketId: string) {
      if (stream.getTracks().length) {
        const found = this.remoteStreams.find(
          (x) => x.socketId === socketId && x.stream.id === stream.id
        );

        if (found) {
          found.audio = !!stream.getAudioTracks().length
          found.video = !!stream.getVideoTracks().length
        }

        return;
      }

      this.remoteStreams = this.remoteStreams.filter(
        (x) => !(x.socketId === socketId && x.stream.id === stream.id)
      )
    },

    // --------------------------------------------------
    // Offer / Answer / HandleSignal
    // --------------------------------------------------
    async doOffer(pc: RTCPeerConnection, remoteId: string) {
      if (pc.signalingState !== 'stable') {
        console.warn('[doOffer] skip => state=', pc.signalingState)
        return
      }
      console.log('[doOffer] =>', remoteId)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.rtcSocket?.emit('webrtcSignal', {
        room: this.room,
        from: this.mySocketId,
        to: remoteId,
        signalData: { sdp: pc.localDescription }
      })
    },

    async doAnswer(pc: RTCPeerConnection, remoteId: string) {
      if (pc.signalingState !== 'have-remote-offer') {
        console.warn('[doAnswer] skip => state=', pc.signalingState)
        return
      }
      console.log('[doAnswer] =>', remoteId)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.rtcSocket?.emit('webrtcSignal', {
        room: this.room,
        from: this.mySocketId,
        to: remoteId,
        signalData: { sdp: pc.localDescription }
      })
    },

    async handleSignal(payload: any) {
      const { from, signalData } = payload
      if (!this.peerConnections[from]) {
        this.createPeerConnection(from)
      }
      const pc = this.peerConnections[from]

      if (signalData.sdp) {
        console.log('[handleSignal] sdp from=', from, 'type=', signalData.sdp.type)
        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp))
        console.log('[handleSignal] after setRemoteDescription => state=', pc.signalingState)
        if (signalData.sdp.type === 'offer') {
          // Я slave => делаю Answer
          await this.doAnswer(pc, from)
        }
      } else if (signalData.candidate) {
        console.log('[handleSignal] candidate from=', from)
        await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate))
      }
    },

    // --------------------------------------------------
    // SLAVE: вызвать doOffer, если я хочу отправлять свои треки
    // --------------------------------------------------
    async slaveForceOffer() {
      // Я (slave) хочу инициировать Offer для каждого PC, где (mySocketId > remoteId)
      // чтобы мастер получил мои новые треки
      for (const [remoteId, { pc }] of Object.entries(this.transceivers)) {
        if (this.mySocketId > remoteId) {
          if (pc.signalingState === 'stable' && !this.negotiationInProgress) {
            this.negotiationInProgress = true
            console.log('[slaveForceOffer] => doOffer, me=', this.mySocketId, '->', remoteId)
            await this.doOffer(pc, remoteId)
            this.negotiationInProgress = false
          } else {
            console.log('[slaveForceOffer] skip => state=', pc.signalingState)
          }
        }
      }
    },

    // --------------------------------------------------
    // Локальный стрим: кам+мик
    // --------------------------------------------------
    async initLocalStream(audioDevId?: string, videoDevId?: string) {
      const audioConstraints = this.isMicOn
        ? (audioDevId && audioDevId !== 'default')
          ? { deviceId: { exact: audioDevId } }
          : true
        : false;

      const videoConstraints = this.isCamOn
        ? (videoDevId && videoDevId !== 'default')
          ? { deviceId: { exact: videoDevId } }
          : true
        : false;

      if (!this.localStream) {
        // Если localStream еще не инициализирован, создаем его полностью
        if (!audioConstraints && !videoConstraints) return;

        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: videoConstraints
        });

        this.updateRemoteTracks();
        return;
      }

      const getConstraintKey = (constraint: any) => typeof constraint === 'boolean' ? constraint : constraint.deviceId.exact;

      // Если localStream уже существует, обновляем только необходимые треки

      // Обработка аудио
      if (getConstraintKey(audioConstraints) !== this.previousAudioConstraints) {
        const audioTracks = this.localStream.getAudioTracks();
        audioTracks.forEach(track => {
          this.localStream.removeTrack(track);
          track.stop();
        });

        if (audioConstraints) {
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            const newAudioTrack = audioStream.getAudioTracks()[0];
            this.localStream.addTrack(newAudioTrack);
          } catch (error) {
            console.error('Ошибка при обновлении аудио:', error);
          }
        }

        this.previousAudioConstraints = getConstraintKey(audioConstraints);
      }

      // Обработка видео
      if (getConstraintKey(videoConstraints) !== this.previousVideoConstraints) {
        const videoTracks = this.localStream.getVideoTracks();
        videoTracks.forEach(track => {
          this.localStream.removeTrack(track);
          track.stop();
        });

        if (videoConstraints) {
          try {
            const videoStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
            const newVideoTrack = videoStream.getVideoTracks()[0];
            this.localStream.addTrack(newVideoTrack);
          } catch (error) {
            console.error('Ошибка при обновлении видео:', error);
          }
        }

        this.previousVideoConstraints = getConstraintKey(videoConstraints);
      }

      this.updateRemoteTracks();
    },

    async updateRemoteTracks() {
      if (!this.localStream) return;

      // Обходим всех PC (peerConnections)
      for (const [remoteId, { pc }] of Object.entries(this.transceivers)) {
        // Если PC уже закрыт (например, пользователь вышел), пропускаем
        if (pc.signalingState === 'closed') {
          continue;
        }

        // Получаем все senders в текущем PC
        const senders = pc.getSenders();

        // 1) Синхронизируем треки
        for (const track of this.localStream.getTracks()) {
          // Ищем, есть ли уже sender с этим track
          const existingSender = senders.find(s => s.track === track);

          if (!track.enabled) {
            // Трек "выключен" – если он уже есть в PC, удаляем
            if (existingSender) {
              try {
                pc.removeTrack(existingSender);
              } catch (err) {
                console.warn(`[updateRemoteTracks] removeTrack failed`, err);
              }
            }
          } else {
            // Трек "включен"
            // Если sender уже существует – ничего не делаем
            if (!existingSender) {
              try {
                pc.addTrack(track, this.localStream!);
              } catch (err) {
                console.warn(`[updateRemoteTracks] addTrack failed`, err);
              }
            }
          }
        }
      }

      // 2) Обновляем SDP
      //   - Если мы SLAVE, дергаем slaveForceOffer() (чтобы мастер увидел наши новые треки)
      //   - Если мы MASTER, делаем doOffer() сами.
      for (const [remoteId, { pc }] of Object.entries(this.transceivers)) {
        if (pc.signalingState === 'closed') {
          continue;
        }

        if (this.mySocketId > remoteId) {
          // я SLAVE => slaveForceOffer (уже есть логика, пробежится по всем slavePC)
          // Не вызываем doOffer для каждого PC, а один общий вызов в конце
          continue;
        } else {
          // я MASTER => делаем Offer напрямую, если stable, без переговоров
          if (pc.signalingState === 'stable' && !this.negotiationInProgress) {
            this.negotiationInProgress = true;
            console.log('[updateRemoteTracks] MASTER -> doOffer for', remoteId);
            try {
              await this.doOffer(pc, remoteId);
            } catch (err) {
              console.warn('[updateRemoteTracks] doOffer failed', err);
            } finally {
              this.negotiationInProgress = false;
            }
          }
        }
      }

      // Если мы SLAVE – одним общим вызовом обновляем SDP у всех PC, где mySocketId>remoteId
      if (this.mySocketId && Object.keys(this.transceivers).some(id => id < this.mySocketId)) {
        // вызываем slaveForceOffer (он сам внутри пробежится по PC)
        await this.slaveForceOffer();
      }
    },

    toggleMic(state: boolean) {
      this.isMicOn = state
      if (this.localStream) {
        const track = this.localStream.getAudioTracks()[0]
        if (track) {
          track.enabled = state
          if (!state) {
            this.updateRemoteTracks()
            this.startOrUpdateStream()
          }
        }
      }

      if (state) {
        this.startOrUpdateStream()
      }
    },

    toggleCam(state: boolean) {
      this.isCamOn = state
      if (this.localStream) {
        const track = this.localStream.getVideoTracks()[0]
        if (track) {
          track.enabled = state
          if (!state) {
            this.updateRemoteTracks()
            this.startOrUpdateStream()
          }
        }
      }

      if (state) {
        this.startOrUpdateStream()
      }
    },

    async startOrUpdateStream() {
      const devicesStore = useDeviceStore()
      await this.initLocalStream(
        devicesStore.selectedAudioInput,
        devicesStore.selectedVideoInput
      )
      devicesStore.saveToStorage()

      nextTick(() => {
        if (this.localVideo && this.localStream) {
          this.localVideo.srcObject = this.localStream
        }
      });
    },

    // --------------------------------------------------
    // Шеринг экрана (screen + sysAudio)
    // --------------------------------------------------
    async startScreenShare() {
      if (this.isScreenSharing) return

      // 1) Запрашиваем screen + audio
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })

      // 2) Останавливаем предыдущее, если нужно
      this.stopScreenShare()

      // 3) Сохраняем новый screenStream
      this.screenStream = screen
      this.isScreenSharing = true

      // 4) Добавляем треки screenStream в каждый PC (только если PC не "closed")
      for (const [remoteId, { pc }] of Object.entries(this.transceivers)) {
        if (pc.signalingState === 'closed') {
          console.log(`[startScreenShare] skip PC ${remoteId}, because signalingState=closed`)
          continue
        }

        // screenVideo (videoTracks[0])
        const sVid = screen.getVideoTracks()[0] || null
        if (sVid) {
          try {
            this.senders.audioTx2 = pc.addTrack(sVid, screen)
          } catch (err) {
            console.warn(`[startScreenShare] addTrack (video) failed:`, err)
          }
        }

        // screenAudio (audioTracks[0])
        const sAud = screen.getAudioTracks()[0] || null
        if (sAud) {
          try {
            this.senders.videoTx2 = pc.addTrack(sAud, screen)
          } catch (err) {
            console.warn(`[startScreenShare] addTrack (audio) failed:`, err)
          }
        }
      }

      // 5) Если пользователь закроет screen, ловим onended
      const vidTrack = screen.getVideoTracks()[0]
      if (vidTrack) {
        vidTrack.onended = () => {
          this.stopScreenShare()
        }
      }

      // 6) Показываем локально
      nextTick(() => {
        if (this.localScreen && this.screenStream) {
          this.localScreen.srcObject = this.screenStream
        }
      });

      // 7) Если я SLAVE => doOffer, чтобы мастер увидел
      await this.slaveForceOffer()
    },

    async stopScreenShare() {
      // Если экран не расшарен, ничего не делаем
      if (!this.isScreenSharing || !this.screenStream) return;

      // Сначала удаляем локальные треки экрана из каждого PC
      for (const [remoteId, { pc }] of Object.entries(this.transceivers)) {
        // Пропускаем закрытый PC
        if (pc.signalingState === 'closed') {
          console.log('[stopScreenShare] skip closed PC remoteId=', remoteId);
          continue;
        }

        // Берём текущие senders
        const senders = pc.getSenders();

        // Удаляем senders, соответствующие трекам screenStream
        this.screenStream.getTracks().forEach((track) => {
          const sender = senders.find(s => s.track === track);
          if (sender) {
            try {
              pc.removeTrack(sender);
            } catch (err) {
              console.warn('[stopScreenShare] removeTrack fail:', err);
            }
          }
        });
      }

      // Останавливаем локально треки экрана
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
      this.isScreenSharing = false;

      // Теперь делаем ренеготиацию:
      // - если мы "мастер" => doOffer
      // - если мы "slave" => slaveForceOffer()
      let didOffer = false;
      for (const [remoteId, { pc }] of Object.entries(this.transceivers)) {
        if (pc.signalingState === 'closed') continue;

        if (this.mySocketId < remoteId) {
          // Я мастер
          if (pc.signalingState === 'stable' && !this.negotiationInProgress) {
            this.negotiationInProgress = true;
            console.log('[stopScreenShare] master => doOffer to', remoteId);
            try {
              await this.doOffer(pc, remoteId);
            } finally {
              this.negotiationInProgress = false;
            }
          }
          didOffer = true;
        }
      }

      // Если ни одному PC не сделали Offer (мы slave для всех), делаем slaveForceOffer
      if (!didOffer) {
        console.log('[stopScreenShare] => slaveForceOffer()');
        await this.slaveForceOffer();
      }

      // (По итогу удалённые участники при получении новой SDP
      //  "выкинут" трек со своей стороны → исчезнет «зависший» кадр.)
    },
  }
})

import { io, Socket } from 'socket.io-client'

export interface RemoteStreamObj {
  id: string
  socketId: string
  stream: MediaStream
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
    isInCall: false,

    // У нас в UI <video ref="localVideo" />
    localVideo: null as HTMLVideoElement | null,

    // На каждого удалённого: (mic / sysAudio / cam / screen)
    transceivers: {} as Record<
      string,
      {
        pc: RTCPeerConnection
        audioTx1: RTCRtpTransceiver
        audioTx2: RTCRtpTransceiver
        videoTx1: RTCRtpTransceiver
        videoTx2: RTCRtpTransceiver
      }
    >,

    remoteTracks: [] as string[],
    negotiationInProgress: false
  }),

  actions: {
    // --------------------------------------------------
    // initSocket, joinWebrtcRoom
    // --------------------------------------------------
    initSocket(room: string) {
      if (this.rtcSocket) {
        this.rtcSocket.disconnect()
      }
      this.room = room
      this.remoteStreams = []
      this.peerConnections = {}
      this.remoteTracks = []
      this.transceivers = {}

      this.rtcSocket = io('http://localhost:4000', { forceNew: true })

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
        this.createPeerConnection(data.socketId)
        memberStore.join({ id: data.socketId, username: data.username })
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

    // --------------------------------------------------
    // createPeerConnection: 4 слота
    // --------------------------------------------------
    createPeerConnection(remoteId: string) {
      if (this.peerConnections[remoteId]) return this.peerConnections[remoteId]

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })

      // 4 слота в одном порядке
      const audioTx1 = pc.addTransceiver('audio', { direction: 'sendrecv' }) // микрофон
      const audioTx2 = pc.addTransceiver('audio', { direction: 'sendrecv' }) // системный звук
      const videoTx1 = pc.addTransceiver('video', { direction: 'sendrecv' }) // камера
      const videoTx2 = pc.addTransceiver('video', { direction: 'sendrecv' }) // экран

      this.transceivers[remoteId] = { pc, audioTx1, audioTx2, videoTx1, videoTx2 }

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

        if (evt.streams && evt.streams[0]) {
          this.pushRemoteStream(evt.streams[0], remoteId)
        } else {
          const newStream = new MediaStream([track])
          this.pushRemoteStream(newStream, remoteId)
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

      this.peerConnections[remoteId] = pc
      return pc
    },

    pushRemoteStream(stream: MediaStream, socketId: string) {
      const found = this.remoteStreams.find(
        (x) => x.socketId === socketId && x.stream.id === stream.id
      )
      if (!found) {
        this.remoteStreams.push({ id: stream.id, stream, socketId })
      }
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
          ? { deviceId: audioDevId }
          : true
        : false

      const videoConstraints = this.isCamOn
        ? (videoDevId && videoDevId !== 'default')
          ? { deviceId: videoDevId }
          : true
        : false

      if (!audioConstraints && !videoConstraints) {
        if (this.localStream) {
          this.localStream.getTracks().forEach((t) => t.stop())
          this.localStream = null
        }
        this.isInCall = false
        return
      }

      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop())
        this.localStream = null
      }

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: videoConstraints
      })

      for (const [remoteId, { audioTx1, videoTx1 }] of Object.entries(this.transceivers)) {
        const mic = this.localStream.getAudioTracks()[0] || null
        await audioTx1.sender.replaceTrack(mic)

        const cam = this.localStream.getVideoTracks()[0] || null
        await videoTx1.sender.replaceTrack(cam)
      }

      this.isInCall = true
    },

    toggleMic(state: boolean) {
      this.isMicOn = state
      if (this.localStream) {
        const track = this.localStream.getAudioTracks()[0]
        if (track) {
          track.enabled = state
        } else if (state) {
          this.startOrUpdateStream()
        }
      } else if (state) {
        this.startOrUpdateStream()
      }
    },

    toggleCam(state: boolean) {
      this.isCamOn = state
      if (this.localStream) {
        const track = this.localStream.getVideoTracks()[0]
        if (track) {
          track.enabled = state
        } else if (state) {
          this.startOrUpdateStream()
        }
      } else if (state) {
        this.startOrUpdateStream()
      }
    },

    async startOrUpdateStream() {
      const devicesStore = useDeviceStore()
      await this.initLocalStream(
        devicesStore.selectedAudioInput,
        devicesStore.selectedVideoInput
      )
      if (this.localVideo && this.localStream) {
        this.localVideo.srcObject = this.localStream
      }
      devicesStore.saveToStorage()

      // Если я = SLAVE, тоже делаю Offer => чтобы мастер увидел мои новые треки
      // (если mySocketId > remoteId => doOffer)
      await this.slaveForceOffer()
    },

    // --------------------------------------------------
    // Шеринг экрана (screen + sysAudio)
    // --------------------------------------------------
    async startScreenShare() {
      if (this.isScreenSharing) return
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      })
      this.screenStream = screen
      this.isScreenSharing = true

      for (const [remoteId, { audioTx2, videoTx2 }] of Object.entries(this.transceivers)) {
        const sVid = screen.getVideoTracks()[0] || null
        await videoTx2.sender.replaceTrack(sVid)

        const sAud = screen.getAudioTracks()[0] || null
        await audioTx2.sender.replaceTrack(sAud)
      }

      const vidTrack = screen.getVideoTracks()[0]
      if (vidTrack) {
        vidTrack.onended = () => {
          this.stopScreenShare()
        }
      }

      // Если я = SLAVE => делаю Offer
      await this.slaveForceOffer()
    },

    stopScreenShare() {
      if (!this.isScreenSharing || !this.screenStream) return
      this.screenStream.getTracks().forEach((t) => t.stop())
      this.screenStream = null
      this.isScreenSharing = false

      for (const [remoteId, { audioTx2, videoTx2 }] of Object.entries(this.transceivers)) {
        audioTx2.sender.replaceTrack(null)
        videoTx2.sender.replaceTrack(null)
      }

      // Если я = SLAVE => делаю Offer
      this.slaveForceOffer()
    },
  }
})

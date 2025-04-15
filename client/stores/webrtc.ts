import { type Socket, io } from 'socket.io-client'

export type RemoteStreamObj = {
  id: string;
  socketId: string;
  stream: MediaStream;
};

export const useWebrtcStore = defineStore('webrtc', () => {
  const screenShareStore = useScreenShareStore();
  const deviceStore = useDeviceStore();
  const localStreamStore = useLocalStreamStore();
  const memberStore = useMemberStore();
  const senderStore = useSenderStore();
  const roomStore = useRoomStore();

  // -------------------
  // State (Composition API refs)
  // -------------------
  const rtcSocket = ref<Socket | null>(null)
  const mySocketId = ref('')
  const remoteStreams = ref<RemoteStreamObj[]>([])
  const peerConnections = ref<Record<string, RTCPeerConnection>>({})

  // У нас в UI <video ref="localVideo" />
  const localVideo = ref<HTMLVideoElement | null>(null)

  // На каждого удалённого: (mic / sysAudio / cam / screen)
  const transceivers = ref<Record<string, RTCPeerConnection>>({})

  // Объект для хранения очередей переговоров по каждому remoteId в виде цепочки Promise
  const negotiationQueues = reactive<Record<string, Promise<void>>>({});
  const pendingCandidate = ref<RTCIceCandidate[]>([]);

  // --------------------------------------------------
  // initSocket, joinWebrtcRoom
  // --------------------------------------------------
  const initSocket = () => {
    const config = useRuntimeConfig()

    rtcSocket.value?.disconnect();
    remoteStreams.value = [];
    peerConnections.value = {};
    transceivers.value = {};

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

    rtcSocket.value.on('user-joined', async (data) => {
      const pc = createPeerConnection(data.socketId);
      memberStore.join({ id: data.socketId, username: data.username });

      if (mySocketId.value < data.socketId) {
        if (pc.signalingState === 'stable') {
          console.log('[user-joined] => doOffer to new user', data.socketId);
          await enqueueNegotiation(data.socketId, pc);
        }
      } else {
        console.log('[user-joined] => slaveForceOffer for new user', data.socketId);
        await slaveForceOffer();
      }
    })

    rtcSocket.value.on('webrtcSignal', (payload) => {
      handleSignal(payload);
    });

    rtcSocket.value.on('user-left', (data) => {
      if (peerConnections.value[data.socketId]) {
        peerConnections.value[data.socketId].close();
        delete peerConnections.value[data.socketId];
      }
      remoteStreams.value = remoteStreams.value.filter((r) => r.socketId !== data.socketId);
      memberStore.leave(data.socketId);
    })

    // Запускаем локальный стрим (камера/микрофон) — если хотим "автоматически"
    // (если user сам потом включает кнопкой, можно убрать эту строку)
    updateLocalStream();
  }

  const joinWebrtcRoom = () => {
    const userStore = useUserStore()
    rtcSocket.value?.emit('joinWebrtcRoom', {
      room: roomStore.room,
      username: userStore.username
    });
  }

  const sendSignal = (remoteId: string, data: any) => {
    rtcSocket.value?.emit('webrtcSignal', {
      room: roomStore.room,
      from: mySocketId.value,
      to: remoteId,
      signalData: data,
    });
  };

  const cleanupPeerConnection = (remoteId: string, pc: RTCPeerConnection) => {
    try {
      pc.close();
    } catch (error) {
      console.error(`[cleanupPeerConnection] Ошибка при закрытии соединения с ${remoteId}:`, error);
    }

    delete peerConnections.value[remoteId];
    remoteStreams.value = remoteStreams.value.filter((r) => r.socketId !== remoteId);
  };

  const createPeerConnection = (remoteId: string) => {
    if (peerConnections.value[remoteId]) return peerConnections.value[remoteId];

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    transceivers.value[remoteId] = pc;

    pc.onicecandidate = (evt) => {
      if (evt.candidate) sendSignal(remoteId, { candidate: evt.candidate.toJSON() });
    }

    pc.ontrack = (event) => {
      const track = event.track;
      if (!track) return;

      event.streams.forEach((stream) => {
        stream.onremovetrack = () => {
          removeRemoteStream(stream, remoteId);
        }
        stream.onaddtrack = () => {
          pushRemoteStream(stream, remoteId);
        }
        pushRemoteStream(stream, remoteId);
      });
    }

    pc.onnegotiationneeded = async () => {
      try {
        await enqueueNegotiation(remoteId, pc);
      } catch (error) {
        console.error('[onnegotiationneeded] process failed:', error);
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[ICE State] ${pc.iceConnectionState} для remoteId=${remoteId}`);

      if (['failed', 'closed', 'disconnected'].includes(pc.iceConnectionState)) {
        console.warn(`[ICE State] Состояние '${pc.iceConnectionState}' обнаружено для remoteId=${remoteId}, выполняется очистка.`);
        cleanupPeerConnection(remoteId, pc);
      }
    }

    // Обработчик изменения общего состояния соединения
    pc.onconnectionstatechange = () => {
      console.log(`[Connection State] ${pc.connectionState} для remoteId=${remoteId}`);

      if (['failed', 'closed'].includes(pc.connectionState)) {
        console.warn(`[Connection State] Состояние '${pc.connectionState}' обнаружено для remoteId=${remoteId}, выполняется очистка.`);
        cleanupPeerConnection(remoteId, pc);
      }
    };

    // Обработчик изменения signaling state
    pc.onsignalingstatechange = () => {
      console.log(`[Signaling State] ${pc.signalingState} для remoteId=${remoteId}`);

      if (['closed'].includes(pc.signalingState)) {
        console.warn(`[Signaling State] Состояние 'closed' обнаружено для remoteId=${remoteId}, выполняется очистка.`);
        cleanupPeerConnection(remoteId, pc);
      }
    };

    (async () => {
      await updateLocalStreamForRemote(remoteId, pc);
      await updateScreenShareForRemote(remoteId, pc, screenShareStore.stream, null);
      await updateStreamSdpForRemote(remoteId, pc);
    })();

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

  const handleLocalDescription = async (pc: RTCPeerConnection, remoteId: string) => {
    await pc.setLocalDescription();

    if (pc.localDescription) sendSignal(remoteId, { sdp: pc.localDescription });
  };

  // Функция для выполнения переговоров с экспоненциальным backoff.
  // Если попытка неудачна, происходит повторный вызов с задержкой,
  // вычисляемой как min(baseDelay * 2^(attempts - 1), maxDelay).
  const negotiateWithBackoff = async (
    remoteId: string,
    peerConnection: RTCPeerConnection,
    maxAttempts = 5,
    baseDelay = 500, // базовая задержка в миллисекундах
    maxDelay = 5000, // максимальная задержка в миллисекундах
  ) => {
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        // Попытка установить локальное описание и отправить его через сигналинг
        await handleLocalDescription(peerConnection, remoteId);
        console.log(`[negotiateWithBackoff] Negotiation succeeded for remoteId=${remoteId} on attempt ${attempts + 1}`);
        return;
      } catch (error) {
        attempts++;
        // Вычисляем задержку с экспоненциальным backoff, но с ограничением по maxDelay
        const delay = Math.min(baseDelay * Math.pow(2, attempts - 1), maxDelay);
        console.warn(`[negotiateWithBackoff] Attempt ${attempts} failed for remoteId=${remoteId}. Retrying in ${delay} ms`, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    console.error(`[negotiateWithBackoff] Negotiation failed after ${maxAttempts} attempts for remoteId=${remoteId}`);
  };

  // Функция для добавления переговорной задачи в очередь для заданного remoteId.
  // Если для remoteId уже есть запущенная задача, новая задача будет выполнена после завершения предыдущей.
  const enqueueNegotiation = (remoteId: string, peerConnection: RTCPeerConnection) => {
    // Задача переговорам представлена функцией, которая возвращает Promise
    const negotiationTask = () => negotiateWithBackoff(remoteId, peerConnection);

    // Если очередь для данного remoteId отсутствует, запускаем задачу сразу
    if (!negotiationQueues[remoteId]) {
      negotiationQueues[remoteId] = negotiationTask();
    } else {
      // Если очередь уже существует, добавляем новую задачу к цепочке,
      // при этом сбрасываем ошибку предыдущей задачи, чтобы цепочка не оборвалась
      negotiationQueues[remoteId] = negotiationQueues[remoteId]
        .catch(() => {})
        .then(() => negotiationTask());
    }

    return negotiationQueues[remoteId];
  };

  const addIceCandidateWithRetry = async (
    pc: RTCPeerConnection,
    candidate: RTCIceCandidateInit,
    maxAttempts = 5,
    baseDelay = 1000
  ) => {
    let attempts = 0;
    while (attempts < maxAttempts) {
      try {
        await pc.addIceCandidate(candidate);
        console.log(`[addIceCandidateWithRetry] Кандидат успешно добавлен на попытке ${attempts + 1}`);
        return;
      } catch (error) {
        attempts++;
        console.warn(
          `[addIceCandidateWithRetry] Ошибка добавления кандидата, попытка ${attempts}:`,
          error
        );
        // Экспоненциальная задержка
        await new Promise((resolve) => setTimeout(resolve, baseDelay * attempts));
      }
    }
    console.error(
      `[addIceCandidateWithRetry] Не удалось добавить кандидата после ${maxAttempts} попыток`
    );
  };

  const handleCandidateSignal = async (pc: RTCPeerConnection, payload: any) => {
    const { from, signalData } = payload;

    try {
      console.log('[handleSignal] candidate from=', from)
      if (!pc.remoteDescription) pendingCandidate.value.push(signalData.candidate)
      else await addIceCandidateWithRetry(pc, signalData.candidate);
    } catch (error) {
      console.error('[handleCandidateSignal] add ice candidate failed from=', from, 'remoteDescription=', pc.localDescription, error);
    }
  };

  const handleDescriptionSignal = async (pc: RTCPeerConnection, payload: any) => {
    const { from, signalData } = payload;
    const sdpDescription = new RTCSessionDescription(signalData.sdp);

    // Если получен ответ (answer) и соединение уже стабильно, скорее всего это дубликат – игнорируем его.
    if (sdpDescription.type === 'answer' && pc.signalingState === 'stable') {
      console.warn('[handleSignal] Received answer in stable state from=', from, '. Ignoring duplicate answer.');
      return;
    }

    // Если получен offer, но PeerConnection не стабильный и вы являетесь мастером (mySocketId < from),
    // то пропускаем такой offer, чтобы избежать конфликтов renegotiation.
    if (
      sdpDescription.type === 'offer' &&
      pc.signalingState !== 'stable' &&
      mySocketId.value < from
    ) {
      console.log('[handleSignal] Remote offer skipped from=', from);
      return;
    }

    console.log('[handleSignal] SDP received from=', from, 'type=', sdpDescription.type);

    try {
      await pc.setRemoteDescription(sdpDescription);
    } catch (error) {
      console.error('[handleSignal] setRemoteDescription error:', error);
      return;
    }

    // Если это offer, генерируем answer
    if (sdpDescription.type === 'offer') {
      console.log('[handleSignal] After setRemoteDescription, state=', pc.signalingState);
      await handleLocalDescription(pc, from);
    }

    const candidatesToProcess = [...pendingCandidate.value];
    pendingCandidate.value = [];

    const results = await Promise.allSettled(
      candidatesToProcess.map((candidate) => addIceCandidateWithRetry(pc, candidate))
    );
    const errors = results.filter((res) => res.status === 'rejected');

    if (errors.length) {
      console.error('[handleDescriptionSignal] add pending ICE candidate errors:', errors);
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
        if (pc.signalingState === 'stable') {
          console.log('[slaveForceOffer] => doOffer, me=', mySocketId.value, '->', remoteId)
          await enqueueNegotiation(remoteId, pc);
        } else {
          console.warn('[slaveForceOffer] skip => state=', pc.signalingState)
        }
      }
    }
  }

  const updateLocalStreamForRemote = async (remoteId: string, pc: RTCPeerConnection) => {
    if (!localStreamStore.stream) return

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
    ]).then((result) => {
      const errors = result.filter((el) => el.status === 'rejected');
      if (errors.length) console.error('[updateLocalStreamForRemote] update stream for remote=', remoteId, 'errors:', errors);
    });
  };

  const updateStreamSdpForRemote = async (remoteId: string, pc: RTCPeerConnection) => {
    if (pc.signalingState === 'stable') {
      console.log('[_updateRemoteTracks] MASTER -> doOffer for', remoteId)
      await enqueueNegotiation(remoteId, pc);
    } else {
      console.warn('[masterForceOffer] skip => state=', pc.signalingState)
    }
  }

  const updateLocalStream = async () => {
    if (!localStreamStore.stream) return;

    // Обновляем список устройств
    void deviceStore.enumerateDevices();

    // Обновляем стрим для каждого удалённого соединения
    await Promise.allSettled(
      Object.entries(transceivers.value).map(async ([remoteId, pc]) => {
        if (pc.signalingState === 'closed') return;
        // При наличии нового потока проверяем, можем ли заменить трек
        await updateLocalStreamForRemote(remoteId, pc);
      })
    ).then((result) => {
      const errors = result.filter((el) => el.status === 'rejected');
      if (errors.length) console.error('[updateLocalStream] update stream for remote errors:', errors);
    });

    // Явно инициируем процесс renegotiation для мастера
    await Promise.allSettled(
      Object.entries(transceivers.value).map(async ([remoteId, pc]) => {
        if (pc.signalingState === 'closed') return;
        if (mySocketId.value > remoteId) {
          // Для SLAVE можно не обновлять, если это не требуется
        } else {
          // Для мастера инициируем negotiation через очередь
          await enqueueNegotiation(remoteId, pc);
        }
      })
    ).then((result) => {
      const errors = result.filter((el) => el.status === 'rejected');
      if (errors.length) console.error('[updateLocalStream] update stream sdp for remote errors:', errors);
    });

    // Если нужно, можно также инициировать renegotiation для SLAVE-стороны
    await slaveForceOffer();
  };

  const updateScreenShareForRemote = async (remoteId: string, pc: RTCPeerConnection, screen: MediaStream | null, prev: MediaStream | null) => {
    if (screen) {
      const sVid = screen.getVideoTracks()[0] || null
      if (sVid) {
        try {
          const sender = pc.addTrack(sVid, screen);
          senderStore.save(SenderTypeEnum.screen, remoteId, sender);
        } catch (error) {
          console.warn(`[startScreenShare] addTrack (video) failed:`, error)
        }
      }
      const sAud = screen.getAudioTracks()[0] || null
      if (sAud) {
        try {
          const sender = pc.addTrack(sAud, screen);
          senderStore.save(SenderTypeEnum.screen, remoteId, sender);
        } catch (error) {
          console.warn(`[startScreenShare] addTrack (audio) failed:`, error)
        }
      }
    } else {
      if (prev) {
        prev.getTracks().forEach((track) => {
          const sender = senderStore.remove(SenderTypeEnum.screen, remoteId, track);
          if (sender) {
            try {
              pc.removeTrack(sender)
            } catch (error) {
              console.warn('[stopScreenShare] removeTrack fail:', error)
            }
          }
        })
      }

      if (mySocketId.value < remoteId) {
        if (pc.signalingState === 'stable') {
          console.log('[stopScreenShare] master => doOffer to', remoteId)
          await enqueueNegotiation(remoteId, pc);
        }
      }
    }
  };

  const updateScreenShare = async (screen: MediaStream | null, prev: MediaStream | null) => {
    for (const [remoteId, pc] of Object.entries(transceivers.value)) {
      if (pc.signalingState === 'closed') {
        console.log(`[startScreenShare] skip PC ${remoteId}, because signalingState=closed`)
        continue
      }

      await updateScreenShareForRemote(remoteId, pc, screen, prev);
    }

    console.log('[updateScreenShare] => slaveForceOffer()')
    await slaveForceOffer()
  };

  watch(localVideo, (element) => {
    if (element && localStreamStore.stream) element.srcObject = localStreamStore.stream;
  });

  watch(() => localStreamStore.constraints, () => {
    void updateLocalStream();
  }, { deep: true });

  watch(() => screenShareStore.stream, (screen, prev) => {
    void updateScreenShare(screen, prev);
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
    remoteStreams,
    localVideo,

    initSocket,
    joinWebrtcRoom,
  }
});

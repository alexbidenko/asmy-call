export type RemoteStreamObj = {
  id: string;
  socketId: string;
  stream: MediaStream;
};

type RemoteId = string;

const TURN_SERVER_HOST = 'turn.lab.intelsy.pro';
const TURN_SERVER_IP = '62.109.28.203';

export const useWebrtcStore = defineStore('webrtc', () => {
  const screenShareStore = useScreenShareStore();
  const localStreamStore = useLocalStreamStore();
  const memberStore = useMemberStore();
  const senderStore = useSenderStore();
  const roomStore = useRoomStore();
  const wsStore = useWsStore();

  // -------------------
  // State (Composition API refs)
  // -------------------
  const mySocketId = ref('')
  const remoteStreams = ref<RemoteStreamObj[]>([])
  const peerConnections = reactive<Record<RemoteId, RTCPeerConnection>>({});

  // У нас в UI <video ref="localVideo" />
  const localVideo = shallowRef<HTMLVideoElement | null>(null)

  // Объект для хранения очередей переговоров по каждому remoteId в виде цепочки Promise
  const negotiationQueues = reactive<Record<RemoteId, Promise<void>>>({});
  const pendingCandidates = reactive<Record<RemoteId, RTCIceCandidateInit[]>>({});

  const isNegotiating = reactive<Record<RemoteId, boolean>>({});
  const pendingRenegotiation = reactive<Record<RemoteId, boolean>>({});

  const needIceRestart     = reactive<Record<RemoteId, boolean>>({});
  const isIceRestarting    = reactive<Record<RemoteId, boolean>>({});

  // --------------------------------------------------
  // initSocket, joinWebrtcRoom
  // --------------------------------------------------
  const initSocket = () => {
    wsStore.socket.on('connect', () => {
      if (wsStore.socket.id) {
        mySocketId.value = wsStore.socket.id
        console.log('[WebRTC] mySocketId=', mySocketId.value)
      }
    })

    wsStore.socket.on('existingUsers', (users: { socketId: string; username: string }[]) => {
      users.forEach((u) => {
        createPeerConnection(u.socketId)
        memberStore.join({ id: u.socketId, username: u.username })
      })
    })

    wsStore.socket.on('user-joined', async (data) => {
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

    wsStore.socket.on('webrtcSignal', (payload) => {
      handleSignal(payload);
    });

    wsStore.socket.on('user-left', (data) => {
      if (peerConnections[data.socketId]) {
        peerConnections[data.socketId].close();
        delete peerConnections[data.socketId];
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
    wsStore.socket.emit('joinWebrtcRoom', {
      room: roomStore.room,
      username: userStore.username
    });
  }

  const sendSignal = (remoteId: string, data: any) => {
    wsStore.socket.emit('webrtcSignal', {
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

    delete peerConnections[remoteId];
    delete isNegotiating[remoteId];
    delete pendingRenegotiation[remoteId];
    delete isIceRestarting[remoteId];
    delete needIceRestart[remoteId];
    delete pendingCandidates[remoteId];
    remoteStreams.value = remoteStreams.value.filter((r) => r.socketId !== remoteId);

    memberStore.leave(remoteId);
  };

  const createPeerConnection = (remoteId: string) => {
    if (peerConnections[remoteId]) return peerConnections[remoteId];

    const pc = new RTCPeerConnection({
      iceServers: [
        // { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: [
            `turns:${TURN_SERVER_HOST}:443?transport=tcp`,
            `turns:${TURN_SERVER_HOST}:443?transport=udp`,
            `turn:${TURN_SERVER_IP}:3478?transport=tcp`,
            `turn:${TURN_SERVER_IP}:3478?transport=udp`,
          ],
          username: 'username',
          credential: 'password',
        },
      ],
    });

    isNegotiating[remoteId] = false;
    pendingRenegotiation[remoteId] = false;
    isIceRestarting[remoteId] = false;
    needIceRestart[remoteId]  = false;

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
      // ➍ пропускаем ивент, если ещё не завершили предыдущий offer
      if (isNegotiating[remoteId]) {
        pendingRenegotiation[remoteId] = true;
        console.log('[onnegotiationneeded] duplicate ignored for', remoteId);
        return;
      }

      try {
        await enqueueNegotiation(remoteId, pc);
      } catch (error) {
        console.error('[onnegotiationneeded] process failed:', error);
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[ICE State] ${pc.iceConnectionState} remoteId=${remoteId}`);

      if (pc.iceConnectionState === 'failed') {
        void attemptIceRestart(remoteId, pc);                 // немедленный рестарт
      } else if (['closed', 'disconnected'].includes(pc.iceConnectionState)) {
        cleanupPeerConnection(remoteId, pc);             // как было
      }
    };

    // Обработчик изменения общего состояния соединения
    pc.onconnectionstatechange = () => {
      console.log(`[Connection State] ${pc.connectionState} для remoteId=${remoteId}`);

      if (pc.connectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.connectionState === 'disconnected') cleanupPeerConnection(remoteId, pc);
        }, 3000);
        return;
      }

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

    pc.onicecandidateerror = (event) => {
      console.warn('[onicecandidateerror] event:', event);

      // маркируем peer: «у него проблемы с host‑кандидатом»
      // если уже помечен — таймер стоит, выходим
      if (needIceRestart[remoteId]) return;
      needIceRestart[remoteId] = true;

      // ставим таймер один раз
      setTimeout(async () => {
        if (needIceRestart[remoteId] && pc.iceConnectionState !== 'closed') {
          console.log('[onicecandidateerror] scheduling ICE‑restart for', remoteId);
          await attemptIceRestart(remoteId, pc);
          needIceRestart[remoteId] = false;
        }
      }, 3000);
    };

    (async () => {
      await updateLocalStreamForRemote(remoteId, pc);
      await updateScreenShareForRemote(remoteId, pc, screenShareStore.stream, null);
      await updateStreamSdpForRemote(remoteId, pc);
    })();

    peerConnections[remoteId] = pc;

    return pc
  };

  const attemptIceRestart = async (remoteId: string, pc: RTCPeerConnection) => {
    // Safari ≤ 16 не поддерживает restartIce()
    if (!pc.restartIce) {
      console.warn('[ICE‑restart] restartIce() not supported; doing full renegotiation');
      await enqueueNegotiation(remoteId, pc);          // offer без перезвона
      return;
    }

    if (isIceRestarting[remoteId]) return;             // защита от дубля
    isIceRestarting[remoteId] = true;
    needIceRestart[remoteId]  = false;                 // сбрасываем «ждущий» флаг

    try {
      console.log('[ICE‑restart] restarting for', remoteId);
      pc.restartIce();
    } catch (error) {
      console.error('[ICE‑restart] failed for', remoteId, error);
    } finally {
      isIceRestarting[remoteId] = false;
    }
  };

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
  // Если попытка неудачна, происходит повторный вызов с задержкой
  const negotiateWithBackoff = async (
    remoteId: string,
    peerConnection: RTCPeerConnection,
  ) => {
    // TODO: надо как-то правильно обрабатывать ошибки
    await retry(() => handleLocalDescription(peerConnection, remoteId), { exponential: true, delay: 500 }).catch((error) => {
      console.error(`[negotiateWithBackoff] Negotiation failed after some attempts for remoteId=${remoteId}:`, error);
    });
  };

  // Функция для добавления переговорной задачи в очередь для заданного remoteId.
  // Если для remoteId уже есть запущенная задача, новая задача будет выполнена после завершения предыдущей.
  const enqueueNegotiation = (remoteId: string, peerConnection: RTCPeerConnection) => {
    // Задача переговорам представлена функцией, которая возвращает Promise
    const negotiationTask = async () => {
      // ➋ если уже идёт переговор, тихо выходим
      if (isNegotiating[remoteId]) {
        pendingRenegotiation[remoteId] = true;
        console.log('[enqueueNegotiation] skip: already negotiating for', remoteId);
        return;
      }

      isNegotiating[remoteId] = true;
      try {
        await negotiateWithBackoff(remoteId, peerConnection);
      } finally {
        // ➌ переставляем флаг в любом случае
        isNegotiating[remoteId] = false;

        // ──▶ если за время renegotiation накопился запрос, запускаем ещё один круг
        if (pendingRenegotiation[remoteId]) {
          pendingRenegotiation[remoteId] = false;   // сбрасываем флаг
          console.log('[negotiationTask] running pending renegotiation for', remoteId);
          // ставим в очередь новый negotiationTask
          negotiationQueues[remoteId] = negotiationQueues[remoteId]
            .catch(() => {})
            .then(() => negotiationTask());
        }
      }
    };

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

  const addIceCandidateWithRetry = async (pc: RTCPeerConnection, candidate: RTCIceCandidateInit) => {
    // TODO: надо как-то правильно обрабатывать ошибки
    await retry(() => pc.addIceCandidate(candidate)).catch((error) => {
      console.error(
        '[addIceCandidateWithRetry] Не удалось добавить кандидата после множества попыток:',
        error,
      );
    });
  };

  const handleCandidateSignal = async (pc: RTCPeerConnection, payload: any) => {
    const { from: remoteId, signalData } = payload;

    try {
      console.log('[handleSignal] candidate from=', remoteId)
      if (!pc.remoteDescription) {
        if (!pendingCandidates[remoteId]) pendingCandidates[remoteId] = [];
        pendingCandidates[remoteId].push(signalData.candidate);
        return;
      }

      await addIceCandidateWithRetry(pc, signalData.candidate);
    } catch (error) {
      console.error('[handleCandidateSignal] add ice candidate failed from=', remoteId, 'remoteDescription=', pc.localDescription, error);
    }
  };

  const handleDescriptionSignal = async (pc: RTCPeerConnection, payload: any) => {
    const { from: remoteId, signalData } = payload;
    const sdpDescription = new RTCSessionDescription(signalData.sdp);

    // Если получен ответ (answer) и соединение уже стабильно, скорее всего это дубликат – игнорируем его.
    if (sdpDescription.type === 'answer' && pc.signalingState === 'stable') {
      console.warn('[handleSignal] Received answer in stable state from=', remoteId, '. Ignoring duplicate answer.');
      return;
    }

    // Если получен offer, но PeerConnection не стабильный и вы являетесь мастером (mySocketId < from),
    // то пропускаем такой offer, чтобы избежать конфликтов renegotiation.
    if (
      sdpDescription.type === 'offer' &&
      pc.signalingState !== 'stable' &&
      mySocketId.value < remoteId
    ) {
      console.log('[handleSignal] Remote offer skipped from=', remoteId);
      return;
    }

    console.log('[handleSignal] SDP received from=', remoteId, 'type=', sdpDescription.type);

    try {
      await pc.setRemoteDescription(sdpDescription);
    } catch (error) {
      console.error('[handleSignal] setRemoteDescription error:', error);
      return;
    }

    // Если это offer, генерируем answer
    if (sdpDescription.type === 'offer') {
      console.log('[handleSignal] After setRemoteDescription, state=', pc.signalingState);
      await handleLocalDescription(pc, remoteId);
    }

    const candidatesToProcess = pendingCandidates[remoteId] ?? [];
    delete pendingCandidates[remoteId];

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
    if (!peerConnections[from]) {
      createPeerConnection(from)
    }
    const pc = peerConnections[from]

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
    for (const [remoteId, pc] of Object.entries(peerConnections)) {
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

    // Обновляем стрим для каждого удалённого соединения
    await Promise.allSettled(
      Object.entries(peerConnections).map(async ([remoteId, pc]) => {
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
      Object.entries(peerConnections).map(async ([remoteId, pc]) => {
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

  const updateScreenShareForRemote = async (remoteId: string, pc: RTCPeerConnection, screen: MediaStream | null | undefined, prev: MediaStream | null | undefined) => {
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

  const updateScreenShare = async (screen: MediaStream | null | undefined, prev: MediaStream | null | undefined) => {
    for (const [remoteId, pc] of Object.entries(peerConnections)) {
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
    // 2) Закрыть все PeerConnections
    for (const pcObj of Object.values(peerConnections)) {
      pcObj.close()
    }
  });

  return {
    remoteStreams,
    localVideo,

    initSocket,
    joinWebrtcRoom,
  }
});

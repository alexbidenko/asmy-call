export const useRoomStore = defineStore('room', () => {
  const route = useRoute();
  const deviceStore = useDeviceStore();
  const memberStore = useMemberStore()
  const webrtcStore = useWebrtcStore()
  const audioOutputStore = useAudioOutputStore();
  const screenShareStore = useScreenShareStore();
  const chatStore = useChatStore();
  const localStreamStore = useLocalStreamStore();
  const senderStore = useSenderStore();
  const wsStore = useWsStore();

  const { isSupported, isActive, request, release } = useWakeLock();

  const room = computed(() => typeof route.params.room === 'string' ? route.params.room : '');

  const enter = async () => {
    // Считываем сохранённые выборы устройств
    deviceStore.loadFromStorage()

    webrtcStore.initSocket()

    await localStreamStore.init();

    webrtcStore.joinWebrtcRoom();

    chatStore.initChat()

    if (isSupported.value) void request('screen');
  };

  const exit = () => {
    if (isActive.value) void release();

    chatStore.$dispose();
    webrtcStore.$dispose();
    audioOutputStore.$dispose();
    screenShareStore.$dispose();
    memberStore.$dispose();
    localStreamStore.$dispose();
    senderStore.$dispose();
    wsStore.$dispose();
  };

  return {
    room,

    enter,
    exit,
  };
});

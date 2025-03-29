export const useRoomStore = defineStore('room', () => {
  const route = useRoute();
  const router = useRouter();
  const memberStore = useMemberStore()
  const webrtcStore = useWebrtcStore()
  const audioOutputStore = useAudioOutputStore();
  const screenShareStore = useScreenShareStore();
  const chatStore = useChatStore();
  const localStreamStore = useLocalStreamStore();
  const senderStore = useSenderStore();

  const room = computed(() => typeof route.params.room === 'string' ? route.params.room : '');

  const exit = () => {
    chatStore.$dispose();
    webrtcStore.$dispose();
    audioOutputStore.$dispose();
    screenShareStore.$dispose();
    memberStore.$dispose();
    localStreamStore.$dispose();
    senderStore.$dispose();

    router.push('/');
  };

  return {
    room,

    exit,
  };
});

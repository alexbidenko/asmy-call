export type ChatMessage = {
  name: string
  text: string
  socketId: string
};

export const useChatStore = defineStore('chat', () => {
  const interfaceStore = useInterfaceStore();
  const roomStore = useRoomStore();
  const toast = useToast();
  const wsStore = useWsStore();

  const messages = ref<ChatMessage[]>([]);

  // actions
  const initChat = () => {
    messages.value = []

    wsStore.socket.on('connect', () => {
      wsStore.socket.emit('joinRoom', { room: roomStore.room })
    })
    wsStore.socket.on('roomHistory', (history: ChatMessage[]) => {
      messages.value = history
    })
    wsStore.socket.on('newMessage', (msg: ChatMessage) => {
      messages.value.push(msg);

      if (!interfaceStore.isChatVisible && msg.socketId !== wsStore.socket.id) {
        toast.add({
          group: 'message',
          severity: 'secondary',
          summary: msg.name,
          detail: msg.text,
          life: 5000,
        })
      }
    })
  }

  const sendMessage = (text: string) => {
    const userStore = useUserStore()

    if (!text.trim()) return
    wsStore.socket?.emit('sendMessage', {
      room: roomStore.room,
      name: userStore.username,
      text
    })
  }

  // expose
  return {
    messages,

    initChat,
    sendMessage,
  }
});

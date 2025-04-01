import { io, Socket } from 'socket.io-client'

export interface ChatMessage {
  name: string
  text: string
  socketId: string
}

export const useChatStore = defineStore('chat', () => {
  const interfaceStore = useInterfaceStore();
  const roomStore = useRoomStore();
  const toast = useToast();

  // state
  const socket = ref<Socket | null>(null)
  const messages = ref<ChatMessage[]>([])

  // actions
  const initChat = () => {
    const config = useRuntimeConfig()

    socket.value?.disconnect();

    messages.value = []
    socket.value = io(config.public.apiHost || '', { forceNew: true })

    socket.value.on('connect', () => {
      socket.value?.emit('joinRoom', { room: roomStore.room })
    })
    socket.value.on('roomHistory', (history: ChatMessage[]) => {
      messages.value = history
    })
    socket.value.on('newMessage', (msg: ChatMessage) => {
      messages.value.push(msg);

      if (!interfaceStore.isChatVisible && msg.socketId !== socket.value?.id) {
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
    socket.value?.emit('sendMessage', {
      room: roomStore.room,
      name: userStore.username,
      text
    })
  }

  onBeforeUnmount(() => {
    socket.value?.disconnect()
  });

  // expose
  return {
    socket,
    messages,

    initChat,
    sendMessage,
  }
});

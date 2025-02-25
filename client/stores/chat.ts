import { io, Socket } from 'socket.io-client'

export interface ChatMessage {
  name: string
  text: string
  socketId: string
}

export const useChatStore = defineStore('chat', () => {
  // state
  const socket = ref<Socket | null>(null)
  const messages = ref<ChatMessage[]>([])
  const room = ref('')

  // actions
  const initChat = (newRoom: string) => {
    const config = useRuntimeConfig()

    socket.value?.disconnect();

    room.value = newRoom
    messages.value = []
    socket.value = io(config.public.apiHost || '', { forceNew: true })

    socket.value.on('connect', () => {
      socket.value?.emit('joinRoom', { room: newRoom })
    })
    socket.value.on('roomHistory', (history: ChatMessage[]) => {
      messages.value = history
    })
    socket.value.on('newMessage', (msg: ChatMessage) => {
      messages.value.push(msg)
    })
  }

  const sendMessage = (text: string) => {
    const userStore = useUserStore()

    if (!text.trim()) return
    socket.value?.emit('sendMessage', {
      room: room.value,
      name: userStore.username,
      text
    })
  }

  const disconnect = () => {
    socket.value?.disconnect()
  }

  // expose
  return {
    socket,
    messages,
    room,

    initChat,
    sendMessage,
    disconnect,
  }
});

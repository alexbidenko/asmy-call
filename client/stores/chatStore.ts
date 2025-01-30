import { defineStore } from 'pinia'
import { io, Socket } from 'socket.io-client'

export interface ChatMessage {
  name: string
  text: string
  socketId: string;
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    socket: null as Socket | null,
    messages: [] as ChatMessage[],
    room: '',
  }),
  actions: {
    initChat(room: string) {
      const config = useRuntimeConfig();

      // Если уже есть сокет, почистим/переинициализируем
      if (this.socket) {
        this.socket.disconnect();
      }
      this.room = room
      this.messages = []
      this.socket = io(config.public.apiHost || '', { forceNew: true })
      this.socket.on('connect', () => {
        this.socket?.emit('joinRoom', { room })
      })
      this.socket.on('roomHistory', (history: ChatMessage[]) => {
        this.messages = history
      })
      this.socket.on('newMessage', (msg: ChatMessage) => {
        this.messages.push(msg)
      })
    },
    sendMessage(text: string) {
      const userStore = useUserStore();

      if (!text.trim()) return;
      this.socket?.emit('sendMessage', {
        room: this.room,
        name: userStore.username,
        text
      })
    },
    disconnect() {
      this.socket?.disconnect();
      this.$reset();
    },
  }
})

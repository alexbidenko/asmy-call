<template>
  <div>
    <h3>Chat</h3>
    <textarea
        v-model="text"
        placeholder="Message..."
        rows="2"
        style="width: 100%; margin-bottom: 4px;"
    ></textarea>
    <button @click="onSend" style="width: 100%;">Send</button>
    <hr />
    <div v-for="(msg, i) in chatStore.messages" :key="i" style="margin: 4px 0;">
      <strong>{{ msg.name }}:</strong> {{ msg.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useChatStore } from '@/stores/chatStore'

const props = defineProps<{ room: string }>()
const chatStore = useChatStore()
const text = ref('')

onMounted(() => {
  if (!chatStore.socket || chatStore.room !== props.room) {
    chatStore.initChat(props.room)
  }
})

function onSend() {
  chatStore.sendMessage(text.value)
  text.value = ''
}
</script>

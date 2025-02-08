<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 overflow-auto">
      <div class="flex flex-col justify-end gap-2 p-1 min-h-full">
        <ChatMessage
          v-for="(msg, i) in chatStore.messages"
          :key="i"
          :message="msg"
          :class="{ 'ml-auto': msg.socketId === chatStore.socket?.id }"
        />
      </div>
    </div>

    <Divider class="!m-0" />
    <div class="p-1 flex gap-1 items-end">
      <Textarea
        v-model.trim="text"
        @keydown.ctrl.enter="onSend"
        placeholder="Сообщение..."
        rows="1"
        auto-resize
        class="max-h-48 flex-1 !border-none"
      />
      <Button @click="onSend" text rounded>
        <template #icon>
          <span class="material-icons-outlined">
            send
          </span>
        </template>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ room: string }>()
const chatStore = useChatStore()
const text = ref('')

onMounted(() => {
  if (!chatStore.socket || chatStore.room !== props.room) {
    chatStore.initChat(props.room)
  }
})

function onSend() {
  if (!text.value.trim()) return;

  chatStore.sendMessage(text.value.trim())
  text.value = '';
}
</script>

<script lang="ts" setup>
import type {ChatMessage} from "~/stores/chat";

defineProps<{
  message: ChatMessage;
}>();
</script>

<template>
  <Message
    severity="contrast"
    variant="outlined"
    class="w-fit"
  >
    <MDC :value="message.text" class="text-sm mdc whitespace-pre-wrap" />
    <span class="text-xs opacity-60 mt-1 ml-auto block w-fit">{{ message.name }}</span>
  </Message>
</template>

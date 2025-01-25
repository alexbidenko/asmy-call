<template>
  <Welcome v-if="!userStore.ready" />
  <div v-else-if="!userStore.initialized" class="h-full flex justify-center items-center">
    <Button @click="userStore.initialized = true" label="Присоединиться" size="large" text />
  </div>
  <div v-else class="h-full flex flex-col">
    <Splitter class="flex-1 !rounded-none overflow-hidden" state-storage="local" state-key="video-chat-splitter">
      <SplitterPanel :size="75" class="min-w-64">
        <VideoConference :room="userStore.room" />
      </SplitterPanel>
      <SplitterPanel v-if="interfaceStore.isChatVisible" :size="25" class="min-w-64">
        <ChatBox :room="userStore.room" />
      </SplitterPanel>
    </Splitter>

    <ControlPanel class="mt-auto" />
  </div>
</template>

<script setup lang="ts">
const userStore = useUserStore();
const interfaceStore = useInterfaceStore();
</script>

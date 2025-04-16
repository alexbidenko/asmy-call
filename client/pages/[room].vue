<script setup lang="ts">
const userStore = useUserStore();
const interfaceStore = useInterfaceStore();

const online = useOnline();

definePageMeta({
  validate: (route) => (
    typeof route.params.room === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(route.params.room)
  ),
})
</script>

<template>
  <Welcome v-if="!userStore.ready" />
  <div v-else-if="!userStore.initialized" class="h-full flex justify-center items-center">
    <Button @click="userStore.initialize" label="Присоединиться" size="large" text />
  </div>
  <div v-else-if="!online" class="h-full flex justify-center items-center">
    <span class="text-sm">Отсутствие интернет соединения...</span>
  </div>
  <RoomWrapper v-else class="h-full flex flex-col">
    <Splitter
      class="flex-1 !rounded-none !border-0 overflow-hidden relative"
      state-storage="local"
      state-key="video-chat-splitter"
      :pt="{ gutter: '!hidden md:!block' }"
    >
      <SplitterPanel :size="75" class="min-w-64">
        <VideoConference />
      </SplitterPanel>
      <SplitterPanel
        v-if="interfaceStore.isChatVisible"
        :size="25"
        class="min-w-64 absolute inset-0 md:static"
        style="background-color: var(--p-splitter-background)"
      >
        <ChatBox />
      </SplitterPanel>
    </Splitter>

    <ControlPanel class="mt-auto" />

    <SettingDialog />
  </RoomWrapper>
</template>

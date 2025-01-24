<template>
  <Welcome v-if="!userStore.ready" />
  <div v-else-if="!initialized" class="h-full flex justify-center items-center">
    <Button @click="initialized = true" label="Присоединиться" size="large" text />
  </div>
  <div v-else class="h-full flex flex-col">
    <VideoConference :room="userStore.room" />
    <hr />
    <ChatBox :room="userStore.room" />

    <ControlPanel class="mt-auto" />
  </div>
</template>

<script setup lang="ts">
const userStore = useUserStore();

const initialized = ref(false);
</script>

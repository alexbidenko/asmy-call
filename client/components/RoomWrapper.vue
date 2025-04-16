<script lang="ts" setup>
const deviceStore = useDeviceStore();
const roomStore = useRoomStore();
const chatStore = useChatStore();
const webrtcStore = useWebrtcStore();
const localStreamStore = useLocalStreamStore();

const { isSupported, isActive, request, release } = useWakeLock();

onMounted(async () => {
  // Считываем сохранённые выборы устройств
  deviceStore.loadFromStorage()

  webrtcStore.initSocket()

  await localStreamStore.init();

  webrtcStore.joinWebrtcRoom();

  chatStore.initChat()

  if (isSupported.value) void request('screen');
});

onBeforeUnmount(() => {
  if (isActive.value) void release();

  roomStore.exit();
});
</script>

<template>
  <div>
    <slot />
  </div>
</template>

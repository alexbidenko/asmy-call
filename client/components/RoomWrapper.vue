<script lang="ts" setup>
const deviceStore = useDeviceStore();
const roomStore = useRoomStore();
const chatStore = useChatStore();
const webrtcStore = useWebrtcStore();

const handleDeviceChange = async () => {
  await deviceStore.enumerateDevices();
  console.log('[devicechange] Updated list of devices');
};

onMounted(async () => {
  // Считываем сохранённые выборы устройств
  deviceStore.loadFromStorage()
  await deviceStore.enumerateDevices()

  // Инициализируем сокет (если не был) и подключаемся к комнате
  if (!webrtcStore.rtcSocket || webrtcStore.room !== roomStore.room) {
    webrtcStore.initSocket(roomStore.room)
  }

  webrtcStore.joinWebrtcRoom()

  // Запускаем локальный стрим (камера/микрофон) — если хотим "автоматически"
  // (если user сам потом включает кнопкой, можно убрать эту строку)
  webrtcStore.startOrUpdateStream()

  if (!chatStore.socket || chatStore.room !== roomStore.room) {
    chatStore.initChat(roomStore.room)
  }

  navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
});

onBeforeUnmount(() => {
  navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);

  roomStore.exit();
});
</script>

<template>
  <div>
    <slot />
  </div>
</template>

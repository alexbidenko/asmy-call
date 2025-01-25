<template>
  <div class="@container flex h-full">
    <div id="large-video-slot" class="empty:hidden flex-1" />

    <div
      v-show="interfaceStore.isMembersVisible"
      class="grid grid-cols-1 gap-2 p-2 h-fit"
      :class="{
        '@xl:grid-cols-2 @4xl:grid-cols-3 @7xl:grid-cols-4 w-full': !teleportedId,
        'w-64': teleportedId,
      }"
    >
      <!-- Локальное видео-превью -->
      <Teleport
        v-if="!webrtcStore.screenStream || webrtcStore.localStream"
        defer to="#large-video-slot"
        :disabled="teleportedId !== 'local-video'"
      >
        <VideoItem
          @teleport="toggleTeleportId"
          :video-ref="(el) => (webrtcStore.localVideo = el)"
          stream-id="local-video"
          :opened="teleportedId === 'local-video'"
          :username="userStore.username"
          :video="!!webrtcStore.isCamOn"
          :audio="!!webrtcStore.isMicOn"
          muted
        />
      </Teleport>
      <Teleport v-if="webrtcStore.screenStream" defer to="#large-video-slot" :disabled="teleportedId !== 'local-screen'">
        <VideoItem
          @teleport="toggleTeleportId"
          :video-ref="(el) => (webrtcStore.localScreen = el)"
          stream-id="local-screen"
          :opened="teleportedId === 'local-screen'"
          :username="userStore.username"
          muted
          video
        />
      </Teleport>

      <Teleport v-for="obj in streams" :key="obj.id" defer to="#large-video-slot" :disabled="teleportedId !== `stream-${obj.id}`">
        <VideoItem
          @teleport="toggleTeleportId"
          :video-ref="(el) => setRemoteRef(el, obj.id)"
          :stream-id="`stream-${obj.id}`"
          :muted="!webrtcStore.isOutputOn"
          :opened="teleportedId === `stream-${obj.id}`"
          :username="obj.username || 'Unknown'"
          :video="!!obj.video"
          :audio="!!obj.audio"
        />
      </Teleport>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue'
import type { RemoteStreamObj } from '~/stores/webrtcStore'
import type { MemberType } from '~/stores/member'

const props = defineProps<{ room: string }>()

const devicesStore = useDeviceStore()
const webrtcStore = useWebrtcStore()
const memberStore = useMemberStore()
const userStore = useUserStore()
const interfaceStore = useInterfaceStore()

const teleportedId = ref('');

const toggleTeleportId = (id: string) => {
  teleportedId.value = teleportedId.value === id ? '' : id;
}

/**
 * Собираем список remoteStreams + username из memberStore
 */
const streams = computed(() => {
  const map = new Map<string, Partial<RemoteStreamObj & MemberType> & { id: string }>()

  memberStore.list.forEach((el) => {
    map.set(el.id, {
      ...el,
      ...(webrtcStore.remoteStreams.find((r) => r.socketId === el.id) || {})
    })
  });

  webrtcStore.remoteStreams.forEach((el) => {
    map.delete(el.socketId);
    map.set(el.id, {
      ...el,
      username:
        memberStore.list.find((m) => m.id === el.socketId)?.username || 'Unknown'
    })
  });

  return [...map.values()]
});

function setRemoteRef(el: HTMLVideoElement | null, streamId: string) {
  if (!el) return
  const found = webrtcStore.remoteStreams.find((r) => r.id === streamId)
  if (found) {
    el.srcObject = found.stream
    el.id = 'video-' + streamId
    setSink(el, devicesStore.selectedAudioOutput)
  }
}

// Настройка аудиовыхода (sinkId)
function setSink(el: HTMLVideoElement, sinkId: string) {
  if (typeof el.sinkId !== 'undefined' && sinkId !== 'default') {
    el.setSinkId(sinkId).catch((err: any) => {
      console.warn('Error setting sinkId:', err)
    })
  }
}

watch([() => webrtcStore.localStream, () => webrtcStore.screenStream, () => webrtcStore.remoteStreams], () => {
  if (teleportedId.value === 'local-video' && !webrtcStore.localStream) teleportedId.value = '';
  else if (teleportedId.value === 'local-screen' && !webrtcStore.screenStream) teleportedId.value = '';
  else if (
    teleportedId.value.startsWith('stream-') &&
    !webrtcStore.remoteStreams.find((r) => `stream-${r.id}` === teleportedId.value)
  ) teleportedId.value = '';
});

watch(teleportedId, (v) => {
  interfaceStore.isLargeVideoVisible = !!v;
}, { immediate: true });

onMounted(async () => {
  // Считываем сохранённые выборы устройств
  devicesStore.loadFromStorage()
  await devicesStore.enumerateDevices()

  // Инициализируем сокет (если не был) и подключаемся к комнате
  if (!webrtcStore.rtcSocket || webrtcStore.room !== props.room) {
    webrtcStore.initSocket(props.room)
  }
  // Можно убрать setTimeout и сразу:
  webrtcStore.joinWebrtcRoom()

  // Запускаем локальный стрим (камера/микрофон) — если хотим "автоматически"
  // (если user сам потом включает кнопкой, можно убрать эту строку)
  webrtcStore.startOrUpdateStream()
})
</script>

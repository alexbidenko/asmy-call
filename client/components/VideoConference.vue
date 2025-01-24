<template>
  <div>
    <h3>Video Conference</h3>

    <!-- Показ "In Call" / "Not in Call" -->
    <div v-if="webrtcStore.isInCall" style="color: green;">
      Status: In Call
    </div>
    <div v-else style="color: red;">
      Status: Not in Call
    </div>

    <!-- Локальное видео-превью -->
    <video
      :ref="(el) => (webrtcStore.localVideo = el as HTMLVideoElement)"
      autoplay
      playsinline
      muted
      style="width: 300px; background: #000; margin-right: 8px;"
    ></video>

    <!-- Удалённые видео -->
    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
      <div v-for="obj in streams" :key="obj.id">
        <video
          :ref="(el) => setRemoteRef(el, obj.id)"
          autoplay
          playsinline
          :muted="!webrtcStore.isOutputOn"
          :class="{ hidden: !obj.stream.getVideoTracks().length }"
          style="width: 300px; background: #000;"
        />
        {{ obj.stream.getVideoTracks()[0]?.enabled }}
        {{ obj.username }}
      </div>
    </div>

    <!-- Кнопки шеринга экрана -->
    <button @click="startShare" :disabled="webrtcStore.isScreenSharing">
      Share Screen
    </button>
    <button @click="stopShare" :disabled="!webrtcStore.isScreenSharing">
      Stop Share
    </button>
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

/**
 * Собираем список remoteStreams + username из memberStore
 */
const streams = computed(() => {
  const map = new Map<string, RemoteStreamObj & MemberType>()

  window.test = webrtcStore.remoteStreams;
  webrtcStore.remoteStreams.forEach((el) => {
    map.set(el.id, {
      ...el,
      username:
        memberStore.list.find((m) => m.id === el.socketId)?.username || 'Unknown'
    })
  })

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
  // @ts-expect-error
  if (typeof el.sinkId !== 'undefined' && sinkId !== 'default') {
    // @ts-expect-error
    el.setSinkId(sinkId).catch((err: any) => {
      console.warn('Error setting sinkId:', err)
    })
  }
}

// Шеринг экрана
function startShare() {
  webrtcStore.startScreenShare()
}
function stopShare() {
  webrtcStore.stopScreenShare()
}

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

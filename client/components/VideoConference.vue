<script setup lang="ts">
import type { RemoteStreamObj } from '~/stores/webrtc'
import type { MemberType } from '~/stores/member'

const props = defineProps<{ room: string }>()

const devicesStore = useDeviceStore()
const webrtcStore = useWebrtcStore()
const memberStore = useMemberStore()
const userStore = useUserStore()
const interfaceStore = useInterfaceStore()
const screenShareStore = useScreenShareStore();

const teleportedId = ref('');

const idsMap = reactive(new Map<string, string>());

/**
 * Собираем список remoteStreams + username из memberStore
 */
const streams = computed(() => {
  // TODO: все еще не идеально с этими ключами
  const map = new Map<string, Partial<RemoteStreamObj & MemberType> & { id: string; staticId: string }>();

  // TODO: а тут вообще иногда проблемы с обновлением, если так не считать явно
  const remoteStreams = webrtcStore.remoteStreams;
  remoteStreams.forEach((el) => {
    let id: string;
    if (idsMap.get(el.socketId) === el.id) {
      id = el.socketId;
    } else if (!idsMap.has(el.socketId)) {
      idsMap.set(el.socketId, el.id);
      id = el.socketId;
    } else id = el.id;

    map.set(id, {
      ...el,
      username:
        memberStore.list.find((m) => m.id === el.socketId)?.username || 'Unknown',
      staticId: id,
    })
  });

  memberStore.list.forEach((el) => {
    if (!remoteStreams.some((s) => s.socketId === el.id)) {
      idsMap.delete(el.id);
      map.set(el.id, { ...el, staticId: el.id });
    }
  });

  idsMap.forEach((_, id) => {
    if (!memberStore.list.some((el) => el.id === id)) idsMap.delete(id);
  });

  return [...map.values()]
});

const toggleTeleportId = (id: string) => {
  teleportedId.value = teleportedId.value === id ? '' : id;
}

function setRemoteRef(el: HTMLVideoElement | null, streamId: string) {
  if (!el) return
  const found = webrtcStore.remoteStreams.find((r) => r.id === streamId)
  if (found) {
    el.srcObject = found.stream
    el.id = 'video-' + streamId
  }
}

watch([() => webrtcStore.localStream, () => screenShareStore.stream, () => webrtcStore.remoteStreams], () => {
  if (teleportedId.value === 'local-video' && !webrtcStore.localStream) teleportedId.value = '';
  else if (teleportedId.value === 'local-screen' && !screenShareStore.stream) teleportedId.value = '';
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
      <LayoutGroup>
        <Teleport
          defer
          to="#large-video-slot"
          :disabled="teleportedId !== 'local-video'"
        >
          <VideoItem
            @click="toggleTeleportId('local-video')"
            :video-ref="(el) => (webrtcStore.localVideo = el)"
            :stream="webrtcStore.localStream"
            :opened="teleportedId === 'local-video'"
            :username="userStore.username"
            :video="webrtcStore.isCamOn"
            :audio="webrtcStore.isMicOn"
            muted
          />
        </Teleport>

        <AnimatePresence>
          <Motion
            v-if="screenShareStore.stream"
            key="local-screen"
            layout
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1, transition: { delay: 0.5 } }"
            :exit="{ opacity: 0 }"
          >
            <Teleport defer to="#large-video-slot" :disabled="teleportedId !== 'local-screen'">
              <VideoItem
                @click="toggleTeleportId('local-screen')"
                :video-ref="(el) => (screenShareStore.element = el)"
                :stream="screenShareStore.stream"
                :opened="teleportedId === 'local-screen'"
                :username="userStore.username"
                muted
                video
              />
            </Teleport>
          </Motion>

          <Motion
            v-for="obj in streams"
            :key="`stream-${obj.staticId}`"
            layout
            :initial="{ opacity: 0 }"
            :animate="{ opacity: 1 }"
            :exit="{ opacity: 0 }"
          >
            <Teleport defer to="#large-video-slot" :disabled="teleportedId !== `stream-${obj.id}`">
              <VideoItem
                @click="toggleTeleportId(`stream-${obj.id}`)"
                :video-ref="(el) => setRemoteRef(el, obj.id)"
                :stream="obj.stream"
                :opened="teleportedId === `stream-${obj.id}`"
                :username="obj.staticId || obj.username || 'Unknown'"
                :video="!!obj.video"
                :audio="!!obj.audio"
              />
            </Teleport>
          </Motion>
        </AnimatePresence>
      </LayoutGroup>
    </div>
  </div>
</template>

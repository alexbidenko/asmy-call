<script setup lang="ts">
import type { RemoteStreamObj } from '~/stores/webrtc'
import type { MemberType } from '~/stores/member'

const roomStore = useRoomStore();
const devicesStore = useDeviceStore()
const webrtcStore = useWebrtcStore()
const memberStore = useMemberStore()
const userStore = useUserStore()
const interfaceStore = useInterfaceStore()
const screenShareStore = useScreenShareStore();

const teleportedId = ref('');

// TODO: было бы возможно хорошо создавать стрим под каждого пользователя даже без видео и аудио - тогда не будет проблем с количеством карточек и анимациями
/**
 * Собираем список remoteStreams + username из memberStore
 */
const streams = computed(() => {
  // TODO: все еще не идеально с этими ключами
  const map = new Map<string, Partial<RemoteStreamObj & MemberType> & { id: string; staticId: string }>();

  // TODO: а тут вообще иногда проблемы с обновлением, если так не считать явно
  const remoteStreams = webrtcStore.remoteStreams;

  // TODO: осталось, что если отключить все стримы, то переход на пустое поле происходит не правильно
  // TODO: А еще делать бы итерацию по участникам сначала и выводить карточки так, чтобы карточки одного участника были рядом - может тогда и остальное станет проще
  memberStore.list.forEach((el) => {
    const streams = remoteStreams.filter((s) => s.socketId === el.id);
    streams.forEach((s) => {
      map.set(s.id, {
        ...s,
        username: el.username,
        staticId: s.id,
      })
    })

    map.set(el.id, { ...el, staticId: el.id });
  });

  const unknownStreams = remoteStreams.filter((s) => !memberStore.list.some((m) => m.id === s.socketId));
  unknownStreams.forEach((s) => {
    map.set(s.id, {
      ...s,
      username: 'Unknown',
      staticId: s.id,
    })
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
                :username="obj.username || 'TODO'"
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

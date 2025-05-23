<script setup lang="ts">
import type { MemberType } from '~/stores/member'
import type { RemoteStreamObj } from '~/stores/webrtc'

type RemoteStreamType = Omit<RemoteStreamObj, 'socketId'> &
  MemberType &
  {
    staticId: string;
    muted?: boolean;
    mirrored?: boolean;
    constraints?: unknown;
    setRef: (ref: HTMLVideoElement) => void;
  };

const webrtcStore = useWebrtcStore()
const localStreamStore = useLocalStreamStore();
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
  const map = new Map<string, RemoteStreamType>();

  const remoteStreams = webrtcStore.remoteStreams;

  // TODO: Из-за простого включения и выключения микрофона теперь будет пересчет списка.
  //  Все из-за constraints, надо бы его оптимизировать как-то.
  if (localStreamStore.stream) {
    map.set('local-video', {
      id: 'local-video',
      username: userStore.username,
      stream: localStreamStore.stream,
      staticId: 'local-video',
      muted: true,
      mirrored: true,
      constraints: localStreamStore.constraints,
      setRef: (el) => (webrtcStore.localVideo = el),
    });
  }

  if (screenShareStore.stream) {
    map.set('local-screen', {
      id: 'local-screen',
      username: userStore.username,
      stream: screenShareStore.stream,
      staticId: 'local-screen',
      muted: true,
      setRef: (el) => (screenShareStore.element = el),
    });
  }

  const setRemoteRef = (el: HTMLVideoElement, streamObj: RemoteStreamObj) => {
    if (el && streamObj) {
      el.srcObject = streamObj.stream
    }
  };

  memberStore.list.forEach((el) => {
    const streams = remoteStreams.filter((s) => s.socketId === el.id);
    streams.forEach((s) => {
      map.set(s.id, {
        ...s,
        username: el.username,
        staticId: s.id,
        setRef: (el) => setRemoteRef(el, s),
      })
    })
  });

  const unknownStreams = remoteStreams.filter((s) => !memberStore.list.some((m) => m.id === s.socketId));
  unknownStreams.forEach((s) => {
    map.set(s.id, {
      ...s,
      username: 'Unknown',
      staticId: s.id,
      setRef: (el) => setRemoteRef(el, s),
    })
  });

  return [...map.values()]
});

const toggleTeleportId = (id: string) => {
  teleportedId.value = teleportedId.value === id ? '' : id;
}

watch([() => localStreamStore.stream, () => screenShareStore.stream, () => webrtcStore.remoteStreams], () => {
  if (teleportedId.value === 'local-video' && !localStreamStore.stream) teleportedId.value = '';
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
  <div
    class="@container relative flex h-full overflow-y-auto overflow-x-hidden"
    :style="`--stream-count: ${streams.length + 2 + +!!screenShareStore.stream}; --rows-style: repeat(${streams.length + +!!screenShareStore.stream}, auto) 1fr;`"
  >
    <AnimatePresence>
      <Motion
        as="div"
        layout
        class="grid gap-2 p-area h-fit w-full"
        :class="[{
          'grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3 @7xl:grid-cols-4 w-full': !teleportedId,
          'grid-rows-(--rows-style) !pb-0 min-h-full': teleportedId,
        }, teleportedId && (interfaceStore.isMembersVisible ? 'grid-cols-1' : 'grid-cols-[1fr_auto]')]"
      >
        <LayoutGroup>
          <AnimatePresence>
            <template v-for="obj in streams" :key="`stream-${obj.staticId}`">
              <VideoItem
                v-show="!teleportedId || teleportedId === `stream-${obj.id}` || interfaceStore.isMembersVisible"
                @teleport="toggleTeleportId(`stream-${obj.id}`)"
                :video-ref="obj.setRef"
                :stream="obj.stream"
                :opened="teleportedId === `stream-${obj.id}`"
                :username="obj.username || 'TODO'"
                :muted="obj.muted"
                :mirrored="obj.mirrored"
                :constraints="obj.constraints"
                :class="{
                  'col-1 row-start-1 row-end-(--stream-count)': teleportedId === `stream-${obj.id}`,
                  'w-64 col-2 row-auto': teleportedId && teleportedId !== `stream-${obj.id}`,
                }"
              />
            </template>
          </AnimatePresence>
        </LayoutGroup>
      </Motion>
    </AnimatePresence>
  </div>
</template>

<script lang="ts" setup>
const props = defineProps<{
  stream: MediaStream;
  videoRef: (el: HTMLVideoElement) => void;
  username: string;
  opened?: boolean;
  constraints?: unknown;
  mirrored?: boolean;
}>();
const emit = defineEmits<{
  (event: 'teleport'): void;
}>();
defineOptions({ inheritAttrs: false });

const audioOutputStore = useAudioOutputStore();

const audioEnabled = ref(false);
const videoEnabled = ref(false);

// TODO: фиерический костыль ибо не знаю пока как лучше
const amplitudeHistory = ref(Array.from({ length: 20 }, () => 0));

// Вычисляем буквы для заглушки (Avatar)
const label = computed(() => {
  const parts = props.username.split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return props.username.slice(0, 2).toUpperCase()
})

// ----------------------------
// Аудио-анализ
// ----------------------------
const amplitude = ref(0)  // текущая громкость (0..1 условно)
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let source: MediaStreamAudioSourceNode | null = null
let dataArray: Uint8Array | null = null
let rafId: number | null = null

const setupAudioAnalyser = (stream: MediaStream) => {
  // Если уже есть AudioContext — глушим
  cleanupAudioAnalyser()

  try {
    audioContext = new AudioContext()
    source = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    dataArray = new Uint8Array(analyser.frequencyBinCount)

    // Запускаем анимацию
    animate()
  } catch (error) {
    console.warn('[Audio Analyser] setup error:', error)
  }
};

const animate = () => {
  if (!analyser || !dataArray) return

  rafId = requestAnimationFrame(animate)
  analyser.getByteTimeDomainData(dataArray)

  let sum = 0
  for (const item of dataArray) {
    const val = item - 128
    sum += Math.abs(val)
  }
  const avg = sum / dataArray.length  // ~0..128
  amplitude.value = Math.min(avg / 128, 1)  // нормируем до ~0..1

  amplitudeHistory.value.shift();
  amplitudeHistory.value.push(amplitude.value);

  audioEnabled.value = !amplitudeHistory.value.some((v) => !v);
};

const cleanupAudioAnalyser = () => {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  if (source) {
    source.disconnect()
    source = null
  }
  if (analyser) {
    analyser.disconnect()
    analyser = null
  }
  if (audioContext) {
    // audioContext.close()  // по желанию, но закрывать может убить и другие источники
    audioContext = null
  }
};

// Когда этот компонент демонтируется, чистим
onUnmounted(() => {
  cleanupAudioAnalyser()
})

// ----------------------------
// Следим за srcObject
// ----------------------------
const localVideoEl = ref<HTMLVideoElement|null>(null)

// Юзер вам передаёт prop: videoRef – колбэк.
// Вы можете в нём также сохранить себе локально ссылку.
const videoRefLocal = (el?: HTMLVideoElement) => {
  if (!el || el === localVideoEl.value) return;

  props.videoRef(el)  // чтобы внешний код тоже работал
  localVideoEl.value = el
};

// ----------------------------
// Анимация / визуализация
// ----------------------------
const visualizerStyle = computed(() => {
  // Пример простейшей полоски: высота = amplitude * 100%,
  // но тут используем "scaleY"
  // (transform-origin: bottom) чтобы казалось, что полоска "поднимается".
  return {
    transformOrigin: 'bottom',
    transform: `scaleY(${ amplitude.value })`,
  }
});

const onCheckStream = () => {
  audioEnabled.value = props.stream.getAudioTracks().some((track) => track.enabled);
  videoEnabled.value = props.stream.getVideoTracks().some((track) => track.enabled);

  if (
    props.stream.getAudioTracks().length > 1 ||
    props.stream.getVideoTracks().length > 1
  ) console.warn('[VideoItem] over count tracks:', props.stream.getTracks());

  props.stream.getAudioTracks().forEach((track) => {
    track.removeEventListener('mute', onCheckStream);
    track.removeEventListener('unmute', onCheckStream);
    track.removeEventListener('ended', onCheckStream);

    track.addEventListener('mute', onCheckStream);
    track.addEventListener('unmute', onCheckStream);
    track.addEventListener('ended', onCheckStream);
  });

  if (audioEnabled.value) setupAudioAnalyser(props.stream);
  else cleanupAudioAnalyser();
};

watch(() => props.stream, (v) => {
  // TODO: при прекращении стрима есть лаг с растягиванием видео
  //  Надо бы делать последний кадр в canvas и анимировать красиво
  if (v && localVideoEl.value) props.videoRef(localVideoEl.value)
});

watch([audioEnabled, videoEnabled], (a, v) => {
  if (!a && !v && props.opened) emit('teleport');
});

watch(localVideoEl, (el) => {
  if (el) audioOutputStore.register(el);
});

watch(() => props.constraints, () => {
  onCheckStream();
}, { deep: true });

onMounted(() => {
  onCheckStream();

  props.stream.addEventListener('addtrack', onCheckStream);

  props.stream.addEventListener('removetrack', onCheckStream);

  props.stream.addEventListener('change', onCheckStream);
});

onBeforeUnmount(() => {
  props.stream.getAudioTracks().forEach((track) => {
    track.removeEventListener('mute', onCheckStream);
    track.removeEventListener('unmute', onCheckStream);
    track.removeEventListener('ended', onCheckStream);
  });

  props.stream.removeEventListener('addtrack', onCheckStream);

  props.stream.removeEventListener('removetrack', onCheckStream);

  props.stream.removeEventListener('change', onCheckStream);

  if (localVideoEl.value) audioOutputStore.dispose(localVideoEl.value);
});
</script>

<template>
  <Motion
    as="div"
    layout
    :initial="{ opacity: 0 }"
    :animate="{ opacity: 1, transition: { delay: 0.5 } }"
    :exit="{ opacity: 0 }"
    :class="$attrs.class"
    :data-open="opened"
  >
    <Motion
      as="div"
      layout
      @click="videoEnabled && emit('teleport')"
      class="overflow-hidden relative rounded-sm flex items-center justify-center"
      :class="{
        'aspect-video': !opened,
        'full-area': opened,
        'bg-black': videoEnabled,
      }"
    >
      <Motion
        v-show="videoEnabled"
        as="video"
        layout
        :ref="(el) => videoRefLocal(el?.$el as HTMLVideoElement)"
        autoplay
        :data-open="opened"
        playsinline
        :muted="audioOutputStore.muted"
        class="block max-h-full w-full object-center"
        :class="[{ '-scale-x-100': mirrored }, opened ? 'object-contain' : 'object-cover']"
        v-bind="$attrs"
      />
      <div
        v-if="!videoEnabled"
        class="bg-surface-300 dark:bg-surface-800 flex items-center justify-center h-full w-full"
      >
        <Avatar
          :label="label"
          size="large"
          shape="circle"
        />
      </div>

      <!-- Небольшая "полоска" визуализации (пример). Появляется только если audio. -->
      <Motion
        v-if="audioEnabled"
        as="div"
        layout
        class="absolute top-0 left-0 bottom-8 w-1 flex items-end"
      >
        <div
          class="w-full h-full dark:bg-primary-500 bg-primary-600"
          :style="visualizerStyle"
        />
      </Motion>

      <Motion
        as="div"
        layout
        class="absolute bottom-0 left-0 right-0 bg-surface-400/20 dark:bg-surface-600/20 text-center text-sm flex h-8 justify-center"
      >
        <div
          v-if="audioEnabled"
          class="absolute top-0 left-0 h-full w-1 dark:bg-primary-500 bg-primary-600"
        />

        <Motion as="div" layout="position" class="w-fit flex items-center gap-2">
          {{ username }}
          <span
            class="material-icons-outlined !text-lg"
            :class="audioEnabled ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
          >
            {{ audioEnabled ? 'mic' : 'mic_off' }}
          </span>
        </Motion>
      </Motion>
    </Motion>
  </Motion>
</template>

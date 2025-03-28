<script lang="ts" setup>
const props = defineProps<{
  stream?: MediaStream | null;
  videoRef: (el: HTMLVideoElement) => void;
  username: string;
  video?: boolean;
  audio?: boolean;
  opened?: boolean;
}>();
defineOptions({ inheritAttrs: false });

const { audio, stream } = toRefs(props);

const audioOutputStore = useAudioOutputStore();

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

function setupAudioAnalyser(stream: MediaStream) {
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
  } catch (e) {
    console.warn('[Audio Analyser] setup error:', e)
  }
}

function animate() {
  if (!analyser || !dataArray) return

  rafId = requestAnimationFrame(animate)
  analyser.getByteTimeDomainData(dataArray)

  let sum = 0
  for (let i = 0; i < dataArray.length; i++) {
    const val = dataArray[i] - 128
    sum += Math.abs(val)
  }
  const avg = sum / dataArray.length  // ~0..128
  amplitude.value = Math.min(avg / 128, 1)  // нормируем до ~0..1
}

function cleanupAudioAnalyser() {
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
}

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
function videoRefLocal(el: HTMLVideoElement) {
  if (el === localVideoEl.value) return;

  props.videoRef(el)  // чтобы внешний код тоже работал
  localVideoEl.value = el
}

watch(stream, (v) => {
  // TODO: при прекращении стрима есть лаг с растягиванием видео
  //  Надо бы делать последний кадр в canvas и анимировать красиво
  if (v && localVideoEl.value) props.videoRef(localVideoEl.value)
});

watch([audio, stream], ([v, s]) => {
  if (v && s) {
    if (s.getAudioTracks().length) setupAudioAnalyser(s);
    else cleanupAudioAnalyser();

    s.addEventListener('addtrack', () => {
      if (s.getAudioTracks().length) setupAudioAnalyser(s);
      else cleanupAudioAnalyser();
    });

    s.addEventListener('removetrack', () => {
      if (s.getAudioTracks().length) setupAudioAnalyser(s);
      else cleanupAudioAnalyser();
    });
  } else {
    // audio=false или srcObject=null => глушим
    cleanupAudioAnalyser()
    amplitude.value = 0
  }
}, { immediate: true });

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

watch(localVideoEl, (el) => {
  if (el) audioOutputStore.register(el);
});

onBeforeUnmount(() => {
  if (localVideoEl.value) audioOutputStore.dispose(localVideoEl.value);
});
</script>

<template>
  <div
    class="overflow-hidden relative"
    :class="[{
      'rounded-sm aspect-video': !opened,
      'h-full w-full': opened,
    }]"
  >
    <video
      v-show="video"
      :ref="(el) => videoRefLocal(el as HTMLVideoElement)"
      autoplay
      playsinline
      :muted="audioOutputStore.muted"
      class="bg-black h-full w-full object-contain object-center"
      v-bind="$attrs"
    />
    <div
      v-if="!video"
      class="bg-surface-300 dark:bg-surface-800 flex items-center justify-center h-full w-full"
    >
      <Avatar
        :label="label"
        size="large"
        shape="circle"
      />
    </div>

    <!-- Небольшая "полоска" визуализации (пример). Появляется только если audio. -->
    <div
      v-if="audio"
      class="absolute top-0 left-0 bottom-8 w-1 dark:bg-primary-500 bg-primary-600"
      :style="visualizerStyle"
    />

    <div
      class="absolute bottom-0 left-0 right-0 bg-surface-400/20 dark:bg-surface-600/20 text-center text-sm flex items-center h-8 gap-2 justify-center"
    >
      <div
        v-if="audio"
        class="absolute top-0 left-0 h-full w-1 dark:bg-primary-500 bg-primary-600"
      />

      {{ username }}
      <span
        v-if="!audio"
        class="material-icons-outlined text-red-600 dark:text-red-400 !text-lg"
      >
        mic_off
      </span>
    </div>
  </div>
</template>

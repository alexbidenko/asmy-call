export const useScreenShareStore = defineStore('screen_share', () => {
  const stream = shallowRef<MediaStream | null>(null);
  const element = ref<HTMLVideoElement>();

  const enabled = computed(() => !!stream.value);

  const stop = () => {
    if (!stream.value) return;

    stream.value.getTracks().forEach((t) => t.stop());
    stream.value = null;
  }

  const start = async () => {
    stop();

    const screen = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    stream.value = screen;

    screen.getVideoTracks()[0]
      ?.addEventListener('ended', () => stop());

    nextTick(() => {
      if (element.value && stream.value) {
        element.value.srcObject = stream.value;
      } else {
        console.error('Start local streaming problem, element=', element.value);
      }
    });
  };

  onBeforeUnmount(() => {
    // 4) Остановить трансляцию экрана, если запущена
    if (stream.value) {
      stream.value.getTracks().forEach((t) => t.stop())
      stream.value = null
    }
  });

  return {
    stream,
    enabled,
    element,

    start,
    stop,
  };
});

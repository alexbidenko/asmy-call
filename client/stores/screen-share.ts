export const useScreenShareStore = defineStore('screen_share', () => {
  const element = ref<HTMLVideoElement>();

  const { isSupported, enabled, stream, stop, start } = useDisplayMedia({
    video: true,
    audio: true,
  });

  onBeforeUnmount(() => {
    stop();
  });

  watchEffect(() => {
    if (element.value && stream.value) element.value.srcObject = stream.value;
  });

  return {
    stream,
    enabled,
    element,
    supported: isSupported,

    start,
    stop,
  };
});

export const useAudioOutputStore = defineStore('audio_output', () => {
  const deviceStore = useDeviceStore();

  const muted = ref(false);

  const sources = reactive(new Set<HTMLVideoElement>());

  const setup = (el: HTMLVideoElement) => {
    el.setSinkId(deviceStore.selectedAudioOutput).catch((error) => {
      console.error('Error setting sinkId:', error)
    });
  };

  const register = (el: HTMLVideoElement) => {
    if (!sources.has(el)) {
      sources.add(el);
      setup(el);
    }
  };

  const dispose = (el: HTMLVideoElement) => {
    if (sources.has(el)) sources.delete(el);
  };

  watch(() => deviceStore.selectedAudioOutput, (v) => {
    sources.forEach(setup);
  }, { immediate: true });

  return {
    muted,

    register,
    dispose,
  };
});

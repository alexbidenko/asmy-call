export const useAudioOutputStore = defineStore('audio_output', () => {
  const deviceStore = useDeviceStore();

  const muted = ref(false);

  const sources = reactive(new Set<HTMLVideoElement>());

  const setup = async (el: HTMLVideoElement) => {
    try {
      await el.setSinkId(deviceStore.selectedAudioOutput);
    } catch (error) {
      console.error('Error setting sinkId:', error)
    }
  };

  const register = async (el: HTMLVideoElement) => {
    if (!sources.has(el)) {
      sources.add(el);
      await setup(el);
    }
  };

  const dispose = (el: HTMLVideoElement) => {
    if (sources.has(el)) sources.delete(el);
  };

  watch(() => deviceStore.selectedAudioOutput, () => {
    sources.forEach(setup);
  });

  return {
    muted,

    register,
    dispose,
  };
});

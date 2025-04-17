export const useDeviceStore = defineStore('device', () => {
  const selectedAudioInput = ref('default');
  const selectedAudioOutput = ref('default');
  const selectedVideoInput = ref('default');

  const {
    videoInputs,
    audioInputs,
    audioOutputs,
    ensurePermissions,
  } = useDevicesList({
    onUpdated: () => {
      if (
        selectedAudioInput.value !== 'default' &&
        !audioInputs.value.some((d) => d.deviceId === selectedAudioInput.value)
      ) {
        selectedAudioInput.value = 'default'
      }

      if (
        selectedAudioOutput.value !== 'default' &&
        !audioOutputs.value.some((d) => d.deviceId === selectedAudioOutput.value)
      ) {
        selectedAudioOutput.value = 'default'
      }

      if (
        selectedVideoInput.value !== 'default' &&
        !videoInputs.value.some((d) => d.deviceId === selectedVideoInput.value)
      ) {
        selectedVideoInput.value = 'default'
      }
    },
  });

  const loadFromStorage = () => {
    const aIn = localStorage.getItem('selAudioIn')
    const aOut = localStorage.getItem('selAudioOut')
    const vIn = localStorage.getItem('selVideoIn')
    if (aIn) selectedAudioInput.value = aIn
    if (aOut) selectedAudioOutput.value = aOut
    if (vIn) selectedVideoInput.value = vIn
  };

  watch(selectedAudioInput, (v) => localStorage.setItem('selAudioIn', v));
  watch(selectedAudioOutput, (v) => localStorage.setItem('selAudioOut', v));
  watch(selectedVideoInput, (v) => localStorage.setItem('selVideoIn', v));

  // Возвращаем всё, что нужно
  return {
    audioInputs,
    audioOutputs,
    videoInputs,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,

    ensurePermissions,
    loadFromStorage,
  }
})

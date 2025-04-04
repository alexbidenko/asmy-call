export type DeviceInfo = {
  deviceId: string
  label: string
  kind: MediaDeviceKind
};

export const useDeviceStore = defineStore('device', () => {
  const audioInputs = ref<DeviceInfo[]>([])
  const audioOutputs = ref<DeviceInfo[]>([])
  const videoInputs = ref<DeviceInfo[]>([])

  const selectedAudioInput = ref('default')
  const selectedAudioOutput = ref('default')
  const selectedVideoInput = ref('default')

  // Новая функция: проверяет, если выбранное устройство недоступно – переключает на "default"
  const checkSelectedDevices = () => {
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
  }

  const enumerateDevices = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    audioInputs.value = []
    audioOutputs.value = []
    videoInputs.value = []

    devices.forEach((d) => {
      if (d.deviceId) {
        const info: DeviceInfo = {
          deviceId: d.deviceId,
          label: d.label || d.kind,
          kind: d.kind
        }
        if (d.kind === 'audioinput') audioInputs.value.push(info)
        if (d.kind === 'audiooutput') audioOutputs.value.push(info)
        if (d.kind === 'videoinput') videoInputs.value.push(info)
      }
    });

    // Проверяем, доступны ли выбранные устройства
    checkSelectedDevices()
  };

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

    enumerateDevices,
    loadFromStorage,
  }
})

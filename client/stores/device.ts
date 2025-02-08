export interface DeviceInfo {
  deviceId: string
  label: string
  kind: MediaDeviceKind
}

export const useDeviceStore = defineStore('device', () => {
  const audioInputs = ref<DeviceInfo[]>([])
  const audioOutputs = ref<DeviceInfo[]>([])
  const videoInputs = ref<DeviceInfo[]>([])

  const selectedAudioInput = ref('default')
  const selectedAudioOutput = ref('default')
  const selectedVideoInput = ref('default')

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
    })
  }

  const loadFromStorage = () => {
    const aIn = localStorage.getItem('selAudioIn')
    const aOut = localStorage.getItem('selAudioOut')
    const vIn = localStorage.getItem('selVideoIn')
    if (aIn) selectedAudioInput.value = aIn
    if (aOut) selectedAudioOutput.value = aOut
    if (vIn) selectedVideoInput.value = vIn
  }

  const saveToStorage = () => {
    localStorage.setItem('selAudioIn', selectedAudioInput.value)
    localStorage.setItem('selAudioOut', selectedAudioOutput.value)
    localStorage.setItem('selVideoIn', selectedVideoInput.value)
  }

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
    saveToStorage
  }
})

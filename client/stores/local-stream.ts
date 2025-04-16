export const useLocalStreamStore = defineStore('local_stream', () => {
  const deviceStore = useDeviceStore();
  const toast = useToast();

  const stream = ref<MediaStream | null>(null);
  const audio = ref(false);
  const video = ref(false);
  const constraints = reactive({
    audio: 'none',
    video: 'none',
  });

  const init = async () => {
    stream.value = await navigator.mediaDevices.getUserMedia({
      audio: deviceStore.selectedAudioInput === 'default' ?
        true :
        { deviceId: { exact: deviceStore.selectedAudioInput } },
    });
    stream.value.getAudioTracks()[0].enabled = false;
  };

  watch([audio, () => deviceStore.selectedAudioInput], async ([enabled, device]) => {
    if (!stream.value) return;

    const track = stream.value.getAudioTracks()[0];

    if (!enabled) {
      track.enabled = false;
      constraints.audio = 'none';
      return;
    }

    if (device === constraints.audio) {
      track.enabled = true;
      return;
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: device === 'default' ? true : { deviceId: { exact: device } },
    });
    track.stop();
    stream.value.removeTrack(track);
    stream.value.addTrack(mediaStream.getAudioTracks()[0]);

    constraints.audio = device;
  });

  watch([video, () => deviceStore.selectedVideoInput], async ([enabled, device]) => {
    if (!stream.value) return;

    for (const track of stream.value.getVideoTracks()) {
      track.stop();
      stream.value.removeTrack(track);
    }

    if (!enabled) {
      constraints.video = 'none';
      return;
    }

    const result = await deviceStore.ensurePermissions();
    if (!result) {
      toast.add({
        severity: 'warn',
        summary: 'Вы должны дать доступ к камере, чтобы продолжить'
      });
      return;
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: device === 'default' ? true : { deviceId: { exact: device } },
    });
    stream.value.addTrack(mediaStream.getVideoTracks()[0]);

    constraints.video = device;
  });

  onBeforeUnmount(() => {
    if (stream.value) {
      stream.value.getTracks().forEach(t => t.stop())
      stream.value = null;
    }
  });

  return {
    stream: computed(() => stream.value),
    audio,
    video,
    constraints,

    init,
  };
});

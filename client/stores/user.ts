export const useUserStore = defineStore('user', () => {
  const toast = useToast();

  const username = ref(localStorage.getItem('username') || '');
  const initialized = ref(false);

  const ready = computed(() => !!username.value.trim());

  const initialize = async () => {
    const permissionStatus = await navigator.permissions.query({ name: 'microphone' })

    if (permissionStatus.state === 'granted') {
      // Уже дано разрешение
      initialized.value = true
    } else if (permissionStatus.state === 'denied') {
      toast.add({
        severity: 'warn',
        summary: 'Вы должны дать доступ к микрофону, чтобы пользоваться приложением'
      })
    } else {
      // Пробуем запросить доступ к микрофону
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        // Если пользователь дал разрешение → всё ок
        initialized.value = true
      } catch {
        // Пользователь отменил / отклонил → показываем предупреждение
        toast.add({
          severity: 'warn',
          summary: 'Вы должны дать доступ к микрофону, чтобы пользоваться приложением'
        })
      }
    }
  };

  watch(username, (v) => {
    localStorage.setItem('username', v);
  });

  return { username, initialized, ready, initialize };
});

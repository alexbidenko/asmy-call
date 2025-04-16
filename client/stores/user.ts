export const useUserStore = defineStore('user', () => {
  const toast = useToast();

  const username = ref(localStorage.getItem('username') || '');
  const initialized = ref(false);

  const { ensurePermissions } = useDevicesList({ constraints: { audio: true } });

  const ready = computed(() => !!username.value.trim());

  const initialize = async () => {
    const result = await ensurePermissions();

    if (result) initialized.value = true;
    else {
      toast.add({
        severity: 'warn',
        summary: 'Вы должны дать доступ к микрофону, чтобы пользоваться приложением'
      });
    }
  };

  watch(username, (v) => {
    localStorage.setItem('username', v);
  });

  return { username, initialized, ready, initialize };
});

export const useUserStore = defineStore('user', () => {
  const route = useRoute();

  const username = ref(localStorage.getItem('username') || '');
  const initialized = ref(false);

  const ready = computed(() => !!username.value.trim());

  const room = computed(() => typeof route.params.room === 'string' ? route.params.room : '');

  watch(username, (v) => {
    localStorage.setItem('username', v);
  });

  return { username, initialized, ready, room };
});

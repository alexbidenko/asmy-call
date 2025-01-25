export const useInterfaceStore = defineStore('interface', () => {
  const isChatVisible = ref(false);

  return { isChatVisible };
});

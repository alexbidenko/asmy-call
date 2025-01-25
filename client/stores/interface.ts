export const useInterfaceStore = defineStore('interface', () => {
  const isChatVisible = ref(false);

  const isMembersVisible = ref(true);

  const isLargeVideoVisible = ref(false);

  watch(isLargeVideoVisible, (v) => {
    if (!v) isMembersVisible.value = true;
  });

  return { isChatVisible, isMembersVisible, isLargeVideoVisible };
});

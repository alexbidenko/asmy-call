export const useInterfaceStore = defineStore('interface', () => {
  const isChatVisible = ref(false);

  const isMembersVisible = ref(true);

  const isLargeVideoVisible = ref(false);

  const isSettingDialogVisible = ref(false);

  const { system: theme, store: themeMode } = useColorMode();

  watch(isLargeVideoVisible, (v) => {
    if (!v) isMembersVisible.value = true;
  });

  return {
    isChatVisible,
    isMembersVisible,
    isLargeVideoVisible,
    isSettingDialogVisible,
    theme,
    themeMode,
  };
});

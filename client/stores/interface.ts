export enum ThemeEnum {
  dark = 'dark',
  light = 'light',
  system = 'system',
}

const THEME_KEY = 'application_theme';

export const useInterfaceStore = defineStore('interface', () => {
  const isChatVisible = ref(false);

  const isMembersVisible = ref(true);

  const isLargeVideoVisible = ref(false);

  const themeMode = useState('theme_mode', () => {
    const prev = localStorage.getItem(THEME_KEY);
    if (prev) return prev;

    return ThemeEnum.system;
  });
  const theme = useState('theme', () => {
    if (themeMode.value === ThemeEnum.system) {
      const darkMq = window.matchMedia('(prefers-color-scheme: dark)')
      return darkMq.matches ? ThemeEnum.dark : ThemeEnum.light;
    }

    return themeMode.value;
  });

  const isSettingDialogVisible = ref(false);

  watch(isLargeVideoVisible, (v) => {
    if (!v) isMembersVisible.value = true;
  });

  watch(themeMode, (v) => {
    localStorage.setItem(THEME_KEY, v);

    if (themeMode.value === ThemeEnum.system) {
      const darkMq = window.matchMedia('(prefers-color-scheme: dark)')
      theme.value = darkMq.matches ? ThemeEnum.dark : ThemeEnum.light;
    } else theme.value = themeMode.value;
  });

  onMounted(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', () => {
      if (themeMode.value === 'system') {
        const darkMq = window.matchMedia('(prefers-color-scheme: dark)')
        theme.value = darkMq.matches ? ThemeEnum.dark : ThemeEnum.light;
      }
    })
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

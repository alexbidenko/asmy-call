export enum ThemeModeEnum {
  dark = 'dark',
  light = 'light',
  system = 'system',
}

export enum ThemeEnum {
  dark = 'dark',
  light = 'light',
}

const THEME_KEY = 'application_theme';

const getSystemTheme = () => {
  const darkMq = window.matchMedia('(prefers-color-scheme: dark)')
  return darkMq.matches ? ThemeEnum.dark : ThemeEnum.light;
};

export const useInterfaceStore = defineStore('interface', () => {
  const isChatVisible = ref(false);

  const isMembersVisible = ref(true);

  const isLargeVideoVisible = ref(false);

  const themeMode = useState('theme_mode', () => {
    const prev = localStorage.getItem(THEME_KEY);
    if (prev) return prev;

    return ThemeModeEnum.system;
  });
  const theme = useState('theme', () => {
    if (themeMode.value === ThemeModeEnum.system) return getSystemTheme();

    return themeMode.value;
  });

  const isSettingDialogVisible = ref(false);

  watch(isLargeVideoVisible, (v) => {
    if (!v) isMembersVisible.value = true;
  });

  watch(themeMode, (v) => {
    localStorage.setItem(THEME_KEY, v);

    theme.value = themeMode.value === ThemeModeEnum.system ? getSystemTheme() : themeMode.value;
  });

  onMounted(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', () => {
      if (themeMode.value === 'system') theme.value = getSystemTheme();
    });
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

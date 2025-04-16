import type {UseShareOptions} from "@vueuse/core";

export const useSimpleShare = () => {
  const toast = useToast();
  const { share, isSupported: isSupportedShare } = useShare();
  const { copy, isSupported: isSupportedClipboard } = useClipboard();

  return (content: UseShareOptions) => {
    if (isSupportedShare) void share(content);
    else if (isSupportedClipboard) copy(content.url ?? '').then(() => {
      toast.add({
        summary: 'Ссылка скопирована в буфер обмена',
        severity: 'info',
      });
    });
    else toast.add({
      summary: 'Это что за устройство динозавров?',
      detail: 'У вас ничего не поддерживается, чтобы скопировать ссылку - делитесь в ручную...',
      severity: 'error',
    });
  };
};

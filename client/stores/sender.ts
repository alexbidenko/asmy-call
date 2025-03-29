export enum SenderTypeEnum {
  default = 'default',
  screen = 'screen',
}

type SenderGroupType = {
  defaultAudio?: RTCRtpSender;
  defaultVideo?: RTCRtpSender;
  screenAudio?: RTCRtpSender;
  screenVideo?: RTCRtpSender;
};

export const useSenderStore = defineStore('sender', () => {
  const value = reactive<Record<string, SenderGroupType>>({});

  const getKind = (kind: string) => {
    if (kind === 'video') return 'Video';
    if (kind === 'audio') return 'Audio';
    throw new Error(`Unknown kind: ${kind}`);
  };

  const find = (type: SenderTypeEnum, remoteId: string) => {
    const group = value[remoteId];

    return {
      audio: group?.[`${type}Audio`] ?? null,
      video: group?.[`${type}Video`] ?? null,
    };
  };

  const save = (type: SenderTypeEnum, remoteId: string, sender: RTCRtpSender) => {
    if (!sender.track) return;

    if (!value[remoteId]) value[remoteId] = {};

    value[remoteId][`${type}${getKind(sender.track.kind)}`] = sender;
  };

  const remove = (type: SenderTypeEnum, remoteId: string, target: MediaStreamTrack | RTCRtpSender) => {
    if (!value[remoteId]) return null;

    let key = 'kind' in target ? `${type}${getKind(target.kind)}` as const : ((): keyof SenderGroupType | null => {
      if (value[remoteId][`${type}Audio`] === target) return `${type}Audio`;
      if (value[remoteId][`${type}Video`] === target) return `${type}Video`;
      return null;
    })();

    if (!key) return null;

    const sender = value[remoteId][key];

    if (!sender) return null;

    delete value[remoteId][key];
    if (!Object.keys(value[remoteId]).length) delete value[remoteId];

    return sender;
  };

  return {
    value,

    find,
    save,
    remove,
  };
});

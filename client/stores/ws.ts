import { type Socket, io } from "socket.io-client";

export const useWsStore = defineStore('ws', () => {
  const config = useRuntimeConfig();

  const localSocket = shallowRef<Socket | null>(null);

  const socket = computed(() => {
    if (!localSocket.value) localSocket.value = io(config.public.apiHost || '', { forceNew: true });
    return localSocket.value;
  });

  onBeforeUnmount(() => {
    localSocket.value?.disconnect()
  });

  return { socket };
});

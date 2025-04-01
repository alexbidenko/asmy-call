<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem'

const interfaceStore = useInterfaceStore()
const deviceStore = useDeviceStore()
const audioOutputStore = useAudioOutputStore();
const screenShareStore = useScreenShareStore();
const roomStore = useRoomStore();
const localStreamStore = useLocalStreamStore();
const router = useRouter();

const micMenu = ref()
const audioMenu = ref()
const videoMenu = ref()

// Списки устройств (микрофоны, колонки, камеры)
const micItems = computed<MenuItem[]>(() =>
  deviceStore.audioInputs.map((dev) => ({
    label: dev.label,
    command: () => {
      deviceStore.selectedAudioInput = dev.deviceId
    },
    class: deviceStore.selectedAudioInput === dev.deviceId ? 'border-l border-l-2 border-l-primary ml-[-2px]' : '',
  }))
);

const audioItems = computed<MenuItem[]>(() =>
  deviceStore.audioOutputs.map((dev) => ({
    label: dev.label,
    command: () => {
      deviceStore.selectedAudioOutput = dev.deviceId
    },
    class: deviceStore.selectedAudioOutput === dev.deviceId ? 'border-l border-l-2 border-l-primary ml-[-2px]' : '',
  }))
);

const videoItems = computed<MenuItem[]>(() =>
  deviceStore.videoInputs.map((dev) => ({
    label: dev.label,
    command: () => {
      deviceStore.selectedVideoInput = dev.deviceId
    },
    class: deviceStore.selectedVideoInput === dev.deviceId ? 'border-l border-l-2 border-l-primary ml-[-2px]' : '',
  }))
);

const exit = async () => {
  await router.push('/');

  roomStore.$dispose();
};
</script>

<template>
  <div class="bg-surface-100 dark:bg-surface-800 overflow-auto h-control">
    <div class="flex justify-center gap-2 py-2 px-4 w-fit mx-auto">
      <!-- Микрофон -->
      <div class="flex gap-1 p-1 bg-primary-600 rounded-full">
        <Menu ref="micMenu" :model="micItems" :popup="true" class="max-w-80" />
        <Button @click="micMenu?.toggle" :disabled="!micItems.length" rounded text>
          <template #icon>
            <span class="material-icons-outlined">keyboard_arrow_up</span>
          </template>
        </Button>

        <Button @click="localStreamStore.audio = !localStreamStore.audio" rounded>
          <template #icon>
            <span class="material-icons-outlined">
              {{ localStreamStore.audio ? 'mic' : 'mic_off' }}
            </span>
          </template>
        </Button>
      </div>

      <!-- Вывод звука -->
      <div class="flex gap-1 p-1 bg-primary-600 rounded-full">
        <Menu ref="audioMenu" :model="audioItems" :popup="true" class="max-w-80" />
        <Button @click="audioMenu?.toggle" :disabled="!audioItems.length" rounded text>
          <template #icon>
            <span class="material-icons-outlined">keyboard_arrow_up</span>
          </template>
        </Button>

        <Button @click="audioOutputStore.muted = !audioOutputStore.muted" rounded>
          <template #icon>
            <span class="material-icons-outlined">
              {{ audioOutputStore.muted ? 'volume_off' : 'volume_up' }}
            </span>
          </template>
        </Button>
      </div>

      <!-- Камера -->
      <div class="flex gap-1 p-1 bg-primary-600 rounded-full">
        <Menu ref="videoMenu" :model="videoItems" :popup="true" class="max-w-80" />
        <Button @click="videoMenu?.toggle" :disabled="!videoItems.length" rounded text>
          <template #icon>
            <span class="material-icons-outlined">keyboard_arrow_up</span>
          </template>
        </Button>

        <Button @click="localStreamStore.video = !localStreamStore.video" rounded>
          <template #icon>
            <span class="material-icons-outlined">
              {{ localStreamStore.video ? 'videocam' : 'videocam_off' }}
            </span>
          </template>
        </Button>
      </div>

      <div class="flex gap-1 p-1 rounded-full" :class="screenShareStore.enabled ? 'bg-primary-600' : 'bg-primary-400'">
        <Button @click="screenShareStore.start" rounded>
          <template #icon>
            <span class="material-icons-outlined">
              screen_share
            </span>
          </template>
        </Button>

        <Button v-if="screenShareStore.enabled" @click="screenShareStore.stop" rounded>
          <template #icon>
            <span class="material-icons-outlined">
              stop_screen_share
            </span>
          </template>
        </Button>
      </div>

      <div v-if="interfaceStore.isLargeVideoVisible" class="flex gap-1 p-1 rounded-full bg-primary-400">
        <Button @click="interfaceStore.isMembersVisible = !interfaceStore.isMembersVisible" rounded>
          <template #icon>
            <span class="material-icons-outlined">
              {{ interfaceStore.isMembersVisible ? 'group' : 'group_off' }}
            </span>
          </template>
        </Button>
      </div>

      <div class="flex gap-1 p-1 rounded-full bg-primary-400">
        <Button @click="interfaceStore.isChatVisible = !interfaceStore.isChatVisible" rounded>
          <template #icon>
            <span class="material-icons-outlined">
              chat
            </span>
          </template>
        </Button>
      </div>

      <div class="flex gap-1 p-1 rounded-full bg-primary-400">
        <Button @click="interfaceStore.isSettingDialogVisible = true" rounded>
          <template #icon>
            <span class="material-icons-outlined">
              settings
            </span>
          </template>
        </Button>
      </div>

      <div class="flex gap-1 p-1 rounded-full bg-primary-400">
        <Button @click="exit" rounded>
          <template #icon>
            <span class="material-icons-outlined text-red-500 dark:text-red-600">
              phone_disabled
            </span>
          </template>
        </Button>
      </div>
    </div>
  </div>
</template>

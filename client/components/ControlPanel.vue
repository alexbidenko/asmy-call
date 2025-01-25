<template>
  <div class="flex justify-center gap-2 py-2 px-4">
    <!-- Микрофон -->
    <div class="flex gap-1 p-1 bg-primary-600 rounded-full">
      <Menu ref="micMenu" :model="micItems" :popup="true" class="max-w-80" />
      <Button @click="micMenu?.show" rounded text>
        <template #icon>
          <span class="material-icons-outlined">keyboard_arrow_up</span>
        </template>
      </Button>

      <Button @click="toggleMic" rounded>
        <template #icon>
          <span class="material-icons-outlined">
            {{ webrtcStore.isMicOn ? 'mic' : 'mic_off' }}
          </span>
        </template>
      </Button>
    </div>

    <!-- Вывод звука -->
    <div class="flex gap-1 p-1 bg-primary-600 rounded-full">
      <Menu ref="audioMenu" :model="audioItems" :popup="true" class="max-w-80" />
      <Button @click="audioMenu?.show" rounded text>
        <template #icon>
          <span class="material-icons-outlined">keyboard_arrow_up</span>
        </template>
      </Button>

      <Button @click="webrtcStore.isOutputOn = !webrtcStore.isOutputOn" rounded>
        <template #icon>
          <span class="material-icons-outlined">
            {{ webrtcStore.isOutputOn ? 'volume_up' : 'volume_off' }}
          </span>
        </template>
      </Button>
    </div>

    <!-- Камера -->
    <div class="flex gap-1 p-1 bg-primary-600 rounded-full">
      <Menu ref="videoMenu" :model="videoItems" :popup="true" class="max-w-80" />
      <Button @click="videoMenu?.show" rounded text>
        <template #icon>
          <span class="material-icons-outlined">keyboard_arrow_up</span>
        </template>
      </Button>

      <Button @click="toggleCam" rounded>
        <template #icon>
          <span class="material-icons-outlined">
            {{ webrtcStore.isCamOn ? 'videocam' : 'videocam_off' }}
          </span>
        </template>
      </Button>
    </div>

    <div class="flex gap-1 p-1 rounded-full" :class="webrtcStore.isScreenSharing ? 'bg-primary-600' : 'bg-primary-400'">
      <Button @click="startShare" rounded>
        <template #icon>
          <span class="material-icons-outlined">
            screen_share
          </span>
        </template>
      </Button>

      <Button v-if="webrtcStore.isScreenSharing" @click="stopShare" rounded>
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
  </div>
</template>

<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem'

const interfaceStore = useInterfaceStore()
const webrtcStore = useWebrtcStore()
const deviceStore = useDeviceStore()

const micMenu = ref()
const audioMenu = ref()
const videoMenu = ref()

/**
 * Выбираем новое устройство вывода -> обновляем sinkId у локального и всех remote video
 */
const onOutputChange = () => {
  if (webrtcStore.localVideo) {
    setSink(webrtcStore.localVideo, deviceStore.selectedAudioOutput)
  }
  webrtcStore.remoteStreams.forEach((obj) => {
    const videoEl = document.getElementById('video-' + obj.id) as HTMLVideoElement
    if (videoEl) setSink(videoEl, deviceStore.selectedAudioOutput)
  })
  deviceStore.saveToStorage()
};

// Настройка sinkId
function setSink(el: HTMLVideoElement, sinkId: string) {
  if (typeof el.sinkId !== 'undefined' && sinkId !== 'default') {
    el.setSinkId(sinkId).catch((err) => {
      console.warn('Error setting sinkId:', err)
    })
  }
}

// Списки устройств (микрофоны, колонки, камеры)
const micItems = computed<MenuItem[]>(() =>
  deviceStore.audioInputs.map((dev) => ({
    label: dev.label,
    command: () => {
      deviceStore.selectedAudioInput = dev.deviceId
      // После смены микрофона — пересоздаём стрим
      webrtcStore.startOrUpdateStream()
    }
  }))
)

const audioItems = computed<MenuItem[]>(() =>
  deviceStore.audioOutputs.map((dev) => ({
    label: dev.label,
    command: () => {
      deviceStore.selectedAudioOutput = dev.deviceId
      onOutputChange()
    }
  }))
)

const videoItems = computed<MenuItem[]>(() =>
  deviceStore.videoInputs.map((dev) => ({
    label: dev.label,
    command: () => {
      deviceStore.selectedVideoInput = dev.deviceId
      // После смены камеры — пересоздаём стрим
      webrtcStore.startOrUpdateStream()
    }
  }))
)

// Тогглы микрофона/камеры – просто вызывают toggleMic / toggleCam
function toggleMic() {
  webrtcStore.toggleMic(!webrtcStore.isMicOn)
}

function toggleCam() {
  webrtcStore.toggleCam(!webrtcStore.isCamOn)
}

// Шеринг экрана
function startShare() {
  webrtcStore.startScreenShare()
}
function stopShare() {
  webrtcStore.stopScreenShare()
}
</script>

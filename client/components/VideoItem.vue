<template>
  <div
    class="w-64 overflow-hidden relative"
    :class="{ 'rounded-sm aspect-video': !opened, 'h-full w-full': opened }"
  >
    <video
      v-if="video"
      :ref="(el) => videoRef(el as HTMLVideoElement)"
      @click="$emit('teleport', streamId)"
      autoplay
      playsinline
      muted
      class="bg-black h-full w-full object-contain object-center"
      v-bind="$attrs"
    />
    <div v-else class="bg-surface-800 flex items-center justify-center h-full w-full">
      <Avatar :label="label" class="mr-2" size="xlarge" shape="circle" />
    </div>
    <span class="absolute bottom-0 left-0 right-0 p-1 bg-surface-600/20 text-center text-sm">{{ username }}</span>
  </div>
</template>

<script lang="ts" setup>
const props = defineProps<{
  streamId: string;
  videoRef: (el: HTMLVideoElement) => void;
  username: string;
  video?: boolean;
  opened?: boolean;
}>()
defineEmits<{
  (event: 'teleport', streamId: string): void;
}>();
defineOptions({ inheritAttrs: false });

const label = computed(() => {
  const parts = props.username.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return props.username.slice(0, 2).toUpperCase();
});
</script>

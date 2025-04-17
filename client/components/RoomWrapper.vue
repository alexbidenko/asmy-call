<script lang="ts" setup>
const roomStore = useRoomStore();

onMounted(() => {
  void roomStore.enter();
});

onBeforeUnmount(() => {
  roomStore.exit();
});
</script>

<template>
  <div>
    <slot />
  </div>
</template>

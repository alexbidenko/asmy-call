<script lang="ts" setup>
const interfaceStore = useInterfaceStore();

const themeOptions = computed(() => [
  {
    label: 'Темная',
    value: ThemeModeEnum.dark,
  },
  {
    label: 'Светлая',
    value: ThemeModeEnum.light,
  },
  {
    label: 'Системная',
    value: ThemeModeEnum.system,
  },
]);
</script>

<template>
  <Dialog
    v-model:visible="interfaceStore.isSettingDialogVisible"
    header="Настройки"
    modal
    dismissable-mask
    class="w-96"
  >
    <label class="flex flex-col gap-2">
      <span class="text-sm">Смена темы приложения</span>
      <Select
        v-model="interfaceStore.themeMode"
        :options="themeOptions"
        option-value="value"
        option-label="label"
        class="w-full"
      />
    </label>

    <template #footer>
      <Button @click="interfaceStore.isSettingDialogVisible = false" label="Закрыть" text>
        <template #icon>
          <span class="material-icons-outlined">
            close
          </span>
        </template>
      </Button>
    </template>
  </Dialog>
</template>

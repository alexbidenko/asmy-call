<template>
  <form @submit.prevent="onSubmit" class="h-full flex justify-center items-center p-4">
    <div class="flex flex-col gap-4 w-96">
      <h1 class="text-center text-2xl">Asmy Call</h1>
      <InputText v-model.trim="username" placeholder="Представьтесь" class="w-full" />
      <Button :label="userStore.room ? 'Войти' : 'Создать'" :disabled="!username.trim()" type="submit" class="w-full" />
    </div>
  </form>
</template>

<script lang="ts" setup>
const router = useRouter();
const userStore = useUserStore();

const username = ref(userStore.username);

const onSubmit = async () => {
  userStore.username = username.value.trim();
  userStore.initialized = true;

  await userStore.initialize();

  if (userStore.initialized && !userStore.room) {
    const randomRoom = crypto.randomUUID();
    router.push(`/${randomRoom}`);
  }
};
</script>

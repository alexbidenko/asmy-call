<script lang="ts" setup>
const interfaceStore = useInterfaceStore();
</script>

<template>
  <Html lang="ru" class="h-full" :class="`theme-${interfaceStore.theme}`" />
  <Head>
    <Title>Asmy Call</Title>
  </Head>
  <Body class="h-full" />

  <NuxtLoadingIndicator />
  <NuxtRouteAnnouncer />
  <VitePwaManifest />

  <NuxtPage />

  <Toast position="bottom-center" />
  <Toast position="bottom-right" group="message" />
</template>

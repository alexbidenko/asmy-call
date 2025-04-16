import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@pinia/nuxt',
    '@primevue/nuxt-module',
    '@nuxtjs/mdc',
    'nuxt-security',
    '@vite-pwa/nuxt',
    '@vueuse/nuxt',
    'motion-v/nuxt',
  ],
  ssr: false,
  vite: {
    plugins: [tailwindcss()],
  },
  postcss: {
    plugins: {
      '@tailwindcss/postcss': {}
    },
  },
  css: ['~/assets/styles/main.css', 'material-icons/iconfont/material-icons.css'],
  app: {
    rootAttrs: { class: 'h-full' }
  },
  nitro: {
    compressPublicAssets: true,
  },
  primevue: {
    importTheme: { from: '~/theme.ts' },
  },
  runtimeConfig: {
    public: {
      apiHost: process.env.API_HOST,
    },
  },
  mdc: {
    highlight: {
      theme: 'github-dark',
      langs: [
        'html',
        'css',
        'vue',
        'js',
        'ts',
        'yaml',
        'json',
      ],
      wrapperStyle: true
    }
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Asmy Call',
      short_name: 'Asmy Call',
      lang: 'ru',
      description: 'Asmy Call - удобное приложение для аудио и видео звонков',
      theme_color: '#84cc16',
      background_color: '#18181b',
      start_url: '/',
      display: 'standalone',
      prefer_related_applications: false,
      icons: [
        {
          src: 'pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: 'pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
        {
          src: 'pwa-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    },
  },
  hooks: {
    'prerender:routes'({ routes }) {
      routes.clear();
    }
  },
  security: {
    removeLoggers: false,
    headers: {
      permissionsPolicy: false,
    },
  },
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false }
})

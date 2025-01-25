import Aura from '@primevue/themes/aura';
import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@pinia/nuxt',
    '@primevue/nuxt-module',
    '@nuxtjs/mdc',
    'nuxt-security',
  ],
  ssr: false,
  nitro: {
    preset: 'bun',
  },
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
  hooks: {
    'prerender:routes'({ routes }) {
      routes.clear();
    }
  },
  compatibilityDate: '2024-11-01',
  devtools: { enabled: false }
})

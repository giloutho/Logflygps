import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'

// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import '@mdi/font/css/materialdesignicons.css'
import { mdi } from 'vuetify/iconsets/mdi'

// vue3-gettext
import { createGettext } from 'vue3-gettext'
import translations from './language/translations.json'

// Styles
import './assets/main.css'

// Create Vuetify instance with custom theme matching logfly-web
const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    sets: { mdi },
  },
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#1976D2',
          secondary: '#424242',
          accent: '#82B1FF',
          error: '#FF5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FFC107',
        },
      },
    },
  },
})

// Available languages
const availableLanguages = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
}

// Detect default language from electron-store or browser
async function getDefaultLanguage(): Promise<string> {
  try {
    if (window.electronAPI) {
      const lang = await window.electronAPI.invoke({ invoketype: 'get-language' })
      if (lang && availableLanguages[lang as keyof typeof availableLanguages]) {
        return lang as string
      }
    }
  } catch (e) {
    console.log('Could not get language from store, using browser detection')
  }

  // Fallback to browser detection
  const browserLang = navigator.language?.split('-')[0]?.toLowerCase() || 'en'
  return availableLanguages[browserLang as keyof typeof availableLanguages] ? browserLang : 'en'
}

// Initialize app
async function initApp() {
  const defaultLang = await getDefaultLanguage()

  const gettext = createGettext({
    availableLanguages,
    defaultLanguage: defaultLang,
    translations,
    silent: true,
  })

  const app = createApp(App)

  app
    .use(vuetify)
    .use(createPinia())
    .use(gettext)
    .mount('#app')

  // Listen for app-ready event from main process
  if (window.electronAPI) {
    window.electronAPI.on('app-ready', (data: { specOS: string; language: string }) => {
      console.log('[Renderer] App ready:', data)
      if (data.language && data.language !== gettext.current) {
        gettext.current = data.language
      }
    })
  }
}

initApp()

// Type declaration for electronAPI
declare global {
  interface Window {
    electronAPI: {
      storeGet: (key: string) => Promise<any>
      storeSet: (key: string, value: any) => Promise<boolean>
      getOsSpec: () => Promise<string>
      invoke: (params: { invoketype: string; args?: any }) => Promise<any>
      send: (channel: string) => void
      on: (channel: string, callback: (...args: any[]) => void) => void
      off: (channel: string, callback: (...args: any[]) => void) => void
    }

  }
}

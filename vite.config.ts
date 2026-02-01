import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        vite: {
          build: {
            // Electron 37 uses Chrome 134, which supports top-level await
            target: 'esnext',
            rollupOptions: {
              external: [
                'drivelist',
                'serialport',
                'electron-store',
                '@photostructure/tz-lookup',
                'zoned-date-time',
                'iana-tz-data'
              ]
            }
          }
        }
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            target: 'esnext'
          }
        }
      },
      // Polyfill the Electron and Node.js API for Renderer process.
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
  ],
  // Build target for renderer
  build: {
    target: 'esnext'
  },
  // Resolve aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
})

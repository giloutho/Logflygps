import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Store from 'electron-store'

// Import IPC handlers
import './ipc/index'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Initialize electron-store
const store = new Store()

// The built directory structure
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

// Detect OS specification for GPSDump
function detectOS(): string {
  const platform = process.platform

  if (platform === 'win32') {
    return 'win'
  } else if (platform === 'darwin') {
    return 'mac64' // macOS 64-bit (Intel or ARM)
  } else if (platform === 'linux') {
    return 'linux'
  }
  return 'linux' // fallback
}

// Initialize settings on first run
async function initSettings() {
  if (!store.has('specOS')) {
    store.set('specOS', detectOS())
  }
  if (!store.has('language')) {
    // Detect system language
    const locale = app.getLocale()
    const lang = locale.startsWith('fr') ? 'fr' : 'en'
    store.set('language', lang)
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC!, 'logfly-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    title: 'LogflyGPS'
  })

  // Remove default menu
  // win.setMenu(null) // Uncomment in production

  // Send OS spec to renderer after load
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('app-ready', {
      specOS: store.get('specOS'),
      language: store.get('language')
    })
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC Handlers for store access
ipcMain.handle('store-get', async (_event, key: string) => {
  return store.get(key)
})

ipcMain.handle('store-set', async (_event, key: string, value: any) => {
  store.set(key, value)
  return true
})

// Get OS specification
ipcMain.handle('get-os-spec', async () => {
  return store.get('specOS') || detectOS()
})

// Get language
ipcMain.handle('get-language', async () => {
  return store.get('language') || 'fr'
})

// Set language
ipcMain.handle('set-language', async (_event, lang: string) => {
  store.set('language', lang)
  return true
})

app.whenReady().then(async () => {
  await initSettings()
  console.log('[Main] App ready, specOS:', store.get('specOS'))
  createWindow()
})

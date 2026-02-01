import { ipcRenderer, contextBridge } from 'electron'

// Define the electronAPI interface for TypeScript
interface ElectronAPI {
  storeGet: (key: string) => Promise<any>
  storeSet: (key: string, value: any) => Promise<boolean>
  getOsSpec: () => Promise<string>
  invoke: (params: { invoketype: string; args?: any }) => Promise<any>
  send: (channel: string) => void
  on: (channel: string, callback: (...args: any[]) => void) => void
  off: (channel: string, callback: (...args: any[]) => void) => void
}

// Expose electronAPI to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Store access
  storeGet: (key: string) => ipcRenderer.invoke('store-get', key),
  storeSet: (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),

  // Get OS specification
  getOsSpec: () => ipcRenderer.invoke('get-os-spec'),

  // Generic invoke for IPC calls (similar to logfly65)
  invoke: (params: { invoketype: string; args?: any }) => {
    const channel = params.invoketype
    const args = params.args
    return ipcRenderer.invoke(channel, args)
  },

  // Send without waiting for response
  send: (channel: string) => {
    ipcRenderer.send(channel)
  },

  // Listen to events from main process
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },

  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.off(channel, callback)
  },
} as ElectronAPI)

// Expose ipcRenderer for compatibility
contextBridge.exposeInMainWorld('ipcRenderer', {
  on: (...args: Parameters<typeof ipcRenderer.on>) => {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off: (...args: Parameters<typeof ipcRenderer.off>) => {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send: (...args: Parameters<typeof ipcRenderer.send>) => {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke: (...args: Parameters<typeof ipcRenderer.invoke>) => {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

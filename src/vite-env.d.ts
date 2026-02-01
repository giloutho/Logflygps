/// <reference types="vite/client" />

declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}

// Electron API types
interface ElectronAPI {
    storeGet: (key: string) => Promise<any>
    storeSet: (key: string, value: any) => Promise<boolean>
    getOsSpec: () => Promise<string>
    invoke: (params: { invoketype: string; args?: any }) => Promise<any>
    send: (channel: string) => void
    on: (channel: string, callback: (...args: any[]) => void) => void
    off: (channel: string, callback: (...args: any[]) => void) => void
}

declare global {
    interface Window {
        electronAPI: ElectronAPI
        ipcRenderer: {
            on: (channel: string, callback: (...args: any[]) => void) => void
            off: (channel: string, callback: (...args: any[]) => void) => void
            send: (channel: string, ...args: any[]) => void
            invoke: (channel: string, ...args: any[]) => Promise<any>
        }
    }
}

export { }

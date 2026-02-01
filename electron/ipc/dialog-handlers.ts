/**
 * Dialog Handlers
 * Native dialogs for file/folder selection
 */

import { ipcMain, dialog, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// Open directory dialog
ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    })
    return result
})

// Open file dialog
ipcMain.handle('dialog:openFile', async (_event, args) => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: args?.filters || [{ name: 'All Files', extensions: ['*'] }]
    })
    return result
})

// Save file dialog
ipcMain.handle('dialog:saveFile', async (_event, args) => {
    const result = await dialog.showSaveDialog({
        defaultPath: args?.defaultPath,
        filters: args?.filters || [{ name: 'All Files', extensions: ['*'] }]
    })
    return result
})

// Scan folder for .db files
ipcMain.handle('folder:scanDb', async (_event, args) => {
    const folderPath = args.folderPath

    try {
        const entries = fs.readdirSync(folderPath, { withFileTypes: true })
        const dbFiles = entries
            .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.db'))
            .map(entry => ({
                name: entry.name,
                path: path.join(folderPath, entry.name)
            }))

        return { success: true, files: dbFiles }
    } catch (error: any) {
        return { success: false, message: error.message }
    }
})

// Open external URL
ipcMain.handle('shell:openExternal', async (_event, args) => {
    try {
        await shell.openExternal(args.url)
        return { success: true }
    } catch (error: any) {
        return { success: false, message: error.message }
    }
})

export { }

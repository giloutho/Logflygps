/**
 * Serial Ports Handler
 * Ported from logfly65/src/ipcmain/ports-list.js
 * Lists available serial ports for GPS connection
 */

import { ipcMain } from 'electron'

// Lazy-loaded serialport module
let serialportModule: any = null

async function getSerialPort() {
    if (!serialportModule) {
        try {
            serialportModule = await import('serialport')
        } catch (error) {
            console.error('[Ports-List] Failed to import serialport:', error)
            return null
        }
    }
    return serialportModule.SerialPort
}

// Register IPC handler
ipcMain.handle('gps:serial', async () => {
    console.log('[Ports-List] Listing serial ports...')

    try {
        const SerialPort = await getSerialPort()

        if (!SerialPort) {
            return {
                success: false,
                message: 'SerialPort module not available'
            }
        }

        const ports = await SerialPort.list()

        if (Array.isArray(ports)) {
            console.log(`[Ports-List] Found ${ports.length} ports`)
            return {
                success: true,
                portsarray: ports
            }
        } else {
            console.error('[Ports-List] Invalid response from SerialPort.list()')
            return {
                success: false,
                message: 'Failed to retrieve serial ports'
            }
        }
    } catch (error: any) {
        console.error('[Ports-List] Error:', error)
        return {
            success: false,
            message: error.message || 'Failed to retrieve serial ports'
        }
    }
})

export { }

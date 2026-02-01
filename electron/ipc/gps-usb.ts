/**
 * GPS USB Handler
 * Ported from logfly65/src/ipcmain/gps-usb.js
 * Detects USB GPS devices and returns the path to flight files
 */

import { ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

// Lazy-loaded drivelist module
let drivelistModule: typeof import('drivelist') | null = null

async function getDrivelist() {
    if (!drivelistModule) {
        drivelistModule = await import('drivelist')
    }
    return drivelistModule
}

// GPS folder configurations for each device type
const gpsFolders: Record<string, {
    flights: string
    waypoints?: string
    specials: string[]
    txtPrefix?: string
}> = {
    sky3: {
        flights: 'flights',
        waypoints: 'waypoints',
        specials: ['pilot_profiles', 'flightscreens', 'vario_tones']
    },
    xct: {
        flights: 'flights',
        specials: [],
        txtPrefix: 'XC' // XCTracer recognition by .txt file starting with XC at root
    },
    connect: {
        flights: 'flights',
        waypoints: 'waypoints',
        specials: ['config']
    },
    syrusb: {
        flights: 'FLIGHT',
        specials: []
    },
    rever: {
        flights: 'IGC',
        specials: []
    },
    sky2: {
        flights: 'flights',
        specials: []
    },
    oud: {
        flights: 'Log',
        specials: []
    },
    cpil: {
        flights: 'Flights',
        specials: []
    },
    elem: {
        flights: 'flights',
        specials: []
    },
    skydrop: {
        flights: 'igc',
        specials: []
    },
    vardui: {
        flights: 'var',
        specials: []
    },
    flynet: {
        flights: 'tracks',
        specials: []
    },
    sens: {
        flights: 'igc',
        specials: []
    }
}

/**
 * Find folder case-insensitive (handles lowercase/uppercase variations)
 */
function findFolderCaseInsensitive(basePath: string, folderName: string): string | null {
    const lower = path.join(basePath, folderName.toLowerCase())
    const upper = path.join(basePath, folderName.toUpperCase())
    const original = path.join(basePath, folderName)

    if (fs.existsSync(original) && fs.lstatSync(original).isDirectory()) return original
    if (fs.existsSync(lower) && fs.lstatSync(lower).isDirectory()) return lower
    if (fs.existsSync(upper) && fs.lstatSync(upper).isDirectory()) return upper
    return null
}

/**
 * Explore USB drives to find GPS device
 */
function exploreDrives(drives: any[], typeGPS: string): {
    success: boolean
    message?: string
    usbPath?: string
    pathFlights?: string
    pathWaypoints?: string
} {
    // Maximum capacity in bytes (≈ 64 GB)
    const maxCapacity = 64011120640

    // Filter only USB drives with capacity below limit
    const filteredDrives = drives.filter((drive: any) => drive.isUSB && drive.size < maxCapacity)

    const folders = gpsFolders[typeGPS]
    if (!folders) {
        return { success: false, message: 'Unknown GPS type' }
    }

    for (const drive of filteredDrives) {
        console.log(`[GPS-USB] Checking: ${drive.description}, Capacity: ${drive.size}, Path: ${drive.mountpoints.map((mp: any) => mp.path).join(', ')}`)

        if (drive.mountpoints.length > 0) {
            const usbPath = drive.mountpoints[0].path
            let validFlights = false

            let validSpecial = false
            const resultUsb: any = {}

            if (typeGPS === 'xct') {
                // XCTracer: look for .txt file starting with XC at root
                console.log(`[GPS-USB] Looking for XCTracer in: ${usbPath}`)
                try {
                    const files = fs.readdirSync(usbPath)
                    for (const file of files) {
                        if (file.toLowerCase().endsWith('.txt') && file.startsWith(folders.txtPrefix!)) {
                            validFlights = true
                            resultUsb.success = true
                            resultUsb.usbPath = usbPath
                            resultUsb.pathFlights = usbPath
                            break
                        }
                    }
                } catch (err) {
                    console.error(`[GPS-USB] Error reading directory: ${err}`)
                }

                if (validFlights) {
                    console.log(`[GPS-USB] XCTracer detected on ${usbPath}`)
                    return resultUsb
                }
            } else {
                console.log(`[GPS-USB] Checking folders for GPS: ${typeGPS}`)

                // Check flights folder (case insensitive)
                const flightsPath = findFolderCaseInsensitive(usbPath, folders.flights)
                if (flightsPath) {
                    validFlights = true
                    resultUsb.usbPath = usbPath
                    resultUsb.pathFlights = flightsPath
                }

                // Check waypoints folder if defined
                if (folders.waypoints) {
                    const waypointsPath = findFolderCaseInsensitive(usbPath, folders.waypoints)
                    if (waypointsPath) {
                        // validWaypoints = true
                        resultUsb.pathWaypoints = waypointsPath
                    }
                }

                // Check special folders
                if (folders.specials.length > 0) {
                    for (const folder of folders.specials) {
                        const folderPath = path.join(usbPath, folder)
                        console.log(`[GPS-USB] Looking for special folder: ${folderPath}`)
                        if (fs.existsSync(folderPath) && fs.lstatSync(folderPath).isDirectory()) {
                            console.log(`[GPS-USB] Special folder found: ${folderPath}`)
                            validSpecial = true
                            break
                        }
                    }
                } else {
                    // If no special folders required, just need valid flights folder
                    validSpecial = validFlights
                }
            }

            if (validFlights && validSpecial) {
                resultUsb.success = true
                return resultUsb
            }
        }
    }

    return { success: false, message: 'No disk or flights folder detected' }
}

// Register IPC handler
ipcMain.handle('gps:usb', async (_event, args) => {
    console.log('[GPS-USB] Called for: ' + args.typeGps)
    const typeGPS = args.typeGps

    try {
        const drivelist = await getDrivelist()
        const drives = await drivelist.list()

        if (typeGPS === 'listUsb') {
            // Just list USB drives
            if (Array.isArray(drives)) {
                const usbDrives = drives.filter((drive: any) => drive.isUSB)
                const usbDrivesInfo = usbDrives.map((drive: any) => ({
                    description: String(drive.description || ''),
                    size: Number(drive.size || 0),
                    mountpoints: (drive.mountpoints || []).map((mp: any) => ({
                        path: String(mp.path || '')
                    }))
                }))

                if (usbDrivesInfo.length > 0) {
                    return JSON.parse(JSON.stringify({ success: true, usbDrivesInfo }))
                } else {
                    return { success: false, message: 'No USB drives found' }
                }
            } else {
                return { success: false, message: 'Error retrieving drives' }
            }
        } else {
            // Look for specific GPS device
            if (Array.isArray(drives)) {
                const result = exploreDrives(drives, typeGPS)
                return JSON.parse(JSON.stringify(result))
            } else {
                return { success: false, message: 'Error retrieving drives' }
            }
        }
    } catch (error: any) {
        console.error('[GPS-USB] Error:', error)
        return { success: false, message: String(error.message || 'Unknown error') }
    }
})

export { }

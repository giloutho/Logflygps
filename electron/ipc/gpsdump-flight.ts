/**
 * GPSDump Flight Handler
 * Ported from logfly65/src/ipcmain/gpsdump-flight.js
 * Downloads a single flight from serial GPS using GPSDump
 */

import { ipcMain, app } from 'electron'
import { execFileSync } from 'child_process'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import Store from 'electron-store'
import { getGpsDumpParams, getGpsDumpPath } from './gpsdump-settings'

const store = new Store()

interface FlightData {
    IgcText?: string
    altitude?: number
    latitude?: number
    longitude?: number
    pilot?: string
    glider?: string
    offsetUTC?: number
    date?: string
    startTime?: string
    duration?: number
    GeoJSON?: any
}

// Register IPC handler
ipcMain.handle('gpsdump:flight', async (_event, args) => {
    const gpsParam = args.gpsParam
    const flightIndex = args.flightIndex
    const withGeoJSON = args.withGeoJSON || false
    const specOS = store.get('specOS') as string || 'mac64'

    console.log(`[GPSDump-Flight] Index: ${flightIndex}, Params: ${gpsParam}, GeoJSON: ${withGeoJSON}`)

    const gpsDumpParams = getGpsDumpParams()
    const params = gpsDumpParams[specOS]

    if (!params) {
        return { success: false, message: `Unsupported OS: ${specOS}` }
    }

    let gpsDumpPath: string
    try {
        gpsDumpPath = getGpsDumpPath(specOS)
    } catch (error: any) {
        return { success: false, message: error.message }
    }

    if (!fs.existsSync(gpsDumpPath)) {
        console.log('[GPSDump-Flight] GPSDump not found at:', gpsDumpPath)
        return { success: false, message: 'GPSDump not found' }
    }

    // Temp file for IGC output
    const tempFileName = path.join(app.getPath('temp'), 'gpsdump.igc')
    console.log('[GPSDump-Flight] Temp file:', tempFileName)

    // Clean up previous temp file
    if (fs.existsSync(tempFileName)) {
        try {
            fs.unlinkSync(tempFileName)
        } catch (err) {
            console.error('[GPSDump-Flight] Could not delete temp file:', err)
        }
    }

    const paramFile = params.temp + tempFileName
    const wNoWin = '/win=0'
    const wExit = '/exit'

    try {
        // Parse GPS parameters
        const gpsParamArray = gpsParam.split(',')
        const paramGPS = gpsParamArray[0]
        const paramPort = gpsParamArray[1]
        const gpsModel = gpsParamArray[2]

        // Calculate flight index parameter
        let adjustedIndex = flightIndex
        let paramFlightIndex: string

        switch (gpsModel) {
            case 'flysd':
                adjustedIndex += 1
                paramFlightIndex = params.track + adjustedIndex.toString()
                break
            case 'flyold':
            case 'fly20':
            case 'fly15':
                if (specOS !== 'win') {
                    adjustedIndex += 1
                }
                paramFlightIndex = params.track + adjustedIndex.toString()
                break
            default:
                return { success: false, message: `Unknown GPS model: ${gpsModel}` }
        }

        let callString: string

        switch (specOS) {
            case 'win':
                callString = `${path.basename(gpsDumpPath)} ${wNoWin} ${paramPort} ${paramGPS} ${paramFile} ${paramFlightIndex} ${wExit}`
                console.log(`[GPSDump-Flight] ${callString}`)
                execFileSync(gpsDumpPath, [wNoWin, paramPort, paramGPS, paramFile, paramFlightIndex, wExit])
                break
            case 'mac32':
                callString = `${path.basename(gpsDumpPath)} ${paramGPS} ${paramFile} ${paramFlightIndex}`
                console.log(`[GPSDump-Flight] ${callString}`)
                execFileSync(gpsDumpPath, [paramGPS, paramFile, paramFlightIndex])
                break
            case 'mac64':
            case 'linux':
                callString = `${path.basename(gpsDumpPath)} ${paramGPS} ${paramPort} ${paramFile} ${paramFlightIndex}`
                console.log(`[GPSDump-Flight] ${callString}`)
                execFileSync(gpsDumpPath, [paramGPS, paramPort, paramFile, paramFlightIndex])
                break
        }

        // Read and decode the IGC file
        if (!fs.existsSync(tempFileName)) {
            return { success: false, message: 'IGC file not created by GPSDump' }
        }

        const igcText = await fs.promises.readFile(tempFileName, 'utf-8')

        if (!igcText || igcText.length < 100) {
            return { success: false, message: 'IGC file is empty or too short' }
        }

        // Basic IGC parsing (simplified version - full parsing is done in renderer)
        const flightData: FlightData = {
            IgcText: igcText
        }

        // Extract basic info from IGC headers
        const lines = igcText.split('\n')
        for (const line of lines) {
            if (line.startsWith('HFPLTPILOTINCHARGE:') || line.startsWith('HPPLTPILOT:')) {
                flightData.pilot = line.split(':')[1]?.trim()
            }
            if (line.startsWith('HFGTYGLIDERTYPE:') || line.startsWith('HPGTYGLIDERTYPE:')) {
                flightData.glider = line.split(':')[1]?.trim()
            }
            if (line.startsWith('HFDTE') || line.startsWith('HPDTE')) {
                // Date format: HFDTEXXXXXX or HFDTEDATE:XXXXXX
                const dateMatch = line.match(/(\d{6})/);
                if (dateMatch) {
                    const d = dateMatch[1]
                    // DDMMYY -> YYYY-MM-DD
                    flightData.date = `20${d.substring(4, 6)}-${d.substring(2, 4)}-${d.substring(0, 2)}`
                }
            }
        }

        // Find first B record for coordinates
        const firstB = lines.find(l => l.startsWith('B'))
        if (firstB && firstB.length >= 35) {
            // B record format: BHHMMSSLLLLLLLNLLLLLLLLEVPPPPPGGGGGsss
            const timeStr = firstB.substring(1, 7)
            flightData.startTime = `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}:${timeStr.substring(4, 6)}`

            // Parse latitude (7 digits: DDMMmmm)
            const latDeg = parseInt(firstB.substring(7, 9))
            const latMin = parseFloat(firstB.substring(9, 14)) / 1000
            const latNS = firstB.charAt(14)
            flightData.latitude = (latDeg + latMin / 60) * (latNS === 'S' ? -1 : 1)

            // Parse longitude (8 digits: DDDMMmmm)
            const lonDeg = parseInt(firstB.substring(15, 18))
            const lonMin = parseFloat(firstB.substring(18, 23)) / 1000
            const lonEW = firstB.charAt(23)
            flightData.longitude = (lonDeg + lonMin / 60) * (lonEW === 'W' ? -1 : 1)

            // GPS altitude
            flightData.altitude = parseInt(firstB.substring(30, 35))

            // Compute UTC offset and local time if coordinates and time available
            if (flightData.latitude && flightData.longitude && flightData.date && flightData.startTime) {
                const timestamp = Date.parse(`${flightData.date}T${flightData.startTime}Z`)
                flightData.offsetUTC = computeOffsetUTC(flightData.latitude, flightData.longitude, timestamp)

                // flightData.takeoffTime will be used by db:addFlight
                // but interface didn't have it defined, let's add it to object
                const takeoffTime = computeLocalLaunchTime(timestamp, flightData.offsetUTC)

                // We add it to the returned object even if strict typing complains internally
                Object.assign(flightData, { takeoffTime })
            }
        }

        // Calculate duration from first and last B records
        const bRecords = lines.filter(l => l.startsWith('B'))
        if (bRecords.length > 1) {
            const firstTime = parseTimeFromB(bRecords[0])
            const lastTime = parseTimeFromB(bRecords[bRecords.length - 1])
            flightData.duration = lastTime - firstTime // in seconds
        }

        console.log(`[GPSDump-Flight] Success: ${igcText.length} bytes, date: ${flightData.date}`)

        // Clean up temp file
        try {
            fs.unlinkSync(tempFileName)
        } catch (err) {
            console.error('[GPSDump-Flight] Could not delete temp file:', err)
        }

        return { success: true, flightData }

    } catch (error: any) {
        console.error('[GPSDump-Flight] Error:', error)
        return { success: false, message: error.message }
    }
})

/**
 * Parse time in seconds from B record
 */
function parseTimeFromB(bRecord: string): number {
    const timeStr = bRecord.substring(1, 7)
    const hours = parseInt(timeStr.substring(0, 2))
    const minutes = parseInt(timeStr.substring(2, 4))
    const seconds = parseInt(timeStr.substring(4, 6))
    return hours * 3600 + minutes * 60 + seconds
}

/**
 * Compute UTC offset based on coordinates and timestamp
 * Same logic as logfly65/src/js/offset-utc.js
 */
function computeOffsetUTC(lat: number, lon: number, timestamp: number): number {
    try {
        // Use dynamically loaded modules
        const require = createRequire(import.meta.url)
        const tz_lookup = require('@photostructure/tz-lookup')
        const ZonedDateTime = require('zoned-date-time')
        const { zoneData } = require('iana-tz-data')

        // Get timezone from coordinates
        const timezone = tz_lookup(lat, lon)

        // Parse timezone string
        const arrZone = timezone.toString().split('/')
        const dateFirstPoint = new Date(timestamp)

        let zdt
        if (arrZone.length === 3) {
            zdt = new ZonedDateTime(dateFirstPoint, zoneData[arrZone[0]][arrZone[1]][arrZone[2]])
        } else {
            zdt = new ZonedDateTime(dateFirstPoint, zoneData[arrZone[0]][arrZone[1]])
        }

        const rawOffset = zdt.getTimezoneOffset()
        const offsetUTC = -1 * rawOffset

        return offsetUTC
    } catch (error) {
        console.error('[GPSDump-Flight] Error computing UTC offset:', error)
        return 0
    }
}

/**
 * Compute local launch time
 */
function computeLocalLaunchTime(timestamp: number, offsetUTC: number): string {
    const startLocalTimestamp = timestamp + (offsetUTC * 60000)
    const isoLocalStart = new Date(startLocalTimestamp).toISOString()
    const dateLocal = new Date(isoLocalStart.slice(0, -1))
    return String(dateLocal.getHours()).padStart(2, '0') + ':' +
        String(dateLocal.getMinutes()).padStart(2, '0') + ':' +
        String(dateLocal.getSeconds()).padStart(2, '0')
}

export { }

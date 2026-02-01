/**
 * Disk Import Handler
 * Scans a folder for IGC/GPX files with proper filtering and minimal decoding
 * Ported from logfly65/src/ipcmain/disk-import.js
 */

import { ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import readline from 'node:readline'
import { createRequire } from 'node:module'

// Use createRequire to load CommonJS modules (timezone libraries)
const require = createRequire(import.meta.url)
const tz_lookup = require('@photostructure/tz-lookup')
const ZonedDateTime = require('zoned-date-time')
const { zoneData } = require('iana-tz-data')



interface TrackFile {
    name: string
    path: string
    extension: string
    size: number
}

interface ParsedFlight {
    toStore: boolean
    isValid: boolean
    existsInDB: boolean
    date: string
    dateISO: string
    startTime: string
    takeoffTime: string
    duration: number
    durationStr: string
    fileName: string
    file: string
    filePath: string
    path: string
    pilotName: string
    pilot: string
    gliderName: string
    glider: string
    latitude: number
    longitude: number
    altitude: number
    offsetUTC: number
}

// Register IPC handler for disk scan
ipcMain.handle('disk:scan', async (_event, args) => {
    const folderPath = args.folderPath

    console.log(`[Disk-Import] Scanning folder: ${folderPath}`)

    if (!fs.existsSync(folderPath)) {
        return { success: false, message: 'Folder not found' }
    }

    try {
        const igcFiles: TrackFile[] = []
        const gpxFiles: TrackFile[] = []

        await scanFolder(folderPath, igcFiles, gpxFiles)

        console.log(`[Disk-Import] Found ${igcFiles.length} IGC and ${gpxFiles.length} GPX files`)

        // Force serialization to ensure IPC compatibility
        return JSON.parse(JSON.stringify({
            success: true,
            igcFiles,
            gpxFiles,
            totalCount: igcFiles.length + gpxFiles.length
        }))
    } catch (error: any) {
        console.error('[Disk-Import] Error:', error)
        return { success: false, message: error.message }
    }
})

// Register IPC handler to read a text file
ipcMain.handle('file:readtext', async (_event, args) => {
    const filePath = args.filePath

    try {
        const content = await fs.promises.readFile(filePath, 'utf-8')
        return { success: true, data: content }
    } catch (error: any) {
        return { success: false, message: error.message }
    }
})

// Register IPC handler for minimal IGC parsing (header + first B record)
ipcMain.handle('igc:parseMinimal', async (_event, args) => {
    const filePath = args.filePath

    try {
        const parsed = await parseIgcMinimal(filePath)
        return { success: true, data: parsed }
    } catch (error: any) {
        console.error('[Disk-Import] Error parsing IGC:', error)
        return { success: false, message: error.message }
    }
})

// Register IPC handler for batch minimal parsing
ipcMain.handle('igc:parseMinimalBatch', async (_event, args) => {
    const files: TrackFile[] = args.files
    const results: ParsedFlight[] = []

    console.log(`[Disk-Import] Batch parsing ${files.length} files`)

    for (const file of files) {
        try {
            const parsed = await parseIgcMinimal(file.path)
            if (parsed) {
                // Create a plain object to ensure it's serializable
                const flight: ParsedFlight = {
                    toStore: Boolean(parsed.toStore),
                    isValid: Boolean(parsed.isValid),
                    existsInDB: Boolean(parsed.existsInDB),
                    date: String(parsed.date || ''),
                    dateISO: String(parsed.dateISO || ''),
                    startTime: String(parsed.startTime || ''),
                    takeoffTime: String(parsed.takeoffTime || ''),
                    duration: Number(parsed.duration || 0),
                    durationStr: String(parsed.durationStr || ''),
                    fileName: String(file.name || ''),
                    file: String(file.name || ''),
                    filePath: String(file.path || ''),
                    path: String(file.path || ''),
                    pilotName: String(parsed.pilotName || ''),
                    pilot: String(parsed.pilot || ''),
                    gliderName: String(parsed.gliderName || ''),
                    glider: String(parsed.glider || ''),
                    latitude: Number(parsed.latitude || 0),
                    longitude: Number(parsed.longitude || 0),
                    altitude: Number(parsed.altitude || 0),
                    offsetUTC: Number(parsed.offsetUTC || 0)
                }
                results.push(flight)
            }
        } catch (error) {
            console.error(`[Disk-Import] Error parsing ${file.name}:`, error)
        }
    }

    console.log(`[Disk-Import] Successfully parsed ${results.length} files`)

    // Sort by date descending
    results.sort((a, b) => {
        const tsA = Date.parse(`${a.dateISO}T${a.startTime}Z`)
        const tsB = Date.parse(`${b.dateISO}T${b.startTime}Z`)
        return tsB - tsA
    })

    // Force serialization to ensure IPC compatibility
    const serializedResult = JSON.parse(JSON.stringify({ success: true, flights: results }))
    return serializedResult
})

/**
 * Recursively scan folder for IGC/GPX files
 * Filters out files starting with . or _
 */
async function scanFolder(
    folderPath: string,
    igcFiles: TrackFile[],
    gpxFiles: TrackFile[],
    maxDepth: number = 3,
    currentDepth: number = 0
): Promise<void> {
    if (currentDepth > maxDepth) return

    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })

    for (const entry of entries) {
        // Skip hidden files/folders (starting with . or _)
        if (entry.name.startsWith('.') || entry.name.startsWith('_')) {
            continue
        }

        const fullPath = path.join(folderPath, entry.name)

        if (entry.isDirectory()) {
            // Skip common system folders
            if (entry.name !== 'node_modules' && entry.name !== '__MACOSX') {
                await scanFolder(fullPath, igcFiles, gpxFiles, maxDepth, currentDepth + 1)
            }
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase()

            if (ext === '.igc') {
                const stats = await fs.promises.stat(fullPath)
                igcFiles.push({
                    name: entry.name,
                    path: fullPath,
                    extension: 'igc',
                    size: stats.size
                })
            } else if (ext === '.gpx') {
                const stats = await fs.promises.stat(fullPath)
                gpxFiles.push({
                    name: entry.name,
                    path: fullPath,
                    extension: 'gpx',
                    size: stats.size
                })
            }
        }
    }
}

/**
 * Compute UTC offset based on coordinates and timestamp
 * Same logic as logfly65/src/js/offset-utc.js
 */
function computeOffsetUTC(lat: number, lon: number, timestamp: number): number {
    try {
        // Get timezone from coordinates
        const timezone = tz_lookup(lat, lon)

        // Parse timezone string (e.g., 'America/Los_Angeles' or 'America/Argentina/Tucuman')
        const arrZone = timezone.toString().split('/')
        const dateFirstPoint = new Date(timestamp)

        let zdt
        if (arrZone.length === 3) {
            zdt = new ZonedDateTime(dateFirstPoint, zoneData[arrZone[0]][arrZone[1]][arrZone[2]])
        } else {
            zdt = new ZonedDateTime(dateFirstPoint, zoneData[arrZone[0]][arrZone[1]])
        }

        const rawOffset = zdt.getTimezoneOffset()
        // The direction is reversed. getTimezoneOffset gives us the operation to obtain UTC time.
        // For France getTimezoneOffset result is -120mn.
        const offsetUTC = -1 * rawOffset

        return offsetUTC
    } catch (error) {
        console.error('[Disk-Import] Error computing UTC offset:', error)
        return 0
    }
}

/**
 * Compute local launch time from timestamp and UTC offset
 * Same logic as logfly65/src/ipcmain/disk-import.js
 */
function computeLocalLaunchTime(timestamp: number, offsetUTC: number): string {
    // offsetUTC is in minutes, original timestamp in milliseconds
    const startLocalTimestamp = timestamp + (offsetUTC * 60000)
    // Convert to local date
    const isoLocalStart = new Date(startLocalTimestamp).toISOString()
    const dateLocal = new Date(isoLocalStart.slice(0, -1))
    const startLocalTime = String(dateLocal.getHours()).padStart(2, '0') + ':' +
        String(dateLocal.getMinutes()).padStart(2, '0') + ':' +
        String(dateLocal.getSeconds()).padStart(2, '0')

    return startLocalTime
}

/**
 * Parse IGC file minimally - only read headers and first B record
 * This is much faster than full parsing
 */
async function parseIgcMinimal(filePath: string): Promise<Omit<ParsedFlight, 'fileName' | 'file' | 'filePath' | 'path'> | null> {
    let flightDate = ''
    let dateISO = ''
    let pilot = ''
    let glider = ''
    let startTimeUTC = ''
    let latitude = 0
    let longitude = 0
    let altitude = 0
    let foundB = false

    const stream = fs.createReadStream(filePath, { encoding: 'utf8' })
    const rl = readline.createInterface({ input: stream })

    for await (const line of rl) {
        const headerType = line.slice(2, 5)

        // Parse date header (HFDTE or HPDTE)
        if (headerType === 'DTE') {
            const parsed = parseDateHeader(line)
            if (parsed) {
                dateISO = parsed.iso
                flightDate = parsed.display
            }
        }

        // Parse pilot header
        if (headerType === 'PLT') {
            pilot = parseHeaderValue(line)
        }

        // Parse glider type header
        if (headerType === 'GTY') {
            glider = parseHeaderValue(line)
        }

        // Parse first B record and stop
        if (line.startsWith('B')) {
            const bRecord = parseBRecord(line)
            if (bRecord) {
                startTimeUTC = bRecord.time
                latitude = bRecord.latitude
                longitude = bRecord.longitude
                altitude = bRecord.altitude
                foundB = true
            }
            rl.close()
            break
        }
    }

    if (!foundB || !dateISO) {
        return null
    }

    // Calculate UTC offset and local launch time
    const timestamp = Date.parse(`${dateISO}T${startTimeUTC}Z`)
    let offsetUTC = computeOffsetUTC(latitude, longitude, timestamp)
    if (offsetUTC === undefined || offsetUTC === null) {
        offsetUTC = 0
    }
    const takeoffTime = computeLocalLaunchTime(timestamp, offsetUTC)

    // Calculate duration by reading last B record
    const duration = await calculateDuration(filePath, startTimeUTC)

    return {
        toStore: true, // Will be updated after DB check
        isValid: true,
        existsInDB: false, // Will be updated after DB check
        date: flightDate,
        dateISO,
        startTime: startTimeUTC,
        takeoffTime, // This is the LOCAL time used for DB check
        duration,
        durationStr: formatDuration(duration),
        pilotName: pilot,
        pilot,
        gliderName: glider,
        glider,
        latitude,
        longitude,
        altitude,
        offsetUTC
    }
}

/**
 * Parse IGC date header
 */
function parseDateHeader(line: string): { iso: string; display: string } | null {
    const RE_HFDTE = /^HFDTE(?:DATE:)?(\d{2})(\d{2})(\d{2})(?:,?(\d{2}))?/
    const match = line.match(RE_HFDTE)
    if (!match) return null

    const day = match[1]
    const month = match[2]
    const yearShort = match[3]
    const lastCentury = yearShort[0] === '8' || yearShort[0] === '9'
    const year = (lastCentury ? '19' : '20') + yearShort

    return {
        iso: `${year}-${month}-${day}`,
        display: `${day}/${month}/${year}`
    }
}

/**
 * Parse header value (for pilot, glider, etc.)
 */
function parseHeaderValue(line: string): string {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
        return line.substring(colonIndex + 1).replace(/_/g, ' ').trim()
    }
    return ''
}

/**
 * Parse B record for position and time
 */
function parseBRecord(line: string): { time: string; latitude: number; longitude: number; altitude: number } | null {
    const RE_B = /^B(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})([NS])(\d{3})(\d{2})(\d{3})([EW])([AV])(-?\d{4}|\d{5})(-?\d{4}|\d{5})/
    const match = line.match(RE_B)
    if (!match) return null

    const time = `${match[1]}:${match[2]}:${match[3]}`

    // Parse latitude
    const latDeg = parseInt(match[4], 10)
    const latMin = parseFloat(`${match[5]}.${match[6]}`)
    const latitude = (latDeg + latMin / 60) * (match[7] === 'S' ? -1 : 1)

    // Parse longitude
    const lonDeg = parseInt(match[8], 10)
    const lonMin = parseFloat(`${match[9]}.${match[10]}`)
    const longitude = (lonDeg + lonMin / 60) * (match[11] === 'W' ? -1 : 1)

    // GPS altitude
    const altitude = parseInt(match[14], 10)

    return { time, latitude, longitude, altitude }
}

/**
 * Calculate flight duration by reading last B record
 * Returns duration in seconds
 */
async function calculateDuration(filePath: string, firstTime: string): Promise<number> {
    try {
        // Read last 4KB of file to find last B record
        const stats = await fs.promises.stat(filePath)
        const fileSize = stats.size
        const readSize = Math.min(4096, fileSize)

        const buffer = Buffer.alloc(readSize)
        const fd = await fs.promises.open(filePath, 'r')
        await fd.read(buffer, 0, readSize, Math.max(0, fileSize - readSize))
        await fd.close()

        const content = buffer.toString('utf8')
        const lines = content.split('\n').reverse()

        let lastTime = ''
        for (const line of lines) {
            if (line.startsWith('B')) {
                const match = line.match(/^B(\d{2})(\d{2})(\d{2})/)
                if (match) {
                    lastTime = `${match[1]}:${match[2]}:${match[3]}`
                    break
                }
            }
        }

        if (!lastTime || !firstTime) return 0

        // Parse times to seconds
        const parseTime = (t: string): number => {
            const parts = t.split(':').map(Number)
            return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0)
        }

        const startSeconds = parseTime(firstTime)
        const endSeconds = parseTime(lastTime)

        let duration = endSeconds - startSeconds
        // Handle midnight crossing
        if (duration < 0) {
            duration += 86400
        }

        return duration
    } catch {
        return 0
    }
}

/**
 * Format duration in seconds to HHhMMmn
 */
function formatDuration(seconds: number): string {
    if (!seconds) return '00h00mn'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h.toString().padStart(2, '0')}h${m.toString().padStart(2, '0')}mn`
}

export { }

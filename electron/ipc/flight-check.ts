/**
 * Flight Check Handler
 * Checks if a flight already exists in the database
 * Uses native Node.js SQLite (node:sqlite) available since Node 23
 * 
 * The check is based on date and takeoff time (to the minute)
 * matching the logic in logfly-web/src/modules/Tracks/js/igc-parser.js
 */

import { ipcMain } from 'electron'
import fs from 'node:fs'
// @ts-ignore - node:sqlite is available in Node 23+
import { DatabaseSync } from 'node:sqlite'

interface FlightCheckRequest {
    date: string       // Format: DD/MM/YYYY or YYYY-MM-DD
    dateISO: string    // Format: YYYY-MM-DD
    startTime: string  // Format: HH:MM:SS
    takeoffTime?: string
    latitude?: number
    longitude?: number
}

interface FlightCheckResult {
    exists: boolean
    flightId?: number
}

/**
 * Convert date from various formats to YYYY-MM-DD
 */
function normalizeDateToISO(date: string, dateISO?: string): string {
    if (dateISO && dateISO.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateISO
    }

    // Try DD/MM/YYYY format
    const ddmmyyyy = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (ddmmyyyy) {
        return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`
    }

    // Try YYYY-MM-DD format
    if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return date
    }

    return date
}

/**
 * Check if a single flight exists in the database
 * Uses the same logic as logfly-web:
 * SELECT COUNT(*) FROM Vol WHERE strftime('%Y-%m-%d %H:%M', V_Date) = ?
 */
function checkFlightInDb(db: InstanceType<typeof DatabaseSync>, flight: FlightCheckRequest): FlightCheckResult {
    try {
        const dateISO = normalizeDateToISO(flight.date, flight.dateISO)
        const time = (flight.takeoffTime || flight.startTime || '').substring(0, 5) // HH:MM

        if (!dateISO || !time) {
            console.log('[Flight-Check] Missing date or time:', flight)
            return { exists: false }
        }

        const dateTimeSearch = `${dateISO} ${time}`

        // Same query as logfly-web
        const stmt = db.prepare(
            "SELECT COUNT(*) as count FROM Vol WHERE strftime('%Y-%m-%d %H:%M', V_Date) = ?"
        )

        const row = stmt.get(dateTimeSearch) as { count: number } | undefined
        const exists = row && row.count > 0

        console.log(`[Flight-Check] ${dateTimeSearch} -> ${exists ? 'EXISTS' : 'NEW'}`)

        return { exists: Boolean(exists) }
    } catch (error: any) {
        console.error('[Flight-Check] Error checking flight:', error.message)
        return { exists: false }
    }
}

// Register IPC handler for checking if flight exists
ipcMain.handle('flight:checkExists', async (_event, args: FlightCheckRequest & { dbPath: string }) => {
    const { dbPath, ...flight } = args

    if (!dbPath || !fs.existsSync(dbPath)) {
        return { exists: false }
    }

    try {
        const db = new DatabaseSync(dbPath, { open: true })
        const result = checkFlightInDb(db, flight)
        db.close()

        return result
    } catch (error: any) {
        console.error('[Flight-Check] Error:', error.message)
        return { exists: false }
    }
})

// Register IPC handler for batch checking multiple flights
ipcMain.handle('flight:checkExistsBatch', async (_event, args) => {
    const flights: FlightCheckRequest[] = args.flights
    const dbPath: string = args.dbPath

    console.log(`[Flight-Check] Batch checking ${flights.length} flights against ${dbPath || 'no database'}`)

    // If no database path or file doesn't exist, return all as new
    if (!dbPath || !fs.existsSync(dbPath)) {
        console.log('[Flight-Check] No valid database path, marking all as new')
        return JSON.parse(JSON.stringify({
            success: true,
            results: flights.map(() => ({ exists: false }))
        }))
    }

    try {
        // Open database in read mode
        const db = new DatabaseSync(dbPath, { open: true })

        // Check each flight and create plain objects
        const results: FlightCheckResult[] = flights.map(flight => {
            const result = checkFlightInDb(db, flight)
            return { exists: Boolean(result.exists) }
        })

        db.close()

        const existingCount = results.filter(r => r.exists).length
        console.log(`[Flight-Check] Found ${existingCount}/${flights.length} existing flights`)

        // Force serialization
        return JSON.parse(JSON.stringify({ success: true, results }))
    } catch (error: any) {
        console.error('[Flight-Check] Error:', error.message)
        return JSON.parse(JSON.stringify({
            success: false,
            message: String(error.message),
            results: flights.map(() => ({ exists: false }))
        }))
    }
})

export { }

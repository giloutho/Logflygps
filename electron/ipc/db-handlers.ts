/**
 * Database Handlers
 * SQLite database operations for logbook using Electron's native SQLite
 * 
 * Electron 37+ includes native SQLite support via better-sqlite3 bundled
 * This provides better performance than sql.js
 */

import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
// @ts-ignore - node:sqlite is available in Node 23+
import { DatabaseSync } from 'node:sqlite'
import Store from 'electron-store'

const store = new Store()

// Current database path
let currentDbPath: string | null = null

// For now, we'll use file-based operations
// The actual SQL operations will be handled by the renderer process using sql.js
// This is for compatibility with logfly-web which uses sql.js

// Open existing database
ipcMain.handle('db:open', async (_event, args) => {
    const dbPath = args.dbPath

    try {
        if (!fs.existsSync(dbPath)) {
            return { success: false, message: 'Database file not found' }
        }

        // Verify it's a valid SQLite file (check magic bytes)
        const buffer = Buffer.alloc(16)
        const fd = fs.openSync(dbPath, 'r')
        fs.readSync(fd, buffer, 0, 16, 0)
        fs.closeSync(fd)

        const header = buffer.toString('utf8', 0, 16)
        if (!header.startsWith('SQLite format 3')) {
            return { success: false, message: 'Invalid SQLite database file' }
        }

        currentDbPath = dbPath
        store.set('lastDbPath', dbPath)
        store.set('lastDbName', path.basename(dbPath))

        console.log('[DB] Opened database:', dbPath)

        return {
            success: true,
            dbPath,
            name: path.basename(dbPath)
        }
    } catch (error: any) {
        console.error('[DB] Error opening database:', error)
        return { success: false, message: error.message }
    }
})

// Create new database with Logfly schema
ipcMain.handle('db:create', async (_event, args) => {
    const dbPath = args.dbPath

    try {
        // Create directory if it doesn't exist
        const dir = path.dirname(dbPath)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }

        // For now, we'll create an empty file
        // The actual SQLite initialization with tables will be done later
        // when we integrate better-sqlite3 or the renderer uses sql.js

        // Create empty SQLite database header
        // Minimum valid SQLite3 database (header only, no tables)
        const sqliteHeader = Buffer.from([
            0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, // "SQLite f"
            0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00, // "ormat 3\0"
            0x10, 0x00, 0x01, 0x01, 0x00, 0x40, 0x20, 0x20,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
            0x00, 0x2e, 0x5c, 0x8b, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ])

        // Actually, let's just notify the renderer to create the database with proper schema
        // The renderer will use sql.js which is compatible with logfly-web
        fs.writeFileSync(dbPath, sqliteHeader)

        currentDbPath = dbPath
        store.set('lastDbPath', dbPath)
        store.set('lastDbName', path.basename(dbPath))

        console.log('[DB] Created database:', dbPath)

        return {
            success: true,
            dbPath,
            name: path.basename(dbPath),
            needsInit: true // Tell renderer to initialize the schema
        }
    } catch (error: any) {
        console.error('[DB] Error creating database:', error)
        return { success: false, message: error.message }
    }
})

// Read database file as ArrayBuffer (for sql.js in renderer)
ipcMain.handle('db:read', async (_event, args) => {
    const dbPath = args?.dbPath || currentDbPath

    if (!dbPath) {
        return { success: false, message: 'No database path specified' }
    }

    try {
        const buffer = fs.readFileSync(dbPath)
        // Return as Uint8Array which can be transferred to renderer
        return {
            success: true,
            data: new Uint8Array(buffer)
        }
    } catch (error: any) {
        console.error('[DB] Error reading database:', error)
        return { success: false, message: error.message }
    }
})

// Write database buffer to file (from sql.js in renderer)
ipcMain.handle('db:write', async (_event, args) => {
    const dbPath = args?.dbPath || currentDbPath
    const data = args.data

    if (!dbPath) {
        return { success: false, message: 'No database path specified' }
    }

    if (!data) {
        return { success: false, message: 'No data to write' }
    }

    try {
        fs.writeFileSync(dbPath, Buffer.from(data))
        console.log('[DB] Saved database:', dbPath)
        return { success: true }
    } catch (error: any) {
        console.error('[DB] Error writing database:', error)
        return { success: false, message: error.message }
    }
})

// Flight adding is now handled in flight-add.ts

// Get current database path
ipcMain.handle('db:getPath', async () => {
    return {
        path: currentDbPath,
        name: currentDbPath ? path.basename(currentDbPath) : null
    }
})

// Check if a flight already exists (by date and duration)
ipcMain.handle('db:checkFlight', async (_event, _args) => {
    // This would need actual database access
    // For now, return false (not found)
    return { exists: false }
})

// Get simplified flight list
ipcMain.handle('db:getFlightsList', async (_event, args) => {
    const dbPath = args.dbPath
    if (!dbPath || !fs.existsSync(dbPath)) {
        return { success: false, message: 'Database not found' }
    }

    try {
        const db = new DatabaseSync(dbPath, { open: true })
        // Get simple list of flights
        const stmt = db.prepare("SELECT V_ID, V_Date, V_sDuree, V_Site FROM Vol ORDER BY V_Date DESC")
        const flights = stmt.all()
        db.close()

        // Convert to array of objects guaranteed
        return { success: true, flights: JSON.parse(JSON.stringify(flights)) }
    } catch (error: any) {
        return { success: false, message: error.message }
    }
})

export { }

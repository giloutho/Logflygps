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

        const db = new DatabaseSync(dbPath)

        // Enable foreign keys
        db.exec("PRAGMA foreign_keys = ON;")

        // Create tables (Schema matching Logfly 6)

        // VOL (Flights)
        db.exec(`CREATE TABLE IF NOT EXISTS Vol (
            V_ID integer NOT NULL PRIMARY KEY,
            V_Date TimeStamp,
            V_Duree integer,
            V_sDuree varchar(20),
            V_LatDeco double,
            V_LongDeco double,
            V_AltDeco integer,
            V_Site varchar(100),
            V_Pays varchar(50),
            V_Commentaire Long Text,
            V_IGC Long Text,
            V_Photos Long Text,
            UTC integer,
            V_CFD integer,
            V_Engin Varchar(10),
            V_League integer,
            V_Score Long Text,
            V_Tag INTEGER
        );`)
        // SITES (Sites)
        db.exec(`CREATE TABLE IF NOT EXISTS Site (
            S_ID integer NOT NULL primary key,
            S_Nom varchar(50),
            S_Localite varchar(50),
            S_CP varchar(8),
            S_Pays varchar(50),
            S_Type varchar(1),
            S_Orientation varchar(20),
            S_Alti varchar(12),
            S_Latitude double,
            S_Longitude double,
            S_Commentaire Long Text,
            S_Maj varchar(10)
        );`)

        // MATERIEL (Gear)
        db.exec(`CREATE TABLE IF NOT EXISTS Equip (
            M_ID integer NOT NULL PRIMARY KEY,
            M_Date TimeStamp,
            M_Engin varchar(30),
            M_Event varchar(30),
            M_Price double,
            M_Comment Long Text 
        );`)

        // Création de la table Tag
        db.exec(`CREATE TABLE Tag (
            Tag_ID INTEGER PRIMARY KEY,
            Tag_Label TEXT,
            Tag_Color TEXT
        )`);

        // Insertion des tags par défaut
        const defaultTags = [
            [1, 'Tag 1', '#F44336'], // Red
            [2, 'Tag 2', '#FF9800'], // Orange
            [3, 'Tag 3', '#FFEB3B'], // Yellow
            [4, 'Tag 4', '#4CAF50'], // Green
            [5, 'Tag 5', '#2196F3']  // Blue
        ];
        const stmtInsert = db.prepare(`INSERT INTO Tag (Tag_ID, Tag_Label, Tag_Color) VALUES (?, ?, ?)`);
        for (const tag of defaultTags) {
            stmtInsert.run(tag[0], tag[1], tag[2]);
        }

        db.close()

        currentDbPath = dbPath
        store.set('lastDbPath', dbPath)
        store.set('lastDbName', path.basename(dbPath))

        console.log('[DB] Created database:', dbPath)

        return {
            success: true,
            dbPath,
            name: path.basename(dbPath)
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

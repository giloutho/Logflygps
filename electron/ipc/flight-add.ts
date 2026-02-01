/**
 * Flight Add Handler
 * Adds a flight to the database
 * ported from logfly65/src/ipcmain/flight-add.js
 */

import { ipcMain } from 'electron'
import fs from 'node:fs'

// @ts-ignore - node:sqlite is available in Node 23+
import { DatabaseSync } from 'node:sqlite'

interface FlightData {
    date: string
    dateISO: string
    startTime: string
    takeoffTime: string
    duration: number
    durationStr: string
    fileName: string
    filePath: string
    pilotName: string
    glider: string
    latitude: number
    longitude: number
    offsetUTC: number
    IgcText?: string
}

// Haversine distance calculation
function distance(lat1: number, lon1: number, lat2: number, lon2: number, unit: 'K' | 'N' = 'K'): number {
    if ((lat1 === lat2) && (lon1 === lon2)) {
        return 0
    }
    const radlat1 = Math.PI * lat1 / 180
    const radlat2 = Math.PI * lat2 / 180
    const theta = lon1 - lon2
    const radtheta = Math.PI * theta / 180
    let dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta)
    if (dist > 1) {
        dist = 1
    }
    dist = Math.acos(dist)
    dist = dist * 180 / Math.PI
    dist = dist * 60 * 1.1515
    if (unit === 'K') {
        dist = dist * 1.609344
    }
    if (unit === 'N') {
        dist = dist * 0.8684
    }
    return dist
}

/**
 * Search for a site in the database near the coordinates
 */
function searchSiteInDb(db: InstanceType<typeof DatabaseSync>, lat: number, long: number): { name: string, country: string } | null {
    let distMini = 300 // distance in meters

    // Search window approx 1km
    const latMin = lat - 0.01
    const latMax = lat + 0.01
    const longMin = long - 0.01
    const longMax = long + 0.01

    try {
        const stmt = db.prepare(`
            SELECT S_ID, S_Nom, S_Latitude, S_Longitude, S_Pays 
            FROM Site 
            WHERE S_Latitude > ? AND S_Latitude < ? 
            AND S_Longitude > ? AND S_Longitude < ? 
            AND S_Type <> 'A'
        `)

        const sites = stmt.all(latMin, latMax, longMin, longMax) as any[]
        let selectedSite = null

        for (const site of sites) {
            const carnetLat = site.S_Latitude
            const carnetLong = site.S_Longitude
            const distSite = Math.abs(distance(lat, long, carnetLat, carnetLong, 'K') * 1000)

            if (distSite < distMini) {
                distMini = distSite
                selectedSite = {
                    name: site.S_Nom,
                    country: site.S_Pays
                }
            }
        }

        return selectedSite
    } catch (error) {
        console.error('[Flight-Add] Error searching site:', error)
        return null
    }
}

/**
 * Add a new generic site to the database
 */
function addNewSite(db: InstanceType<typeof DatabaseSync>, lat: number, long: number, alt: number): { name: string, country: string } {
    try {
        // Find existing "Site No XX" to determine next index
        const stmtCount = db.prepare("SELECT Count(S_ID) as count FROM Site WHERE S_Nom LIKE 'Site No%'")
        const resCount = stmtCount.get() as { count: number }
        const nextIndex = (resCount?.count || 0) + 1

        const siteName = `Site No ${nextIndex} (auto)`
        const country = ''
        const updateDate = new Date().toISOString().split('T')[0] // YYYY-MM-DD

        const stmtInsert = db.prepare(`
            INSERT INTO Site (S_Nom, S_Pays, S_Alti, S_Latitude, S_Longitude, S_CP, S_Type, S_Maj)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)

        stmtInsert.run(siteName, country, alt, lat, long, '***', 'D', updateDate)

        return { name: siteName, country }
    } catch (error) {
        console.error('[Flight-Add] Error creating new site:', error)
        return { name: 'Unknown Site', country: '' }
    }
}

ipcMain.handle('db:addFlight', async (_event, args) => {
    // Deserialize if needed (though Electron handles it, we forced JSON stringify before)
    // Actually, args coming from invoke are already objects, but let's be safe
    const flightData: FlightData = args.flightData

    // We assume dbPath is injected or available via some store, 
    // but better passed in args. For now we use the global dbPath logic or find recent one
    // But wait, the handler doesn't receive dbPath in args from the view currently.
    // We need to fetch it from electron-store or rely on the previously opened one.
    // Let's assume we pass it or get it. 
    // Ideally, pass dbPath in args like we did for flight-check.

    // Fetch dbPath from store if not provided (placeholder logic)
    // In our app, we might need to pass dbPath explicitly.
    // Let's check how flight-check gets it. It gets it from args.
    // We should update the view to pass dbPath.

    // TEMPORARY FIX: we will try to get dbPath from the arg if passed, 
    // or we will have to look at how to persist it.
    // For this specific turn, I will look if the view passes dbPath.
    // The view passes { text: ... } ? No it passes flightData.
    // I will modify the view to pass dbPath as well.

    // But for now, let's assume we receive it.
    const dbPath = args.dbPath

    if (!dbPath || !fs.existsSync(dbPath)) {
        return { success: false, message: 'Database path not provided or files does not exist' }
    }

    try {
        console.log(`[Flight-Add] Adding flight ${flightData.dateISO} ${flightData.takeoffTime} to ${dbPath}`)

        const db = new DatabaseSync(dbPath, { open: true })

        // 1. Calculate durations
        const totalSeconds = flightData.duration
        const hours = Math.floor(totalSeconds / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const durationStr = `${String(hours).padStart(2, '0')}h${String(minutes).padStart(2, '0')}mn`

        // 2. Read IGC content
        let igcContent = ''
        if (flightData.IgcText) {
            igcContent = flightData.IgcText
        } else if (flightData.filePath && fs.existsSync(flightData.filePath)) {
            igcContent = fs.readFileSync(flightData.filePath, 'utf8')
        }

        // 3. Search or create site
        let siteName = ''
        let siteCountry = ''

        if (flightData.latitude && flightData.longitude) {
            const foundSite = searchSiteInDb(db, flightData.latitude, flightData.longitude)
            if (foundSite) {
                siteName = foundSite.name
                siteCountry = foundSite.country
            } else {
                const newSite = addNewSite(db, flightData.latitude, flightData.longitude, 0)
                siteName = newSite.name
                siteCountry = newSite.country
            }
        }

        // 4. Prepare SQL
        // Format date as YYYY-MM-DD HH:MM:SS
        // flightData.dateISO is YYYY-MM-DD
        // flightData.takeoffTime is HH:MM:SS
        const sqlDate = `${flightData.dateISO} ${flightData.takeoffTime}`

        const stmt = db.prepare(`
            INSERT INTO Vol (
                V_Date, V_Duree, V_sDuree, V_LatDeco, V_LongDeco, V_AltDeco,
                V_Site, V_Pays, V_IGC, UTC, V_Engin
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        const result = stmt.run(
            sqlDate,
            flightData.duration,
            durationStr,
            flightData.latitude || 0,
            flightData.longitude || 0,
            0, // Altitude deco not present in ParsedFlight yet, defaulting to 0
            siteName,
            siteCountry,
            igcContent,
            flightData.offsetUTC || 0,
            flightData.glider || ''
        )

        db.close()

        if (result.changes > 0) {
            return JSON.parse(JSON.stringify({ success: true, message: 'Flight added' }))
        } else {
            return JSON.parse(JSON.stringify({ success: false, message: 'Insertion failed' }))
        }

    } catch (error: any) {
        console.error('[Flight-Add] Error:', error)
        return JSON.parse(JSON.stringify({ success: false, message: error.message }))
    }
})

export { }

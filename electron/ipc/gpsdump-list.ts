/**
 * GPSDump List Handler
 * Ported from logfly65/src/ipcmain/gpsdump-list.js
 * Gets flight list from serial GPS devices using GPSDump
 */

import { ipcMain } from 'electron'
import { execFileSync, spawnSync } from 'child_process'
import path from 'node:path'
import fs from 'node:fs'
// @ts-ignore - node:sqlite is available in Node 23+
import { DatabaseSync } from 'node:sqlite'
import Store from 'electron-store'
import { getGpsDumpParams, getGpsDumpPath } from './gpsdump-settings'

const store = new Store()

interface Flight {
    new: boolean
    date: string
    takeoff: string
    duration: string
    gpsdump: string
}

interface FlightList {
    manufacturer: string | null
    model: string | null
    serial: string | null
    firmware: string | null
    error: boolean
    flights: Flight[]
    otherlines: string[]
}

// Register IPC handler
ipcMain.handle('gpsdump:list', async (_event, args) => {
    const gpsModel = args.gpsModel
    const specOS = store.get('specOS') as string || 'mac64'

    const flightList: FlightList = {
        manufacturer: null,
        model: null,
        serial: null,
        firmware: null,
        error: false,
        flights: [],
        otherlines: []
    }

    const gpsDumpParams = getGpsDumpParams()
    const params = gpsDumpParams[specOS]

    if (!params) {
        flightList.error = true
        flightList.otherlines.push(`Unsupported OS: ${specOS}`)
        return flightList
    }

    let gpsDumpPath: string
    try {
        gpsDumpPath = getGpsDumpPath(specOS)
    } catch (error: any) {
        flightList.error = true
        flightList.otherlines.push(error.message)
        return flightList
    }

    const modelGPS = gpsModel.model
    const wNoWin = '/win=0'
    const wExit = '/exit'
    const wOverw = '/overwrite'

    console.log(`[GPSDump-List] Request: ${gpsDumpPath} for ${modelGPS} on ${gpsModel.port}`)

    // Select GPS type parameter
    let paramGPS: string
    switch (modelGPS) {
        case 'flysd':
            paramGPS = params.flym
            break
        case 'flyold':
            paramGPS = params.flymold
            break
        case 'fly20':
            paramGPS = params.fly20
            break
        case 'fly15':
            paramGPS = params.fly15
            break
        default:
            flightList.error = true
            flightList.otherlines.push(`Unknown GPS model: ${modelGPS}`)
            return flightList
    }

    const paramList = params.list
    const paramFile = params.listfile

    console.log(`[GPSDump-List] Params: ${paramGPS} ${paramList} ${paramFile}`)

    if (!fs.existsSync(gpsDumpPath)) {
        flightList.error = true
        flightList.otherlines.push('GPSDump not found')
        console.log('[GPSDump-List] GPSDump not found at:', gpsDumpPath)
        return flightList
    }

    let data: Buffer | string | null = null
    let paramPort: string

    try {
        switch (specOS) {
            case 'win': {
                const numPort = gpsModel.port.replace('COM', '')
                paramPort = '/com=' + numPort
                const wParamFile = '/notify=' + paramFile
                const wParam = [wNoWin, paramPort, paramGPS, paramList, wParamFile, wOverw, wExit]
                console.log(`[GPSDump-List] ${path.basename(gpsDumpPath)} ${wParam.join(' ')}`)
                execFileSync(gpsDumpPath, wParam)
                if (paramFile && fs.existsSync(paramFile)) {
                    data = fs.readFileSync(paramFile, 'utf8')
                }
                break
            }
            case 'mac32': {
                paramPort = gpsModel.port.replace('/dev/tty', '-cu')
                console.log(`[GPSDump-List] ${path.basename(gpsDumpPath)} ${paramGPS} ${paramPort} ${paramList}`)
                data = execFileSync(gpsDumpPath, [paramGPS, paramPort, paramList])
                break
            }
            case 'mac64': {
                paramPort = gpsModel.port.replace('/dev/tty', '-cu')
                console.log(`[GPSDump-List] ${path.basename(gpsDumpPath)} ${paramGPS} ${paramPort} ${paramFile} ${paramList}`)
                data = execFileSync(gpsDumpPath, [paramGPS, paramPort, paramFile!, paramList])
                break
            }
            case 'linux': {
                let subPort = 'ca0'
                if (gpsModel.port.length > 8) subPort = gpsModel.port.substring(0, 9)

                switch (subPort) {
                    case '/dev/ttyA':
                        paramPort = gpsModel.port.replace('/dev/ttyACM', '-ca')
                        break
                    case '/dev/ttyS':
                        paramPort = gpsModel.port.replace('/dev/ttyS', '-c')
                        break
                    case '/dev/ttyU':
                        paramPort = gpsModel.port.replace('/dev/ttyUSB', '-cu')
                        break
                    default:
                        paramPort = gpsModel.port
                        break
                }

                console.log(`[GPSDump-List] ${path.basename(gpsDumpPath)} ${paramGPS} ${paramPort} ${paramFile} ${paramList}`)
                const rawData = spawnSync(gpsDumpPath, [paramGPS, paramPort, paramFile!, paramList])
                data = rawData.stdout.toString()
                break
            }
        }
    } catch (err: any) {
        console.error('[GPSDump-List] Error:', err)
        flightList.error = true
        flightList.otherlines.push(`GPSDump error: ${err.message}`)
        return flightList
    }

    if (data) {
        const gpsdumpOrder = `${paramGPS},${paramPort!},${modelGPS}`
        await decodeFlightList(data.toString(), modelGPS, gpsdumpOrder, flightList, specOS)

        // Check for duplicates in database if dbPath provided
        const dbPath = args.dbPath
        if (dbPath && flightList.flights.length > 0) {
            checkFlightList(dbPath, flightList)
        }
    } else {
        flightList.error = true
        flightList.otherlines.push('No response from GPSDump')
    }

    return flightList
})

/**
 * Check flight list against database to identify duplicates
 * Ported from logfly65 checkFlightList logic
 */
function checkFlightList(dbPath: string, flightList: FlightList): void {
    try {
        if (!fs.existsSync(dbPath)) return

        console.log(`[GPSDump-List] Checking ${flightList.flights.length} flights against DB`)
        const db = new DatabaseSync(dbPath, { open: true })
        const regexMinSec = /:([0-5][0-9]):([0-5][0-9])/

        flightList.flights.forEach(flight => {
            const arrDate = flight.date.split('.')
            if (arrDate.length === 3) {
                // Convert DD.MM.YY to YYYY-MM-DD
                const strDate = '20' + arrDate[2] + '-' + arrDate[1] + '-' + arrDate[0]
                const arrTakeoff = flight.takeoff.split(':')

                if (arrTakeoff.length === 3) {
                    const takeoffMinSeconds = (parseInt(arrTakeoff[1]) * 60) + parseInt(arrTakeoff[2])

                    const arrDuration = flight.duration.split(':')
                    if (arrDuration.length > 2) {
                        const gpsDurationSeconds = (parseInt(arrDuration[0]) * 3600) + (parseInt(arrDuration[1]) * 60) + parseInt(arrDuration[2])

                        const dateStart = strDate + ' 00:00:00'
                        const dateEnd = strDate + ' 23:59:59'

                        const stmtDate = db.prepare(
                            "SELECT V_Date, V_Duree FROM Vol WHERE V_Date >= ? AND V_Date <= ?"
                        )
                        const flightsOfDay = stmtDate.all(dateStart, dateEnd) as any[]

                        for (const fl of flightsOfDay) {
                            let diffSecOK = false
                            if (fl.V_Date.match(regexMinSec)) {
                                const dbMinSec = regexMinSec.exec(fl.V_Date)
                                if (dbMinSec) {
                                    const dbMinSeconds = (parseInt(dbMinSec[1]) * 60) + parseInt(dbMinSec[2])
                                    let diffSeconds = dbMinSeconds - takeoffMinSeconds

                                    // Offset check (5 min tolerance)
                                    if (diffSeconds > 300) {
                                        diffSeconds = 3600 - diffSeconds
                                        if (diffSeconds < 360) diffSecOK = true
                                        else diffSecOK = false
                                    } else {
                                        diffSecOK = true
                                    }

                                    const dbDuration = parseInt(fl.V_Duree)
                                    const totalSec = gpsDurationSeconds - diffSeconds

                                    // Duration check (3 min tolerance)
                                    if (Math.abs(totalSec - dbDuration) < 180 && diffSecOK) {
                                        flight.new = false
                                        break // Found duplicate
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })

        db.close()
    } catch (error) {
        console.error('[GPSDump-List] Error checking flight list:', error)
    }
}

/**
 * Decode flight list from GPSDump output
 */
async function decodeFlightList(
    gpsdumpOutput: string,
    gpsModel: string,
    gpsdumpOrder: string,
    flightList: FlightList,
    specOS: string
): Promise<void> {
    const lines = gpsdumpOutput.trim().split('\n')
    console.log(`[GPSDump-List] Decoding ${lines.length} lines for ${gpsModel}`)

    if (gpsModel === 'fly20') {
        flightList.model = 'Flytec 20/30 Compeo'
    } else if (gpsModel === 'fly15') {
        flightList.model = 'Flytec 6015 / Brau IQ basic'
    } else {
        flightList.model = gpsModel
    }

    if (lines.length === 0) {
        flightList.error = true
        flightList.otherlines.push('Empty response from GPSDump')
        return
    }

    // Different decoding based on OS and GPS model
    if (gpsModel === 'fly15' && (specOS === 'mac64' || specOS === 'linux')) {
        decodeFlytec15(lines, gpsdumpOrder, flightList)
    } else {
        switch (specOS) {
            case 'win':
                decodeWin(lines, gpsdumpOrder, flightList)
                break
            case 'mac32':
                decodeMac32(lines, gpsdumpOrder, flightList)
                break
            case 'mac64':
            case 'linux':
                decodeMac64(lines, gpsdumpOrder, flightList)
                break
        }
    }

    console.log(`[GPSDump-List] Decoded ${flightList.flights.length} flights`)
}

/**
 * Decode Mac64/Linux format
 * Line format: Product: Flymaster GpsSD  SN02988  SW2.03h
 *              1   23.07.20   06:08:16   01:21:57
 */
function decodeMac64(lines: string[], gpsdumpOrder: string, flightList: FlightList): void {
    console.log('[GPSDump-List] Using mac64 decoding')

    const regexProduct = /(Product:)[ ]{1,}(\w*)[ ]{1,}(\S*)[ ]{1,}(\S*)[ ]{1,}(\S*)/
    const regexDateHours = /((\d{1,2}\.){2}\d{2}(\d{2})?)[ ]{1,}((\d{1,2}:){2}\d{2}(\d{2})?)[ ]{1,}((\d{1,2}:){2}\d{2}(\d{2})?)/

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(regexProduct)) {
            const arrProduct = regexProduct.exec(lines[i])
            if (arrProduct) {
                flightList.manufacturer = arrProduct[2]
                flightList.model = `${arrProduct[2]} ${arrProduct[3]}`
                flightList.serial = arrProduct[4]
                flightList.firmware = arrProduct[5]
            }
        } else if (lines[i].match(regexDateHours)) {
            const flDate = regexDateHours.exec(lines[i])
            if (flDate) {
                flightList.flights.push({
                    new: true,
                    date: flDate[1],
                    takeoff: flDate[4],
                    duration: flDate[7],
                    gpsdump: gpsdumpOrder
                })
            }
        } else {
            flightList.otherlines.push(`Line ${i}: ${lines[i]}`)
        }
    }
}

/**
 * Decode Mac32 format
 * Line format: 1 Flight date 29.07.22, time 06:00:54, duration 00:00:34
 */
function decodeMac32(lines: string[], gpsdumpOrder: string, flightList: FlightList): void {
    const regexDateHours = /Flight date ([0-9]+(\.[0-9]+)+), time ([0-9]+(:[0-9]+)+), duration ([0-9]+(:[0-9]+)+)/

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].match(regexDateHours)) {
            const flDate = regexDateHours.exec(lines[i])
            if (flDate) {
                flightList.flights.push({
                    new: true,
                    date: flDate[1],
                    takeoff: flDate[3],
                    duration: flDate[5],
                    gpsdump: gpsdumpOrder
                })
            }
        } else {
            flightList.otherlines.push(`Line ${i}: ${lines[i]}`)
        }
    }
}

/**
 * Decode Windows format
 * Line format: 2022.06.18,13:06:13,1:25:54
 */
function decodeWin(lines: string[], gpsdumpOrder: string, flightList: FlightList): void {
    const regexDateHours = /((\d{1,2}\.){2}\d{2}(\d{2})?)[,]{1,}((\d{1,2}:){2}\d{2}(\d{2})?)[,]{1,}((\d{1,2}:){2}\d{2}(\d{2})?)/

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].match(regexDateHours)) {
            const flDate = regexDateHours.exec(lines[i])
            if (flDate) {
                // Convert 2022.06.18 -> 18.06.2022
                const dateConverted = flDate[1].substring(6) + flDate[1].substring(2, 6) + flDate[1].substring(0, 2)
                flightList.flights.push({
                    new: true,
                    date: dateConverted,
                    takeoff: flDate[4],
                    duration: flDate[7],
                    gpsdump: gpsdumpOrder
                })
            }
        } else {
            flightList.otherlines.push(`Line ${i}: ${lines[i]}`)
        }
    }
}

/**
 * Decode Flytec 6015 format
 * Line format: 1; 21.06.25; 14:38:50;        1; 00:17:45;
 */
function decodeFlytec15(lines: string[], gpsdumpOrder: string, flightList: FlightList): void {
    const regexDateHours = /([^;]*);([^;]*);([^;]*);([^;]*);([^;]*);/

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(regexDateHours)) {
            const flDate = regexDateHours.exec(lines[i])
            if (flDate) {
                // flDate[2] is YY.MM.DD format, convert to DD.MM.YY
                const arr = flDate[2].split('.')
                let dateConverted = flDate[2]
                if (arr.length === 3) {
                    const day = arr[2].trim()
                    const month = arr[1].trim()
                    const year = arr[0].trim()
                    dateConverted = `${day}.${month}.${year}`
                }

                flightList.flights.push({
                    new: true,
                    date: dateConverted,
                    takeoff: flDate[3].trim(),
                    duration: flDate[5].trim(),
                    gpsdump: gpsdumpOrder
                })
            }
        } else {
            flightList.otherlines.push(`Line ${i}: ${lines[i]}`)
        }
    }
}

export { }

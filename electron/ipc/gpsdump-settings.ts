/**
 * GPSDump Settings
 * Ported from logfly65/src/js/gpsdump-settings.js
 * Configuration for GPSDump executable on different OS
 */

import { app } from 'electron'
import path from 'node:path'

// GPSDump executable names per OS
export const gpsdumpNames: Record<string, string> = {
    mac32: 'gpsdumpMac32_54',
    mac64: 'gpsdumpMac64_14',
    win: 'GpsDump542.exe',
    linux: 'gpsdumpLin64_28'
}

/**
 * Get GPSDump parameters for each OS
 */
export function getGpsDumpParams(): Record<string, {
    gpsdump: string
    flym: string
    flymold: string
    fly20: string
    fly15: string
    list: string
    listfile?: string
    temp: string
    track: string
    wpread: string
    wpfile?: string
    wpwrite: string
}> {
    const tempPath = app.getPath('temp')

    return {
        win: {
            gpsdump: gpsdumpNames.win,
            flym: '/gps=flymaster',          // Flymaster SD
            flymold: '/gps=flymasterold',    // Flymaster Old
            fly20: '/gps=iqcompeo',          // Compeo/Compeo+/Galileo/Competino/Flytec 5020,5030,6030
            fly15: '/gps=iqbasic',           // IQ-Basic / Flytec 6015
            list: '/flightlist',
            listfile: path.join(tempPath, 'gpslist.txt'),
            temp: '/igc_log=',
            track: '/track=',
            wpread: '/rd_wpt',
            wpwrite: '/wr_wpt'
        },
        mac32: {
            gpsdump: gpsdumpNames.mac32,
            flym: '/gps=flymaster',
            flymold: '/gps=flymasterold',
            fly20: '/gps=flytec',
            fly15: '/gps=iqbasic',
            list: '/flightlist',
            temp: '/name=',
            track: '/track=',
            wpread: '/rdwpt',
            wpwrite: '/wrwpt'
        },
        mac64: {
            gpsdump: gpsdumpNames.mac64,
            flym: '-gyn',
            flymold: '-gy',
            fly20: '-gc',
            fly15: '-giq',
            list: '-f0',
            listfile: '-lnomatter.txt',
            temp: '-l',
            track: '-f',
            wpread: '-w',
            wpfile: path.join(tempPath, 'tempwp.wpt'),
            wpwrite: '-r'
        },
        linux: {
            gpsdump: gpsdumpNames.linux,
            flym: '-gyn',
            flymold: '-gy',
            fly20: '-gc',
            fly15: '-giq',
            list: '-f0',
            listfile: '-lnomatter.txt',
            temp: '-l',
            track: '-f',
            wpread: '-w',
            wpfile: path.join(tempPath, 'tempwp.wpt'),
            wpwrite: '-r'
        }
    }
}

/**
 * Get path to GPSDump executable
 */
export function getGpsDumpPath(specOS: string): string {
    const params = getGpsDumpParams()
    const gpsdumpName = params[specOS]?.gpsdump

    if (!gpsdumpName) {
        throw new Error(`Unsupported OS: ${specOS}`)
    }

    // In development, bin_ext is at project root
    // In production, it's in resources/bin_ext
    if (process.env.NODE_ENV !== 'production') {
        return path.join(process.env.APP_ROOT || '', 'bin_ext', gpsdumpName)
    } else {
        return path.join(app.getAppPath(), '..', 'bin_ext', gpsdumpName)
    }
}

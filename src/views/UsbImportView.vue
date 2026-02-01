<template>
    <v-container fluid class="pa-4">
        <!-- Status alert -->
        <v-alert v-if="statusMessage" :type="statusType" variant="tonal" class="mb-4" closable
            @click:close="statusMessage = ''">
            <span v-html="statusMessage"></span>
            <v-progress-circular v-if="scanning" indeterminate size="20" width="2" class="ml-2" />
        </v-alert>

        <!-- USB GPS Selection -->
        <v-card v-if="!showFlightTable" class="logflygps-card mb-4">
            <v-card-title>
                <v-icon start>mdi-usb</v-icon>
                {{ $gettext('USB GPS') }}
            </v-card-title>
            <v-card-text>
                <p class="mb-4">
                    {{ $gettext('Select your GPS device to automatically detect and import flights.') }}
                </p>

                <v-row>
                    <v-col v-for="device in usbDevices" :key="device.type" cols="6" sm="4" md="3">
                        <v-btn block :color="scanning ? 'grey' : 'primary'" variant="outlined"
                            :loading="scanning && currentDevice === device.lib" :disabled="scanning"
                            @click="scanUsbGps(device.type, device.lib)">
                            {{ device.lib }}
                        </v-btn>
                    </v-col>
                </v-row>

                <v-divider class="my-4" />

                <v-btn color="info" variant="tonal" prepend-icon="mdi-format-list-bulleted" @click="listUsbDrives"
                    :loading="listingUsb">
                    {{ $gettext('Usb list') }}
                </v-btn>
            </v-card-text>
        </v-card>

        <!-- USB Drives List -->
        <v-card v-if="usbDrivesList.length > 0 && !showFlightTable" class="logflygps-card mb-4">
            <v-card-title>
                <v-icon start>mdi-harddisk</v-icon>
                {{ $gettext('USB Drives Detected') }}
            </v-card-title>
            <v-card-text>
                <v-table>
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Size</th>
                            <th>Mount Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(drive, index) in usbDrivesList" :key="index">
                            <td>{{ drive.description }}</td>
                            <td>{{ formatSize(drive.size) }}</td>
                            <td>{{drive.mountpoints?.map((mp: any) => mp.path).join(', ')}}</td>
                        </tr>
                    </tbody>
                </v-table>
            </v-card-text>
        </v-card>

        <!-- Flight Table -->
        <FlightTable v-if="showFlightTable" :flights="scannedFlights" :current-device="currentDevice"
            :importing="importing" @import-selected="importSelectedFlights" @close="closeFlightTable"
            @show-map="showFlightOnMap" />
    </v-container>
</template>

<script setup lang="ts">
import { ref, inject, type Ref } from 'vue'
import { useGettext } from 'vue3-gettext'
import FlightTable from '../components/FlightTable.vue'

interface Flight {
    toStore: boolean
    isValid: boolean
    existsInDB: boolean
    date: string
    dateISO?: string
    takeoffTime?: string
    startTime?: string
    duration?: number
    durationStr?: string
    fileName?: string
    file?: string
    filePath?: string
    path?: string
    pilotName?: string
    pilot?: string
    glider?: string
    gliderName?: string
    latitude?: number
    longitude?: number
    offsetUTC?: number
    rawContent?: string
}

const emit = defineEmits<{
    (e: 'flights-imported', count: number): void
}>()

const { $gettext } = useGettext()
const showSnackbar = inject('showSnackbar') as (text: string, color?: string) => void
const dbPath = inject<Ref<string>>('dbPath')

// USB device configurations
const usbDevices = [
    { type: 'xct', lib: 'XCTracer' },
    { type: 'sky2', lib: 'Skytraax 2' },
    { type: 'sky3', lib: 'Skytraax 3/4/5' },
    { type: 'syrusb', lib: 'Syride USB' },
    { type: 'oud', lib: 'Oudie' },
    { type: 'cpil', lib: 'CPilot' },
    { type: 'elem', lib: 'Element' },
    { type: 'connect', lib: 'Connect' },
    { type: 'rever', lib: 'Reversale' },
    { type: 'skydrop', lib: 'Skydrop' },
    { type: 'vardui', lib: 'Varduino' },
    { type: 'flynet', lib: 'Flynet' },
    { type: 'sens', lib: 'Sensbox' },
]

// State
const scanning = ref(false)
const listingUsb = ref(false)
const importing = ref(false)
const currentDevice = ref('')
const statusMessage = ref('')
const statusType = ref<'info' | 'success' | 'warning' | 'error'>('info')
const showFlightTable = ref(false)
const scannedFlights = ref<Flight[]>([])
const usbDrivesList = ref<any[]>([])

/**
 * List all USB drives
 */
async function listUsbDrives() {
    listingUsb.value = true
    usbDrivesList.value = []

    try {
        const result = await window.electronAPI.invoke({
            invoketype: 'gps:usb',
            args: { typeGps: 'listUsb' }
        })

        if (result.success && result.usbDrivesInfo) {
            usbDrivesList.value = result.usbDrivesInfo
        } else {
            showStatus(result.message || $gettext('No USB drives found'), 'warning')
        }
    } catch (error: any) {
        showStatus(error.message, 'error')
    } finally {
        listingUsb.value = false
    }
}

/**
 * Scan for USB GPS and import flights
 */
async function scanUsbGps(typeGps: string, libGps: string) {
    scanning.value = true
    currentDevice.value = libGps
    showStatus(`${$gettext('Search')} ${libGps}...`, 'info')

    try {
        // Step 1: Detect USB GPS
        const result = await window.electronAPI.invoke({
            invoketype: 'gps:usb',
            args: { typeGps }
        })

        if (!result.success) {
            showStatus(result.message || $gettext('No USB drives found'), 'error')
            return
        }

        showStatus(`${libGps} ${$gettext('Found')}... ${$gettext('Reading flights in progress')}`, 'info')

        // Step 2: Scan folder for IGC/GPX files
        const scanResult = await window.electronAPI.invoke({
            invoketype: 'disk:scan',
            args: { folderPath: result.pathFlights }
        })

        if (!scanResult.success || scanResult.totalCount === 0) {
            showStatus($gettext('No tracks in this folder'), 'warning')
            return
        }

        showStatus(`${scanResult.igcFiles.length} ${$gettext('tracks decoded')}...`, 'info')

        // Step 3: Parse IGC files minimally (batch)
        const parseResult = await window.electronAPI.invoke({
            invoketype: 'igc:parseMinimalBatch',
            args: { files: scanResult.igcFiles }
        })

        if (!parseResult.success || !parseResult.flights || parseResult.flights.length === 0) {
            showStatus($gettext('No tracks in this folder'), 'warning')
            return
        }

        // Step 4: Check which flights already exist in database
        const flights = parseResult.flights as Flight[]
        await checkFlightsInDatabase(flights)

        scannedFlights.value = flights

        if (scannedFlights.value.length > 0) {
            statusMessage.value = ''
            showFlightTable.value = true
        } else {
            showStatus($gettext('No tracks in this folder'), 'warning')
        }
    } catch (error: any) {
        showStatus(error.message, 'error')
    } finally {
        scanning.value = false
    }
}

/**
 * Check which flights already exist in the database
 */
async function checkFlightsInDatabase(flights: Flight[]) {
    // Get the database path from injected ref
    const currentDbPath = dbPath?.value || ''

    if (!currentDbPath) {
        console.log('[UsbImport] No database path, skipping check')
        return
    }

    try {
        // Build requests with all necessary data for checking
        const checkRequests = flights.map(f => ({
            date: f.date || '',
            dateISO: f.dateISO || '',
            startTime: f.startTime || '',
            takeoffTime: f.takeoffTime || f.startTime || '',
            latitude: f.latitude || 0,
            longitude: f.longitude || 0
        }))

        console.log('[UsbImport] Checking', checkRequests.length, 'flights against', currentDbPath)

        const result = await window.electronAPI.invoke({
            invoketype: 'flight:checkExistsBatch',
            args: {
                flights: checkRequests,
                dbPath: currentDbPath
            }
        })

        if (result.success && result.results) {
            let existsCount = 0
            for (let i = 0; i < flights.length && i < result.results.length; i++) {
                const exists = result.results[i].exists
                flights[i].existsInDB = exists
                flights[i].toStore = !exists // Only check flights that don't exist
                if (exists) existsCount++
            }
            console.log('[UsbImport] Found', existsCount, 'existing flights')
        }
    } catch (error) {
        console.error('[UsbImport] Error checking flights:', error)
        // If check fails, assume all flights are new
    }
}

/**
 * Format file size
 */
function formatSize(bytes: number): string {
    if (!bytes) return ''
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
}

/**
 * Show status message
 */
function showStatus(message: string, type: 'info' | 'success' | 'warning' | 'error') {
    statusMessage.value = message
    statusType.value = type
}

/**
 * Import selected flights
 */
async function importSelectedFlights() {
    const toImport = scannedFlights.value.filter(f => f.toStore)
    if (toImport.length === 0) return

    importing.value = true
    let imported = 0

    try {
        for (const flight of toImport) {
            // Create a simple serializable object for IPC
            const flightData = {
                date: String(flight.date || ''),
                dateISO: String(flight.dateISO || ''),
                startTime: String(flight.startTime || ''),
                takeoffTime: String(flight.takeoffTime || ''),
                duration: Number(flight.duration || 0),
                durationStr: String(flight.durationStr || ''),
                fileName: String(flight.fileName || flight.file || ''),
                filePath: String(flight.filePath || flight.path || ''),
                pilotName: String(flight.pilotName || flight.pilot || ''),
                glider: String(flight.glider || ''),
                latitude: Number(flight.latitude || 0),
                longitude: Number(flight.longitude || 0),
                offsetUTC: Number(flight.offsetUTC || 0)
            }

            const currentDbPath = typeof dbPath === 'string' ? dbPath : (dbPath?.value || '')

            const result = await window.electronAPI.invoke({
                invoketype: 'db:addFlight',
                args: {
                    flightData,
                    dbPath: currentDbPath
                }
            })

            if (result.success) {
                imported++
                flight.existsInDB = true
                flight.toStore = false
            }
        }

        showSnackbar(`${imported} ${$gettext('tracks imported')}`, 'success')
        emit('flights-imported', imported)

        if (imported === toImport.length) {
            closeFlightTable()
        }
    } catch (error: any) {
        showSnackbar(error.message, 'error')
    } finally {
        importing.value = false
    }
}

/**
 * Close flight table
 */
function closeFlightTable() {
    showFlightTable.value = false
    scannedFlights.value = []
    currentDevice.value = ''
}

/**
 * Show flight on map (placeholder)
 */
function showFlightOnMap(flight: Flight) {
    console.log('[UsbImport] Show on map:', flight.fileName)
    showSnackbar(`${$gettext('Map')}: ${flight.fileName}`, 'info')
}
</script>

<style scoped>
/* Styles inherited from global CSS */
</style>

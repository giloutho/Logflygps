<template>
    <v-container fluid class="pa-4">
        <!-- Status alert -->
        <v-alert v-if="statusMessage" :type="statusType" variant="tonal" class="mb-4" closable
            @click:close="statusMessage = ''">
            <span v-html="statusMessage"></span>
            <v-progress-circular v-if="scanning" indeterminate size="20" width="2" class="ml-2" />
        </v-alert>

        <!-- Serial GPS Selection -->
        <v-card v-if="!showFlightTable" class="logflygps-card mb-4">
            <v-card-title>
                <v-icon start>mdi-serial-port</v-icon>
                {{ $gettext('Serial GPS') }}
            </v-card-title>
            <v-card-text>
                <p class="mb-4">
                    {{ $gettext('Select your GPS device type') }}.
                    {{ $gettext('LogflyGPS will scan all serial ports to find your GPS') }}
                </p>

                <v-row>
                    <v-col v-for="device in serialDevices" :key="device.type" cols="6" sm="4" md="3">
                        <v-btn block :color="scanning ? 'grey' : 'secondary'" variant="outlined"
                            :loading="scanning && currentDevice === device.lib" :disabled="scanning"
                            @click="scanSerialGps(device.type, device.lib)">
                            {{ device.lib }}
                        </v-btn>
                    </v-col>
                </v-row>

                <v-divider class="my-4" />

                <v-btn color="info" variant="tonal" prepend-icon="mdi-format-list-bulleted" @click="listSerialPorts"
                    :loading="listingPorts">
                    {{ $gettext('Serial ports') }}
                </v-btn>
            </v-card-text>
        </v-card>

        <!-- Serial Ports List -->
        <v-card v-if="serialPortsList.length > 0 && !showFlightTable" class="logflygps-card mb-4">
            <v-card-title>
                <v-icon start>mdi-serial-port</v-icon>
                {{ $gettext('Serial Ports Detected') }}
            </v-card-title>
            <v-card-text>
                <v-table>
                    <thead>
                        <tr>
                            <th>{{ $gettext('Name') }}</th>
                            <th>{{ $gettext('Manufacturer') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(port, index) in serialPortsList" :key="index">
                            <td>{{ port.path }}</td>
                            <td>{{ port.manufacturer || $gettext('Unknown') }}</td>
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
    rawContent?: string
    gpsdump?: string
}

const emit = defineEmits<{
    (e: 'flights-imported', count: number): void
}>()

const { $gettext } = useGettext()
const showSnackbar = inject('showSnackbar') as (text: string, color?: string) => void
const dbPath = inject<Ref<string>>('dbPath')

// Serial GPS device configurations (using GPSDump)
const serialDevices = [
    { type: 'flysd', lib: 'Flymaster SD' },
    { type: 'flyold', lib: 'Flymaster Old' },
    { type: 'fly20', lib: 'Flytec 6020/30' },
    { type: 'fly15', lib: 'Flytec 6015' },
]

// State
const scanning = ref(false)
const listingPorts = ref(false)
const importing = ref(false)
const currentDevice = ref('')
const statusMessage = ref('')
const statusType = ref<'info' | 'success' | 'warning' | 'error'>('info')
const showFlightTable = ref(false)
const scannedFlights = ref<Flight[]>([])
const serialPortsList = ref<any[]>([])
const currentGpsdumpParams = ref('')

/**
 * List all serial ports
 */
async function listSerialPorts() {
    listingPorts.value = true
    serialPortsList.value = []

    try {
        const result = await window.electronAPI.invoke({
            invoketype: 'gps:serial'
        })

        if (result.success && result.portsarray) {
            serialPortsList.value = result.portsarray
            if (result.portsarray.length === 0) {
                showStatus($gettext('No usable serial port detected'), 'warning')
            }
        } else {
            showStatus(result.message || $gettext('Unable to retrieve serial ports'), 'error')
        }
    } catch (error: any) {
        showStatus(error.message, 'error')
    } finally {
        listingPorts.value = false
    }
}

/**
 * Scan for serial GPS and get flight list
 */
async function scanSerialGps(typeGps: string, libGps: string) {
    scanning.value = true
    currentDevice.value = libGps
    showStatus(`${$gettext('Search')} ${libGps}...`, 'info')

    try {
        // Step 1: Get serial ports
        const portsResult = await window.electronAPI.invoke({
            invoketype: 'gps:serial'
        })

        if (!portsResult.success || !portsResult.portsarray || portsResult.portsarray.length === 0) {
            showStatus($gettext('No usable serial port detected'), 'error')
            return
        }

        // Step 2: Try each port (starting from last detected)
        const ports = [...portsResult.portsarray].reverse()
        let flightListResult = null

        for (const port of ports) {
            showStatus(`${libGps}... ${$gettext('attempt to read on')} ${port.path}`, 'info')

            const gpsRequest = {
                chip: port.manufacturer,
                model: typeGps,
                port: port.path
            }

            const currentDbPath = typeof dbPath === 'string' ? dbPath : (dbPath?.value || '')

            const result = await window.electronAPI.invoke({
                invoketype: 'gpsdump:list',
                args: {
                    gpsModel: gpsRequest,
                    dbPath: currentDbPath
                }
            })

            if (result.flights && result.flights.length > 0) {
                flightListResult = result
                currentGpsdumpParams.value = result.flights[0]?.gpsdump || ''
                break
            }
        }

        if (flightListResult && flightListResult.flights && flightListResult.flights.length > 0) {
            // Convert to our Flight format
            scannedFlights.value = flightListResult.flights.map((f: any, index: number) => ({
                toStore: f.new !== false,
                isValid: true,
                existsInDB: f.new === false,
                date: f.date,
                takeoffTime: f.takeoff,
                startTime: f.takeoff,
                duration: parseDurationToSeconds(f.duration),
                durationStr: f.duration,
                fileName: `Flight ${index + 1}`,
                file: `Flight ${index + 1}`,
                gpsdump: f.gpsdump,
                pilotName: '',
                pilot: ''
            }))

            statusMessage.value = ''
            showFlightTable.value = true
        } else {
            showStatus($gettext('No flights found on the ports list'), 'warning')
        }
    } catch (error: any) {
        showStatus(error.message, 'error')
    } finally {
        scanning.value = false
    }
}

/**
 * Parse duration string (HH:MM:SS) to seconds
 */
function parseDurationToSeconds(duration: string): number {
    if (!duration) return 0
    const parts = duration.split(':').map(Number)
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
    return 0
}

/**
 * Show status message
 */
function showStatus(message: string, type: 'info' | 'success' | 'warning' | 'error') {
    statusMessage.value = message
    statusType.value = type
}

/**
 * Import selected flights (using GPSDump to download each flight)
 */
async function importSelectedFlights() {
    const toImport = scannedFlights.value.filter(f => f.toStore)
    if (toImport.length === 0) return

    importing.value = true
    let imported = 0

    try {
        for (let i = 0; i < toImport.length; i++) {
            const flight = toImport[i]
            const flightIndex = scannedFlights.value.indexOf(flight)

            showStatus(`${$gettext('Importing')} ${i + 1}/${toImport.length}...`, 'info')

            // Download flight from GPS using GPSDump
            const igcResult = await window.electronAPI.invoke({
                invoketype: 'gpsdump:flight',
                args: {
                    gpsParam: flight.gpsdump,
                    flightIndex: flightIndex,
                    withGeoJSON: false
                }
            })

            if (igcResult.success && igcResult.flightData) {
                const currentDbPath = typeof dbPath === 'string' ? dbPath : (dbPath?.value || '')

                // flightData from igcResult now includes takeoffTime and offsetUTC
                // but we should ensure dateISO is present
                if (!igcResult.flightData.dateISO && igcResult.flightData.date) {
                    igcResult.flightData.dateISO = igcResult.flightData.date
                }

                // Add flight to database
                const addResult = await window.electronAPI.invoke({
                    invoketype: 'db:addFlight',
                    args: {
                        flightData: igcResult.flightData,
                        dbPath: currentDbPath
                    }
                })

                if (addResult.success) {
                    imported++
                    flight.existsInDB = true
                    flight.toStore = false
                }
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
        statusMessage.value = ''
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
 * Show flight on map
 */
async function showFlightOnMap(flight: Flight) {
    const flightIndex = scannedFlights.value.indexOf(flight)

    showStatus(`${$gettext('Map request')}...`, 'info')

    try {
        // Download flight with GeoJSON
        const result = await window.electronAPI.invoke({
            invoketype: 'gpsdump:flight',
            args: {
                gpsParam: flight.gpsdump,
                flightIndex: flightIndex,
                withGeoJSON: true
            }
        })

        if (result.success) {
            // TODO: Open map dialog with GeoJSON
            console.log('[SerialImport] Flight downloaded:', result.flightData.date)
            showSnackbar(`${$gettext('Flight preview')}: ${flight.date}`, 'info')
        } else {
            showSnackbar(result.message, 'error')
        }
    } catch (error: any) {
        showSnackbar(error.message, 'error')
    } finally {
        statusMessage.value = ''
    }
}
</script>

<style scoped>
/* Styles inherited from global CSS */
</style>

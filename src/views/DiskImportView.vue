<template>
    <v-container fluid class="pa-4">
        <!-- Folder Selection -->
        <v-card v-if="!showFlightTable" class="logflygps-card mb-4">
            <v-card-title>
                <v-icon start>mdi-folder-open</v-icon>
                {{ $gettext('Disk') }}
            </v-card-title>
            <v-card-text>
                <p class="mb-4">
                    {{ $gettext('Select a folder containing IGC or GPX track files to import.') }}
                </p>

                <v-btn color="success" size="large" prepend-icon="mdi-folder-search" @click="selectFolder"
                    :loading="scanning">
                    {{ $gettext('Select folder') }}
                </v-btn>

                <v-alert v-if="error" type="error" variant="tonal" class="mt-4" closable @click:close="error = ''">
                    {{ error }}
                </v-alert>

                <v-alert v-if="statusMessage" type="info" variant="tonal" class="mt-4">
                    {{ statusMessage }}
                    <v-progress-circular v-if="scanning" indeterminate size="20" width="2" class="ml-2" />
                </v-alert>
            </v-card-text>
        </v-card>

        <!-- Flight Table -->
        <FlightTable v-if="showFlightTable" :flights="scannedFlights" :current-device="currentFolder"
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
    latitude?: number
    longitude?: number
    offsetUTC?: number
    glider?: string
    gliderName?: string
    rawContent?: string
}

const emit = defineEmits<{
    (e: 'flights-imported', count: number): void
}>()

const { $gettext } = useGettext()
const showSnackbar = inject('showSnackbar') as (text: string, color?: string) => void
const dbPath = inject<Ref<string>>('dbPath')

// State
const scanning = ref(false)
const importing = ref(false)
const error = ref('')
const statusMessage = ref('')
const showFlightTable = ref(false)
const scannedFlights = ref<Flight[]>([])
const currentFolder = ref('')

/**
 * Select folder using native dialog
 */
async function selectFolder() {
    scanning.value = true
    error.value = ''
    statusMessage.value = $gettext('Scanning') + '...'

    try {
        // Open folder dialog
        const dialogResult = await window.electronAPI.invoke({
            invoketype: 'dialog:openDirectory'
        })

        if (dialogResult.canceled || !dialogResult.filePaths || dialogResult.filePaths.length === 0) {
            scanning.value = false
            statusMessage.value = ''
            return
        }

        const folderPath = dialogResult.filePaths[0]
        currentFolder.value = folderPath.split(/[/\\]/).pop() || folderPath

        // Scan folder for tracks
        const scanResult = await window.electronAPI.invoke({
            invoketype: 'disk:scan',
            args: { folderPath }
        })

        if (!scanResult.success) {
            error.value = scanResult.message || $gettext('Error during scanning')
            return
        }

        if (scanResult.totalCount === 0) {
            error.value = $gettext('No tracks in this folder')
            return
        }

        statusMessage.value = `${scanResult.igcFiles.length} ${$gettext('tracks decoded')}...`

        // Parse IGC files minimally (batch)
        const parseResult = await window.electronAPI.invoke({
            invoketype: 'igc:parseMinimalBatch',
            args: { files: scanResult.igcFiles }
        })

        if (!parseResult.success || !parseResult.flights || parseResult.flights.length === 0) {
            error.value = $gettext('No tracks in this folder')
            return
        }

        // Check which flights already exist in database
        const flights = parseResult.flights as Flight[]
        await checkFlightsInDatabase(flights)

        scannedFlights.value = flights

        if (scannedFlights.value.length > 0) {
            statusMessage.value = ''
            showFlightTable.value = true
        } else {
            error.value = $gettext('No tracks in this folder')
        }
    } catch (err: any) {
        error.value = err.message || $gettext('Error')
        console.error('[DiskImport] Error:', err)
    } finally {
        scanning.value = false
        statusMessage.value = ''
    }
}

/**
 * Check which flights already exist in the database
 */
async function checkFlightsInDatabase(flights: Flight[]) {
    // Get the database path from injected ref
    const currentDbPath = dbPath?.value || ''

    if (!currentDbPath) {
        console.log('[DiskImport] No database path, skipping check')
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

        console.log('[DiskImport] Checking', checkRequests.length, 'flights against', currentDbPath)

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
                flights[i].toStore = !exists
                if (exists) existsCount++
            }
            console.log('[DiskImport] Found', existsCount, 'existing flights')
        }
    } catch (err) {
        console.error('[DiskImport] Error checking flights:', err)
    }
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
                glider: String(flight.glider || flight.gliderName || ''),
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
    } catch (err: any) {
        showSnackbar(err.message, 'error')
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
    currentFolder.value = ''
}

/**
 * Show flight on map (placeholder)
 */
function showFlightOnMap(flight: Flight) {
    console.log('[DiskImport] Show on map:', flight.fileName)
    showSnackbar(`${$gettext('Map')}: ${flight.fileName}`, 'info')
}
</script>

<style scoped>
/* Styles inherited from global CSS */
</style>

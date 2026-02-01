<template>
    <v-card class="logflygps-card">
        <v-card-title class="d-flex justify-space-between align-center flex-wrap">
            <div>
                <span><b>{{ currentDevice }}</b> : {{ filteredFlights.length }} {{ $gettext('tracks decoded') }}</span>
                <v-checkbox v-model="showAllFlights" :label="$gettext('Display all tracks')" hide-details
                    density="compact" class="mt-2" />
            </div>
            <div>
                <v-btn color="success" @click="$emit('import-selected')" :disabled="!hasSelectedFlights"
                    :loading="importing" class="mr-2">
                    <v-icon start>mdi-database-import</v-icon>
                    {{ $gettext('Import') }} {{ selectedFlightsCount }}
                </v-btn>
                <v-btn color="grey" variant="text" @click="$emit('close')">
                    {{ $gettext('Close') }}
                </v-btn>
            </div>
        </v-card-title>

        <v-card-text>
            <v-data-table :headers="headers" :items="filteredFlights" :items-per-page="10" class="elevation-1">
                <!-- Checkbox column -->
                <template v-slot:item.toStore="{ item }">
                    <v-checkbox v-model="item.toStore" hide-details :disabled="!item.isValid || item.existsInDB" />
                </template>

                <!-- Date column -->
                <template v-slot:item.date="{ item }">
                    <span :class="{ 'text-grey': !item.isValid }">
                        {{ item.date || '-' }}
                    </span>
                </template>

                <!-- Takeoff time column -->
                <template v-slot:item.takeoffTime="{ item }">
                    <span :class="{ 'text-grey': !item.isValid }">
                        {{ item.takeoffTime || item.startTime || '-' }}
                    </span>
                </template>

                <!-- Duration column -->
                <template v-slot:item.durationStr="{ item }">
                    <span :class="{ 'text-grey': !item.isValid }">
                        {{ item.durationStr || formatDuration(item.duration) || '-' }}
                    </span>
                </template>

                <!-- File name column -->
                <template v-slot:item.fileName="{ item }">
                    <v-tooltip :text="item.filePath || item.path || item.fileName">
                        <template v-slot:activator="{ props }">
                            <span v-bind="props" :class="{ 'text-grey': !item.isValid }">
                                {{ item.fileName || item.file || '-' }}
                            </span>
                        </template>
                    </v-tooltip>
                    <v-chip v-if="item.existsInDB" size="x-small" color="warning" class="ml-2">
                        {{ $gettext('Already in the logbook') }}
                    </v-chip>
                    <v-chip v-if="!item.isValid" size="x-small" color="error" class="ml-2">
                        {{ $gettext('Invalid') }}
                    </v-chip>
                </template>

                <!-- Pilot name column -->
                <template v-slot:item.pilotName="{ item }">
                    <span :class="{ 'text-grey': !item.isValid }">
                        {{ item.pilotName || item.pilot || '-' }}
                    </span>
                </template>

                <!-- Actions column -->
                <template v-slot:item.actions="{ item }">
                    <v-btn icon="mdi-map" size="small" variant="text" color="primary" @click="$emit('show-map', item)"
                        :disabled="!item.isValid" />
                </template>
            </v-data-table>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGettext } from 'vue3-gettext'

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
}

const props = defineProps<{
    flights: Flight[]
    currentDevice: string
    importing?: boolean
}>()

defineEmits<{
    (e: 'import-selected'): void
    (e: 'close'): void
    (e: 'show-map', flight: Flight): void
}>()

const { $gettext } = useGettext()

// Show all flights or only those to import
const showAllFlights = ref(true)

// Table headers matching logfly-web
const headers = [
    { title: '', key: 'toStore', sortable: false, width: '50px' },
    { title: $gettext('Date'), key: 'date', sortable: true },
    { title: $gettext('Time'), key: 'takeoffTime', sortable: true },
    { title: $gettext('Duration'), key: 'durationStr', sortable: false },
    { title: $gettext('File'), key: 'fileName', sortable: true },
    { title: $gettext('Pilot'), key: 'pilotName', sortable: true },
    { title: $gettext('Actions'), key: 'actions', sortable: false, align: 'center' as const, width: '100px' }
]

// Computed properties
const filteredFlights = computed(() => {
    if (showAllFlights.value) {
        return props.flights
    }
    return props.flights.filter(f => f.toStore)
})

const selectedFlightsCount = computed(() => {
    return props.flights.filter(f => f.toStore).length
})

const hasSelectedFlights = computed(() => {
    return selectedFlightsCount.value > 0
})

// Format duration from seconds to HH:MM:SS
function formatDuration(seconds?: number): string {
    if (!seconds) return ''
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.text-grey {
    color: #9e9e9e;
}
</style>

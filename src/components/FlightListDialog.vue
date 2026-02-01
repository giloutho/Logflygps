<template>
    <v-dialog v-model="show" max-width="800px" scrollable>
        <v-card class="logfly-card">
            <v-card-title class="d-flex justify-space-between align-center">
                <span>{{ $gettext('Quick Logbook View') }}</span>
                <v-btn icon="mdi-close" variant="text" @click="close"></v-btn>
            </v-card-title>

            <v-divider></v-divider>

            <v-card-text class="pa-0" style="height: 600px;">
                <div v-if="loading" class="d-flex justify-center align-center h-100">
                    <v-progress-circular indeterminate color="primary"></v-progress-circular>
                </div>
                <div v-else-if="error" class="pa-4 text-center text-error">
                    {{ error }}
                </div>
                <v-table v-else fixed-header density="compact" hover>
                    <thead>
                        <tr>
                            <th class="text-left font-weight-bold">{{ $gettext('Date') }}</th>
                            <th class="text-center font-weight-bold">{{ $gettext('Time') }}</th>
                            <th class="text-center font-weight-bold">{{ $gettext('Duration') }}</th>
                            <th class="text-left font-weight-bold">{{ $gettext('Site') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in flights" :key="item.V_ID">
                            <td>{{ formatDate(item.V_Date) }}</td>
                            <td class="text-center">{{ formatTime(item.V_Date) }}</td>
                            <td class="text-center">{{ item.V_sDuree }}</td>
                            <td>{{ item.V_Site }}</td>
                        </tr>
                    </tbody>
                </v-table>
            </v-card-text>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, inject, type Ref } from 'vue'
import { useGettext } from 'vue3-gettext'

const props = defineProps<{
    modelValue: boolean
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
}>()

const { $gettext } = useGettext()
const show = ref(props.modelValue)
const loading = ref(false)
const error = ref('')
const flights = ref<any[]>([])
const dbPath = inject<Ref<string>>('dbPath')

watch(() => props.modelValue, (val) => {
    show.value = val
    if (val) {
        loadFlights()
    }
})

watch(show, (val) => {
    emit('update:modelValue', val)
})

async function loadFlights() {
    loading.value = true
    error.value = ''
    flights.value = []

    try {
        const currentDbPath = typeof dbPath === 'string' ? dbPath : (dbPath?.value || '')
        const result = await window.electronAPI.invoke({
            invoketype: 'db:getFlightsList',
            args: { dbPath: currentDbPath }
        })

        if (result.success) {
            flights.value = result.flights
        } else {
            error.value = result.message || 'Error loading flights'
        }
    } catch (err: any) {
        error.value = err.message
    } finally {
        loading.value = false
    }
}

function formatDate(dateStr: string) {
    if (!dateStr) return ''
    // Format YYYY-MM-DD HH:MM:SS -> DD/MM/YYYY
    const datePart = dateStr.split(' ')[0]
    const parts = datePart.split('-')
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return datePart
}

function formatTime(dateStr: string) {
    if (!dateStr) return ''
    // Format YYYY-MM-DD HH:MM:SS -> HH:MM
    const timePart = dateStr.split(' ')[1]
    if (timePart) {
        return timePart.substring(0, 5)
    }
    return ''
}

function close() {
    show.value = false
}
</script>

<style scoped>
.logfly-card {
    border-radius: 8px;
}
</style>

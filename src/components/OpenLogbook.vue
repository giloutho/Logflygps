<template>
    <v-dialog v-model="dialog" persistent max-width="500">
        <v-card :loading="loading" class="logflygps-card">
            <v-card-text>
                <!-- Existing logbook section -->
                <h3 class="text-h6 text-primary mb-4 font-weight-bold">
                    <v-icon start color="primary">mdi-database-eye</v-icon>
                    {{ $gettext('Existing logbook') }}
                    <v-btn icon="mdi-information-outline" variant="text" density="comfortable" color="grey-darken-1"
                        @click="displayInfo" />
                </h3>

                <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
                    {{ error }}
                </v-alert>

                <v-btn block color="primary" prepend-icon="mdi-folder-search" @click="handlePickDirectory"
                    :disabled="loading">
                    {{ $gettext('Choose a folder') }}
                </v-btn>

                <v-btn v-if="lastDbPath" variant="text" block class="mt-4" @click="reopenLastFile">
                    {{ $gettext('Reopen') }} {{ lastDbName }}
                </v-btn>

                <v-slide-y-transition>
                    <div v-if="availableFiles.length > 0" class="mt-6">
                        <div class="text-caption mb-2">{{ $gettext('Logbooks detected') }}:</div>
                        <v-select :items="sortedAvailableFiles" item-title="name" :label="$gettext('Select a logbook')"
                            prepend-inner-icon="mdi-database" return-object variant="outlined"
                            @update:model-value="handleFileSelection" />
                    </div>
                </v-slide-y-transition>

                <v-divider class="my-6" />

                <!-- New logbook section -->
                <h3 class="text-h6 text-success mb-4 font-weight-bold">
                    <v-icon start color="success">mdi-database-plus</v-icon>
                    {{ $gettext('New logbook') }}
                </h3>

                <v-text-field v-model="newLogbookName" :label="$gettext('Enter a name and click the Create button')"
                    prepend-inner-icon="mdi-database-minus" variant="outlined" density="compact" class="mb-2"
                    hide-details placeholder="mylogbook.db" />

                <v-btn block color="success" prepend-icon="mdi-plus-circle" @click="handleCreateNewLogbook"
                    :disabled="loading || !newLogbookName">
                    {{ $gettext('Create new logbook') }}
                </v-btn>
            </v-card-text>

            <v-divider />

            <v-card-actions class="pa-4">
                <v-spacer />
                <v-btn variant="text" color="grey-darken-1" @click="handleClose">
                    {{ $gettext('Cancel') }}
                </v-btn>
            </v-card-actions>
        </v-card>

        <!-- Info snackbar -->
        <v-snackbar v-model="showInfo" timeout="8000" color="info" location="bottom">
            {{ infoMessage }}
            <template v-slot:actions>
                <v-btn variant="text" @click="showInfo = false">
                    {{ $gettext('Close') }}
                </v-btn>
            </template>
        </v-snackbar>
    </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGettext } from 'vue3-gettext'

interface DbFile {
    name: string
    path: string
}

const props = defineProps<{
    show: boolean
}>()

const emit = defineEmits<{
    (e: 'db-opened', name?: string, path?: string): void
    (e: 'close'): void
}>()

const { $gettext } = useGettext()

// State
const loading = ref(false)
const error = ref('')
const showInfo = ref(false)
const infoMessage = ref('')
const newLogbookName = ref('')
const availableFiles = ref<DbFile[]>([])
const selectedFolder = ref('')
const lastDbPath = ref('')
const lastDbName = ref('')

// Dialog is shown when show prop is true
const dialog = computed(() => props.show)

// Sort available files by name
const sortedAvailableFiles = computed(() => {
    return [...availableFiles.value].sort((a, b) => a.name.localeCompare(b.name))
})

onMounted(async () => {
    // Get last used database path
    try {
        lastDbPath.value = await window.electronAPI.storeGet('lastDbPath') || ''
        if (lastDbPath.value) {
            const parts = lastDbPath.value.split(/[/\\]/)
            lastDbName.value = parts[parts.length - 1]
        }
    } catch (e) {
        console.log('[OpenLogbook] Could not get last db path')
    }
})

function displayInfo() {
    let msg = $gettext('In previous versions of Logfly')
    msg += ', ' + $gettext('the default logbook folder was Documents/Logfly')
    msg += '. ' + $gettext('The default logbook was logfly.db') + '.'
    infoMessage.value = msg
    showInfo.value = true
}

function handleClose() {
    emit('close')
}

/**
 * Pick a directory using Electron's dialog
 */
async function handlePickDirectory() {
    error.value = ''
    loading.value = true

    try {
        const result = await window.electronAPI.invoke({
            invoketype: 'dialog:openDirectory'
        })

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            loading.value = false
            return
        }

        selectedFolder.value = result.filePaths[0]

        // Scan for .db files
        const scanResult = await window.electronAPI.invoke({
            invoketype: 'folder:scanDb',
            args: { folderPath: selectedFolder.value }
        })

        if (scanResult.success && scanResult.files.length > 0) {
            availableFiles.value = scanResult.files
        } else {
            error.value = $gettext('No logbook found in this folder')
            availableFiles.value = []
        }
    } catch (err: any) {
        error.value = err.message || $gettext('Error')
        console.error('[OpenLogbook] Error:', err)
    } finally {
        loading.value = false
    }
}

/**
 * Handle file selection from dropdown
 */
async function handleFileSelection(file: DbFile) {
    if (!file) return

    loading.value = true
    error.value = ''

    try {
        const result = await window.electronAPI.invoke({
            invoketype: 'db:open',
            args: { dbPath: file.path }
        })

        if (result.success) {
            // Save last used path
            await window.electronAPI.storeSet('lastDbPath', file.path)
            await window.electronAPI.storeSet('lastDbName', file.name)

            emit('db-opened', file.name, file.path)
        } else {
            error.value = result.message || $gettext('Error reading the file')
        }
    } catch (err: any) {
        error.value = $gettext('Error reading the file')
        console.error('[OpenLogbook] Error:', err)
    } finally {
        loading.value = false
    }
}

/**
 * Reopen last used database
 */
async function reopenLastFile() {
    if (!lastDbPath.value) return

    await handleFileSelection({
        name: lastDbName.value,
        path: lastDbPath.value
    })
}

/**
 * Create a new logbook
 */
async function handleCreateNewLogbook() {
    error.value = ''
    loading.value = true

    try {
        // Add .db extension if not present
        let filename = newLogbookName.value.trim()
        if (!filename.toLowerCase().endsWith('.db')) {
            filename += '.db'
        }

        // Open save dialog
        const result = await window.electronAPI.invoke({
            invoketype: 'dialog:saveFile',
            args: {
                defaultPath: filename,
                filters: [{ name: 'SQLite Database', extensions: ['db'] }]
            }
        })

        if (result.canceled || !result.filePath) {
            loading.value = false
            return
        }

        // Create new database
        const createResult = await window.electronAPI.invoke({
            invoketype: 'db:create',
            args: { dbPath: result.filePath }
        })

        if (createResult.success) {
            // Save last used path
            await window.electronAPI.storeSet('lastDbPath', result.filePath)
            await window.electronAPI.storeSet('lastDbName', filename)

            newLogbookName.value = ''
            emit('db-opened', filename, result.filePath)
        } else {
            error.value = createResult.message || $gettext('Error creating the logbook')
        }
    } catch (err: any) {
        error.value = err.message || $gettext('Error creating the logbook')
        console.error('[OpenLogbook] Error:', err)
    } finally {
        loading.value = false
    }
}
</script>

<style scoped>
/* Styles are inherited from global CSS */
</style>

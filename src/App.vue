<template>
  <v-app>
    <!-- App Bar with navigation -->
    <v-app-bar class="logflygps-appbar" density="comfortable">
      <v-app-bar-title>
        <b>LogflyGPS</b>
        <v-chip v-if="currentDbName" color="white" variant="outlined" size="small" class="ml-3">
          <v-icon start size="small">mdi-database</v-icon>
          {{ currentDbName }}
        </v-chip>
      </v-app-bar-title>

      <v-spacer />

      <!-- Navigation buttons -->
      <v-btn :variant="currentView === 'usb' ? 'tonal' : 'text'" prepend-icon="mdi-usb" @click="navigateTo('usb')"
        :disabled="!hasOpenDatabase">
        {{ $gettext('USB GPS') }}
      </v-btn>

      <v-btn :variant="currentView === 'serial' ? 'tonal' : 'text'" prepend-icon="mdi-serial-port"
        @click="navigateTo('serial')" :disabled="!hasOpenDatabase">
        {{ $gettext('Serial GPS') }}
      </v-btn>

      <v-btn :variant="currentView === 'disk' ? 'tonal' : 'text'" prepend-icon="mdi-folder-open"
        @click="navigateTo('disk')" :disabled="!hasOpenDatabase">
        {{ $gettext('Disk') }}
      </v-btn>

      <v-btn variant="text" prepend-icon="mdi-format-list-bulleted" @click="showFlightList = true"
        :disabled="!hasOpenDatabase">
        {{ $gettext('Logbook') }}
      </v-btn>

      <v-btn :variant="currentView === 'support' ? 'tonal' : 'text'" prepend-icon="mdi-headset"
        @click="navigateTo('support')">
        {{ $gettext('Support') }}
      </v-btn>
    </v-app-bar>

    <!-- Main content -->
    <v-main>
      <!-- Open Logbook Dialog -->
      <OpenLogbook :show="!hasOpenDatabase" @db-opened="onDbOpened" />

      <!-- Flight List Dialog -->
      <FlightListDialog v-model="showFlightList" />

      <!-- Welcome view when database is open but no view selected -->
      <TheWelcome v-if="hasOpenDatabase && currentView === 'welcome'" @navigate="navigateTo" />

      <!-- USB Import View -->
      <UsbImportView v-if="hasOpenDatabase && currentView === 'usb'" @flights-imported="onFlightsImported" />

      <!-- Serial Import View -->
      <SerialImportView v-if="hasOpenDatabase && currentView === 'serial'" @flights-imported="onFlightsImported" />

      <!-- Disk Import View -->
      <DiskImportView v-if="hasOpenDatabase && currentView === 'disk'" @flights-imported="onFlightsImported" />

      <!-- Support View -->
      <SupportView v-if="currentView === 'support'" />
    </v-main>

    <!-- Update Dialog -->
    <v-dialog v-model="updateAvailable" persistent max-width="500">
      <v-card>
        <v-card-title class="text-h5 bg-primary text-white">
          <v-icon start icon="mdi-cloud-download" />
          {{ $gettext('Update Available') }}
        </v-card-title>
        <v-card-text class="pt-4">
          <div class="d-flex align-center mb-4">
            <v-img :src="logoUrl" width="64" height="64" class="mr-4 flex-grow-0" />
            <div>
              <div class="text-subtitle-1 font-weight-bold">{{ $gettext('New version available') }}</div>
              <div class="text-body-2">{{ $gettext('Version') }} {{ updateVersion }} {{ $gettext('is available')
              }}.</div>
            </div>
          </div>
          <p>{{ $gettext('Click download to get the latest version from GitHub') }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="grey-darken-1" variant="text" @click="updateAvailable = false">
            {{ $gettext('Later') }}
          </v-btn>
          <v-btn color="primary" @click="openUpdateUrl" prepend-icon="mdi-download">
            {{ $gettext('Download') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar for notifications -->
    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="4000" location="bottom">
      {{ snackbarText }}
      <template v-slot:actions>
        <v-btn variant="text" @click="snackbar = false">
          {{ $gettext('Close') }}
        </v-btn>
      </template>
    </v-snackbar>

    <!-- Footer with Language Selector -->
    <TheFooter />
  </v-app>
</template>

<script setup lang="ts">
import { ref, provide, onMounted } from 'vue'
import { useGettext } from 'vue3-gettext'
import OpenLogbook from './components/OpenLogbook.vue'
import TheWelcome from './components/TheWelcome.vue'
import UsbImportView from './views/UsbImportView.vue'
import SerialImportView from './views/SerialImportView.vue'
import DiskImportView from './views/DiskImportView.vue'
import SupportView from './views/SupportView.vue'
import FlightListDialog from './components/FlightListDialog.vue'
import TheFooter from './components/TheFooter.vue'
import logoUrl from '@/assets/logflygps_30.png'

const { $gettext } = useGettext()

// State
const currentView = ref<'welcome' | 'usb' | 'serial' | 'disk' | 'support'>('welcome')
const hasOpenDatabase = ref(false)
const showFlightList = ref(false)
const currentDbName = ref('')
const currentDbPath = ref('')

// Snackbar
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

// Provide snackbar function to child components
// Update state
const updateAvailable = ref(false)
const updateVersion = ref('')
const updateUrl = ref('')

function showSnackbar(text: string, color: string = 'success') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}
provide('showSnackbar', showSnackbar)

// Provide database path to child components
provide('dbPath', currentDbPath)
provide('updateAvailable', updateAvailable) // Provide for other components if needed

// Navigation
function navigateTo(view: 'welcome' | 'usb' | 'serial' | 'disk' | 'support') {
  currentView.value = view
}

function openUpdateUrl() {
  if (updateUrl.value) {
    window.open(updateUrl.value, '_blank')
    updateAvailable.value = false
  }
}

// Database opened
function onDbOpened(dbName?: string, dbPath?: string) {
  hasOpenDatabase.value = true
  if (dbName) {
    currentDbName.value = dbName
    showSnackbar(`${$gettext('Logbook')} ${dbName} ${$gettext('opened')}`, 'success')
  }
  if (dbPath) {
    currentDbPath.value = dbPath
  }
  currentView.value = 'welcome'
}

// Flights imported
function onFlightsImported(count: number) {
  showSnackbar(`${count} ${$gettext('tracks imported')}`, 'success')
}

// Initialize
onMounted(async () => {
  console.log('[App] Mounted')

  // Check if we have a stored database path that can be reopened
  try {
    const lastDb = await window.electronAPI.storeGet('lastDbPath')
    const lastName = await window.electronAPI.storeGet('lastDbName')
    if (lastDb) {
      console.log('[App] Last database path:', lastDb)
      currentDbPath.value = lastDb
      if (lastName) {
        currentDbName.value = lastName
      }
      // The database reopen logic will be handled by OpenLogbook component
    }
  } catch (e) {
    console.log('[App] No stored database path')
  }
  // Check for updates
  checkUpdate()
})

// Check for updates
async function checkUpdate() {
  const specOS = await window.electronAPI.invoke({ invoketype: 'get-os-spec' })
  // Current app version
  const currentVersion = '1.0.0' // TODO: Get from package.json or exposed by main.ts

  console.log(`[App] Checking for updates (OS: ${specOS}, Current: ${currentVersion})`)

  try {
    const response = await fetch('https://api.github.com/repos/giloutho/logflygps/releases/latest')
    if (response.ok) {
      const data = await response.json()
      const latestVersion = data.tag_name.replace('v', '')

      console.log(`[App] Latest version: ${latestVersion}`)

      if (compareVersions(latestVersion, currentVersion) > 0) {
        updateVersion.value = latestVersion
        updateUrl.value = data.html_url
        updateAvailable.value = true
      }
    }
  } catch (error) {
    console.error('[App] Update check failed:', error)
  }
}

function compareVersions(v1: string, v2: string) {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}
</script>

<style scoped>
.logflygps-appbar {
  background: linear-gradient(135deg, #1976D2 0%, #1565C0 100%) !important;
  color: white !important;
}

.logflygps-appbar .v-btn {
  color: white !important;
}

.logflygps-appbar .v-chip {
  border-color: rgba(255, 255, 255, 0.7) !important;
}
</style>

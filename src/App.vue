<template>
  <v-app>
    <!-- App Bar with navigation -->
    <v-app-bar class="logflygps-appbar" density="comfortable">
      <v-app-bar-title>
        <v-icon start>mdi-airplane</v-icon>
        LogflyGPS
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
function showSnackbar(text: string, color: string = 'success') {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}
provide('showSnackbar', showSnackbar)

// Provide database path to child components
provide('dbPath', currentDbPath)

// Navigation
function navigateTo(view: 'welcome' | 'usb' | 'serial' | 'disk' | 'support') {
  currentView.value = view
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
})
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

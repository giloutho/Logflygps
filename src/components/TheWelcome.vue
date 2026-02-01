<template>
    <div class="welcome-container">
        <div class="welcome-icon">
            <v-icon size="48" color="white">mdi-airplane-takeoff</v-icon>
        </div>

        <h1 class="welcome-title">{{ $gettext('Welcome to LogflyGPS') }}</h1>

        <p class="welcome-subtitle">{{ welcomeMessage }}</p>

        <div class="mt-8">
            <v-row justify="center" class="ga-4">
                <v-col cols="auto">
                    <v-btn color="primary" size="large" prepend-icon="mdi-usb" @click="$emit('navigate', 'usb')">
                        {{ $gettext('USB GPS') }}
                    </v-btn>
                </v-col>
                <v-col cols="auto">
                    <v-btn color="secondary" size="large" prepend-icon="mdi-serial-port"
                        @click="$emit('navigate', 'serial')">
                        {{ $gettext('Serial GPS') }}
                    </v-btn>
                </v-col>
                <v-col cols="auto">
                    <v-btn color="success" size="large" prepend-icon="mdi-folder-open"
                        @click="$emit('navigate', 'disk')">
                        {{ $gettext('Disk') }}
                    </v-btn>
                </v-col>
            </v-row>
        </div>

        <v-divider class="my-8" style="width: 300px;" />

        <div class="info-section">
            <v-chip color="info" variant="tonal" class="mr-2">
                <v-icon start>mdi-information</v-icon>
                Plugin Logfly.app
            </v-chip>
            <v-chip color="success" variant="tonal">
                <v-icon start>mdi-check-circle</v-icon>
                Full Access API
            </v-chip>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGettext } from 'vue3-gettext'

const { $gettext } = useGettext()

defineEmits<{
    (e: 'navigate', view: 'usb' | 'serial' | 'disk' | 'support'): void
}>()

const welcomeMessage = computed(() => {
    return $gettext('LogflyGPS allows importing GPS tracks into a logbook managed by the Logfly.app web application.')
})
</script>

<style scoped>
.welcome-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 64px);
    padding: 40px 20px;
    text-align: center;
    background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);
}

.welcome-icon {
    width: 100px;
    height: 100px;
    margin-bottom: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1976D2 0%, #1565C0 50%, #0D47A1 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 32px rgba(25, 118, 210, 0.3);
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {

    0%,
    100% {
        box-shadow: 0 8px 32px rgba(25, 118, 210, 0.3);
    }

    50% {
        box-shadow: 0 8px 48px rgba(25, 118, 210, 0.5);
    }
}

.welcome-title {
    font-size: 2rem;
    font-weight: 600;
    color: #1a1a2e;
    margin-bottom: 16px;
}

.welcome-subtitle {
    font-size: 1.15rem;
    color: #666;
    max-width: 600px;
    line-height: 1.7;
    margin-bottom: 8px;
}

.info-section {
    display: flex;
    align-items: center;
    gap: 8px;
}
</style>

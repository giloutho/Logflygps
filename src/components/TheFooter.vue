<template>
    <v-footer app border class="px-4 py-1 footer-container">
        <div class="footer-content">
            <span class="text-caption text-secondary">
                LogflyGPS &copy; {{ new Date().getFullYear() }}
            </span>

            <v-spacer />

            <div class="lang-selector">
                <v-btn v-for="lang in languages" :key="lang.code" icon variant="text" size="small"
                    :class="{ 'lang-btn-active': gettext.current === lang.code }" @click="changeLanguage(lang.code)"
                    :title="lang.name">
                    <v-avatar size="20">
                        <v-img :src="lang.flag" :alt="lang.name" />
                    </v-avatar>
                </v-btn>
            </div>
        </div>
    </v-footer>
</template>

<script setup lang="ts">
import { useGettext } from 'vue3-gettext'

const gettext = useGettext()

const languages = [
    { code: 'en', name: 'English', flag: '/flags/en.svg' },
    { code: 'fr', name: 'Français', flag: '/flags/fr.svg' },
    { code: 'de', name: 'Deutsch', flag: '/flags/de.svg' },
    { code: 'it', name: 'Italiano', flag: '/flags/it.svg' },
]

async function changeLanguage(code: string) {
    gettext.current = code

    // Persist language choice in electron-store
    if (window.electronAPI) {
        try {
            await window.electronAPI.invoke({
                invoketype: 'set-language',
                args: code
            })
        } catch (e) {
            console.error('Failed to save language setting:', e)
        }
    }
}
</script>

<style scoped>
.footer-container {
    background-color: #f8f9fa !important;
    height: 40px;
}

.footer-content {
    display: flex;
    align-items: center;
    width: 100%;
}

.lang-selector {
    display: flex;
    gap: 4px;
}

.lang-btn-active {
    background-color: rgba(25, 118, 210, 0.1);
    border: 1px solid rgba(25, 118, 210, 0.3);
}

.v-btn--icon.v-btn--size-small {
    width: 28px;
    height: 28px;
}
</style>

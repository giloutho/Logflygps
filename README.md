# LogflyGPS

**Plugin desktop pour Logfly.app permettant l'importation de traces GPS**

LogflyGPS est une application Electron qui permet de contourner les limitations des navigateurs web pour l'accès aux périphériques GPS (USB et série).

## Fonctionnalités

- **GPS USB** : Détection automatique des GPS USB (XCTracer, Skytraax, Syride, etc.)
- **GPS Série** : Communication avec les GPS via port série (Flymaster, Flytec) via GPSDump
- **Import Disque** : Scan de dossiers pour fichiers IGC/GPX
- **Support** : Lien vers le support Logfly

## Technologies

- **Electron** : Framework desktop
- **Vite** : Build tool
- **Vue 3** : Framework UI
- **Vuetify 3** : Composants Material Design
- **vue3-gettext** : Internationalisation (fr/en)
- **TypeScript** : Typage statique

## Installation

```bash
# Installer les dépendances
npm install

# Copier les binaires GPSDump
# Les fichiers GPSDump sont dans le dossier bin_ext/

# Lancer en mode développement
npm run dev

# Construire l'application
npm run build
```

## Structure du projet

```
logflygps/
├── electron/
│   ├── main.ts          # Main process Electron
│   ├── preload.ts       # Bridge avec renderer
│   └── ipc/             # Handlers IPC
│       ├── gps-usb.ts
│       ├── ports-list.ts
│       ├── gpsdump-list.ts
│       ├── gpsdump-flight.ts
│       ├── disk-import.ts
│       ├── dialog-handlers.ts
│       └── db-handlers.ts
├── src/
│   ├── main.ts          # Entry point Vue
│   ├── App.vue          # Composant racine
│   ├── components/
│   │   ├── OpenLogbook.vue
│   │   ├── TheWelcome.vue
│   │   └── FlightTable.vue
│   ├── views/
│   │   ├── UsbImportView.vue
│   │   ├── SerialImportView.vue
│   │   ├── DiskImportView.vue
│   │   └── SupportView.vue
│   ├── assets/
│   │   └── main.css
│   └── language/
│       └── translations.json
├── bin_ext/             # Binaires GPSDump
│   ├── GpsDump542.exe   (Windows)
│   ├── gpsdumpMac64_14  (macOS)
│   └── gpsdumpLin64_28  (Linux)
└── public/
    └── logfly-icon.svg
```

## Compatibilité

Ce plugin est conçu pour fonctionner avec les carnets de vol créés par [Logfly.app](https://logfly.app).

## Licence

GPL-3.0

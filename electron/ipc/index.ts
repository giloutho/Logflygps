/**
 * IPC Handlers Index
 * Loads all IPC handlers for the main process
 */

// Import all IPC handlers
import './gps-usb'
import './ports-list'
import './gpsdump-list'
import './gpsdump-flight'
import './disk-import'
import './dialog-handlers'
import './db-handlers'
import './flight-check'
import './flight-add'

console.log('[IPC] All handlers loaded')

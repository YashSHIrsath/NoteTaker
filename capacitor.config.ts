import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.yashshirsath.mynotes',
  appName: 'MyNotes',
  // The app ships the built web assets inside the APK, so it needs no server of its own — it
  // talks straight to Supabase like the web build does.
  webDir: 'dist',
  android: {
    // Debug builds are what get sideloaded during development; keep them inspectable.
    webContentsDebuggingEnabled: true,
  },
}

export default config

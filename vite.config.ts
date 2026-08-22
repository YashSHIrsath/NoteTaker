import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    // Bind to all interfaces, not just localhost, so a phone on the same Wi-Fi can reach it.
    host: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    // `--mode native` is the Capacitor build. A service worker inside a WebView caches the shell
    // and then competes with app updates — the app's assets are already local, so it has nothing
    // to add there and plenty to break. The web build keeps it.
    ...(mode === 'native'
      ? []
      : [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MyNotes',
        short_name: 'MyNotes',
        description: 'Notes, tasks, and folders that sync across your devices.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#4f46e5',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The Supabase-backed data itself is never cached here (only same-origin build
        // output) — this just keeps the app shell installable and fast, not offline-writable.
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The app's own vendor bundle (BlockNote/Mantine/xlsx/etc.) is a few MB unsplit —
        // above Workbox's 2 MiB default. Raised rather than excluded so the app shell still
        // precaches as one piece; splitting that bundle is a separate, unrelated concern.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
        ]),
  ],
}))

/**
 * Whether this bundle is the one inside the Android app.
 *
 * Fixed at build time by `vite build --mode native` (see `build:native`), which is the right
 * granularity: the web build and the APK are separate artifacts with genuinely different surfaces.
 * `Capacitor.isNativePlatform()` answers a runtime question and can't remove a route.
 */
export const IS_NATIVE = import.meta.env.MODE === 'native'

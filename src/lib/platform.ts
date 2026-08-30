/**
 * Whether this bundle is the one inside the Android app.
 *
 * Fixed at build time by `vite build --mode native` (see `build:native`), which is the right
 * granularity: the web build and the APK are separate artifacts with genuinely different surfaces.
 * `Capacitor.isNativePlatform()` answers a runtime question and can't remove a route.
 */
export const IS_NATIVE = import.meta.env.MODE === 'native'

/**
 * Whether this page is running inside the native shell *right now*.
 *
 * `IS_NATIVE` answers "which artifact is this", which is the right question for removing a route
 * at build time and the wrong one for "can this WebView save a file" — that stays true of the APK
 * however it was built, and an APK packaged from a plain `npm run build` would answer no. Capacitor
 * puts this global on the page itself, so the question can be asked without importing the runtime.
 */
export function isNativeRuntime(): boolean {
  if (IS_NATIVE) {
    return true
  }
  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return capacitor?.isNativePlatform?.() === true
}

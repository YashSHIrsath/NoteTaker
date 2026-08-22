/**
 * Writes the Android launcher icon and splash from our own logo, into the native project that
 * `npx cap add android` just generated.
 *
 * Why a script and not committed PNGs: android/ is generated in CI and deliberately not in the
 * repo, so there is nowhere to commit res/ files to. Why not @capacitor/assets: it pulls a second,
 * older copy of sharp whose install scripts don't always run in a locked-down npm — this needs
 * nothing but the sharp we already depend on.
 *
 * The logo geometry is the same seven bars as public/favicon.svg. It lives here as data rather
 * than being read from the SVG so that the mark can be re-centred and re-scaled per target: an
 * adaptive foreground has to sit inside the middle 66% of its canvas (Android crops the rest to
 * whatever mask the launcher uses), which is much tighter than a favicon.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const RES = 'android/app/src/main/res'
const BRAND = '#8b85f0'
const INK = '#1a1a18'

/** The mark, in its own coordinate space: x 54..266, y 28..152. */
const BARS = [
  [54, 28, 28, 47],
  [54, 84, 28, 68],
  [93, 64, 28, 88],
  [132, 100, 28, 52],
  [171, 64, 28, 51],
  [171, 122, 28, 30],
  [210, 28, 28, 124],
]
const LOGO_W = 212
const LOGO_CX = 160
const LOGO_CY = 90

/** `frac` is the share of the canvas width the mark spans; it is always centred. */
function logoSvg({ size, frac, backdrop }) {
  const scale = (size * frac) / LOGO_W
  const tx = size / 2 - scale * LOGO_CX
  const ty = size / 2 - scale * LOGO_CY
  const bars = BARS.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${backdrop ?? ''}
<g fill="${BRAND}" transform="translate(${tx} ${ty}) scale(${scale})">${bars}</g>
</svg>`
}

const roundedBackdrop = (size) =>
  `<rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="${INK}"/>`
const circleBackdrop = (size) =>
  `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${INK}"/>`

async function png(path, svg) {
  await mkdir(join(RES, path, '..'), { recursive: true })
  await sharp(Buffer.from(svg)).png().toFile(join(RES, path))
}

// Legacy icons (pre-Android 8 and anywhere the adaptive icon isn't used) carry their own shape.
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
// Adaptive foregrounds are 108dp canvases; only the middle 72dp is guaranteed visible.
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }

for (const [density, size] of Object.entries(LEGACY)) {
  await png(`mipmap-${density}/ic_launcher.png`, logoSvg({ size, frac: 0.6, backdrop: roundedBackdrop(size) }))
  await png(
    `mipmap-${density}/ic_launcher_round.png`,
    logoSvg({ size, frac: 0.56, backdrop: circleBackdrop(size) }),
  )
}

for (const [density, size] of Object.entries(ADAPTIVE)) {
  // Transparent: the background layer below supplies the colour, and the launcher may animate
  // the two layers independently.
  await png(`mipmap-${density}/ic_launcher_foreground.png`, logoSvg({ size, frac: 0.42 }))
}

// Our own adaptive descriptors, pointing at the two layers above. Written rather than edited so
// they can't inherit a reference to whatever art the Capacitor template shipped.
const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
await mkdir(join(RES, 'mipmap-anydpi-v26'), { recursive: true })
await writeFile(join(RES, 'mipmap-anydpi-v26/ic_launcher.xml'), ADAPTIVE_XML)
await writeFile(join(RES, 'mipmap-anydpi-v26/ic_launcher_round.xml'), ADAPTIVE_XML)

await mkdir(join(RES, 'drawable'), { recursive: true })
await writeFile(
  join(RES, 'drawable/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="${INK}"/>
</shape>
`,
)

// The template's own vector foreground would otherwise still be a valid @drawable/… candidate
// and, being a drawable, would win over our mipmap of the same name on some builds.
for (const stale of ['drawable-v24/ic_launcher_foreground.xml', 'drawable/ic_launcher_foreground.xml']) {
  await rm(join(RES, stale), { force: true })
}

// Splash: only worth writing if the template actually references one.
for (const splash of ['drawable/splash.png', 'drawable-port-xxxhdpi/splash.png', 'drawable-land-xxxhdpi/splash.png']) {
  if (existsSync(join(RES, splash))) {
    const size = 2732
    await png(splash, logoSvg({ size, frac: 0.26, backdrop: `<rect width="${size}" height="${size}" fill="${INK}"/>` }))
  }
}

console.log('Android launcher icons written from the project logo.')

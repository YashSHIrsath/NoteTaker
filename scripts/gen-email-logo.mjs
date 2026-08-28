// The wordmark's companion in the reminder emails.
//
// Separate from the app icons for two reasons. It is a flat mark on transparency rather than the
// dark rounded tile those are — an email header is white, and a tile there reads as an app badge
// rather than as a logo. And it has to be a PNG: Gmail does not render SVG in an <img> at all, so
// project-logo.svg cannot be linked directly however convenient that would be.
//
// The source uses `currentColor` so the app can recolour it per theme. An email has no cascade to
// inherit from, so the brand indigo is substituted in before rasterising.
//
//     node scripts/gen-email-logo.mjs
//
// The output is committed and served from public/, and the email links it by absolute URL — which
// means a change here only reaches inboxes after the site is deployed.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const ACCENT = '#4f46e5'

/** Displayed at 29x20 in the header; rendered at 3x so it stays sharp on a retina screen. */
const WIDTH = 87
const HEIGHT = 60

const source = readFileSync('public/project-logo.svg', 'utf8').replaceAll('currentColor', ACCENT)

await sharp(Buffer.from(source))
  .resize(WIDTH, HEIGHT, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile('public/email-logo.png')


console.log(`public/email-logo.png — ${WIDTH}x${HEIGHT}, ${ACCENT} on transparency`)

import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const base = readFileSync('public/favicon.svg')
const maskable = readFileSync('public/icons/maskable-512.svg')

await sharp(base).resize(192, 192).png().toFile('public/icons/icon-192.png')
await sharp(base).resize(512, 512).png().toFile('public/icons/icon-512.png')
await sharp(base).resize(180, 180).flatten({ background: '#1a1a18' }).png().toFile('public/icons/apple-touch-icon.png')
await sharp(maskable).resize(512, 512).png().toFile('public/icons/maskable-512.png')

console.log('done')

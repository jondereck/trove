import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const SRC = join(assets, 'icon-approved.png')

async function flattenCorners(inputPath) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const sample = (10 * w + Math.floor(w / 2)) * 4
  const OR = data[sample], OG = data[sample + 1], OB = data[sample + 2]

  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    if (data[o] < 40 && data[o + 1] < 40 && data[o + 2] < 40) {
      data[o] = OR
      data[o + 1] = OG
      data[o + 2] = OB
      data[o + 3] = 255
    }
  }

  const flat = await sharp(Buffer.from(data), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
  return { flat, OR, OG, OB, w, h, data }
}

async function main() {
  const { flat, OR, OG, OB, w, h, data } = await flattenCorners(SRC)

  await sharp(flat).resize(1024, 1024).png().toFile(join(assets, 'icon.png'))
  await sharp(flat).resize(1024, 1024).png().toFile(join(assets, 'splash-icon.png'))
  await sharp(flat).resize(192, 192).png().toFile(join(assets, 'favicon.png'))
  await sharp(flat).resize(1024, 1024).png().toFile(join(assets, 'android-icon-foreground.png'))
  await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: OR, g: OG, b: OB } },
  }).png().toFile(join(assets, 'android-icon-background.png'))

  const mono = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
    const v = lum > 180 ? 0 : 255
    mono[o] = mono[o + 1] = mono[o + 2] = v
    mono[o + 3] = 255
  }
  await sharp(Buffer.from(mono), { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(join(assets, 'android-icon-monochrome.png'))

  console.log(`Done — orange #${OR.toString(16)}${OG.toString(16)}${OB.toString(16)}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

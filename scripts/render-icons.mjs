import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const SIZE = 1024

function renderSvg(svgPath, outPath, size = SIZE) {
  const svg = readFileSync(svgPath, 'utf8')
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'transparent',
  }).render().asPng()
  writeFileSync(outPath, png)
  console.log(`Wrote ${outPath}`)
}

function solidBackground(outPath, color, size = SIZE) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${color}"/></svg>`
  writeFileSync(outPath, new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng())
  console.log(`Wrote ${outPath}`)
}

renderSvg(join(assets, 'icon-source.svg'), join(assets, 'icon.png'))
renderSvg(join(assets, 'icon-source.svg'), join(assets, 'splash-icon.png'))
renderSvg(join(assets, 'icon-foreground.svg'), join(assets, 'android-icon-foreground.png'))
renderSvg(join(assets, 'icon-monochrome.svg'), join(assets, 'android-icon-monochrome.png'))
solidBackground(join(assets, 'android-icon-background.png'), '#c0613c')
renderSvg(join(assets, 'icon-source.svg'), join(assets, 'favicon.png'), 192)

console.log('Done.')

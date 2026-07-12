import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

for (const v of ['v1', 'v2', 'v3']) {
  const svg = readFileSync(join(assets, `icon-t-chest-${v}.svg`), 'utf8')
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } }).render().asPng()
  writeFileSync(join(assets, `icon-t-chest-${v}-preview.png`), png)
  console.log(`icon-t-chest-${v}-preview.png`)
}

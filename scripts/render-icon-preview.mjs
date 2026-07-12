#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const assets = join(__dirname, '..', 'assets')
const SIZE = 1024

function renderSvg(svgPath, outPath, size = SIZE) {
  const svg = readFileSync(svgPath, 'utf8')
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'transparent',
  })
  writeFileSync(outPath, resvg.render().asPng())
  console.log(`Wrote ${outPath}`)
}

renderSvg(join(assets, 'icon-source.svg'), join(assets, 'icon-preview.png'))
renderSvg(join(assets, 'icon-foreground.svg'), join(assets, 'icon-foreground-preview.png'))
renderSvg(join(assets, 'icon-monochrome.svg'), join(assets, 'icon-monochrome-preview.png'))

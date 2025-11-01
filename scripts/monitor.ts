import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import fse from 'fs-extra'
import chokidar from 'chokidar'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const r = rootPath => resolve(__dirname, '..', rootPath)
const __DEV__ = process.env.CRX_ENV === 'development'
const outputDir = __DEV__ ? 'local' : 'extension'

const origin = {
  manifest: r('src/manifest.json'),
  assets: r('src/assets'),
}

const target = {
  manifest: r(`${outputDir}/manifest.json`),
  assets: r(`${outputDir}/assets`),
}

function copyManifest() {
  fse.copy(origin.manifest, target.manifest)
}
async function copyIndexHtml() {
  for (const view of ['popup']) {
    await fse.ensureDir(r(`${outputDir}/${view}`))
    let data = fse.readFileSync(r(`src/${view}/index.html`), 'utf-8')
    data = data.replace(/\.ts/g, '.js')
    await fse.writeFile(r(`${outputDir}/${view}/index.html`), data, 'utf-8')
  }
  console.log('复制html文件成功')
}
function copyAssets() {
  fse.copy(origin.assets, target.assets)
}

copyManifest()
copyIndexHtml()
copyAssets()

if (__DEV__) {
  chokidar.watch([origin.manifest]).on('change', () => {
    copyManifest()
  })
  chokidar.watch(r('src/**/*.html')).on('change', () => {
    copyIndexHtml()
  })
}

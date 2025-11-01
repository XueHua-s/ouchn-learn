import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import type { Plugin, ResolvedConfig } from 'vite'
import { WebSocketServer } from 'ws'
import { __DEV__, bgUpdatePort } from '../../const'

function compileInjectCode() {
  const tsCode = readFileSync(resolve(__dirname, 'injectCode.ts'), 'utf-8')
  const compilerOptions = {
    target: ts.ScriptTarget.ES2015,
    removeComments: true,
  }
  const result = ts.transpileModule(tsCode, { compilerOptions })
  return result.outputText
}

function hotReloadBackground(): Plugin {
  let wss: any = null
  // 初始化websocket链接用于监听
  const initSocket = () => {
    wss = new WebSocketServer({ port: bgUpdatePort })
    wss.on('connection', (ws) => {
      // 启动心跳监听，便于重连
      ws.send('heartbeatMonitor')
      const interval = setInterval(() => {
        ws.send('heartbeat')
      }, 3000)

      ws.on('message', (message) => {
        const info = `${message}`
        // 监听contentScript代码变化，复用一个ws连接
        if (info === 'UPDATE_CONTENT_SCRIPT') {
          wss.clients.forEach((ws) => {
            ws.send('UPDATE_CONTENT_SCRIPT')
          })
        }
      })

      ws.on('close', () => {
        clearInterval(interval)
      })
    })
  }

  return {
    name: 'hot-reload-background',
    enforce: 'pre',
    configResolved(_config: ResolvedConfig) {
      // 启动 websocket服务
      if (__DEV__) {
        initSocket()
      }
    },
    transform(code, id) {
      if (id.indexOf('background/index.ts') > 0 && __DEV__) {
        let injectDevCode = `\nconst UP_PORT = ${bgUpdatePort}\n`
        injectDevCode += compileInjectCode()
        return code + injectDevCode
      }
    },
    writeBundle() {
      // 通过socket触发reload
      if (wss !== null) {
        wss.clients.forEach((ws) => {
          ws.send('UPDATE_BG')
        })
      }
    },
  }
}

export default hotReloadBackground

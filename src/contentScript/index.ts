import { createApp } from 'vue'
import App from './App.vue'
import 'uno.css'
;

(() => {
  const rootIdName = 'vite_crx_content_script'
  const beforeRoot = document.querySelector(`#${rootIdName}`)
  if (beforeRoot && __DEV__) {
    document.body.removeChild(beforeRoot)
  }
  const container = document.createElement('div')
  container.id = rootIdName
  const root = document.createElement('div')
  const styleEl = document.createElement('link')
  styleEl.setAttribute('rel', 'stylesheet')
  styleEl.setAttribute('href', chrome.runtime.getURL('contentScript/style.css'))

  // 使用shadow-dom可以隔离样式
  const shadowDOM
    = container.attachShadow?.({ mode: __DEV__ ? 'open' : 'closed' }) || container
  shadowDOM.appendChild(styleEl)
  shadowDOM.appendChild(root)

  // 但是naive-ui的样式因为注入在外层，用shadow-dom就会导致没办法用naive-ui的样式
  // 如果不怕样式影响外层页面，可以直接不用shadow-dom，注释调上面几行，用下面几行
  // document.body.appendChild(styleEl)
  // document.body.appendChild(root)

  document.body.appendChild(container)

  const app = createApp(App)
  app.mount(root)
})()

<script setup lang="ts">
import { getCache, setCache } from './utils'

const dialog = useDialog()
async function handleOpen() {
  await setCache('key2', 'test')
  const data1 = await getCache('key1')
  const data2 = await getCache('key2')
  dialog.warning({
    title: '这是插件弹窗',
    content: `Background setCache - ${data1};Content setCache - ${data2}`,
  })
}
</script>

<template>
  <div>
    <n-button type="primary" @click="handleOpen">
      Open
    </n-button>
  </div>
</template>

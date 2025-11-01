<script setup lang="ts">
import {
  NConfigProvider,
  NDialogProvider,
  NLoadingBarProvider,
  NMessageProvider,
  NNotificationProvider,
  zhCN,
} from 'naive-ui'
import Content from './Content.vue'
</script>

<template>
  <div data-root="true" class="root">
    <NConfigProvider :locale="zhCN">
      <NLoadingBarProvider>
        <NDialogProvider>
          <NNotificationProvider>
            <NMessageProvider>
              <content />
            </NMessageProvider>
          </NNotificationProvider>
        </NDialogProvider>
      </NLoadingBarProvider>
    </NConfigProvider>
  </div>
</template>

<style scoped>
.root {
  position: fixed;
  top: 68px;
  right: 36px;
  z-index: 1000;
}
</style>

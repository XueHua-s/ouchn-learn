<script setup lang="ts">
const counter = ref<number>(1)
function handleClick() {
  counter.value++
}
</script>

<template>
  <div data-root="true" class="min-h-100px min-w-100px flex-col-center">
    <span><i-logos:vitejs /><i-svg-spinners:3-dots-scale-middle
      class="ml-2"
    /><i-logos:vue class="ml-2" /></span>
    <n-button @click="handleClick">
      {{ counter
      }}<template #icon>
        <n-icon>
          <i-line-md:github-twotone />
        </n-icon>
      </template>
    </n-button>
  </div>
</template>

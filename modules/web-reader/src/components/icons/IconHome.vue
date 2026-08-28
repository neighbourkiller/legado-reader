<template>
  <svg
    viewBox="0 0 512 512"
    fill="currentColor"
    aria-hidden="true"
    :width="size"
    :height="size"
    class="icon-home"
  >
    <path
      d="M 256.0 52.0 C 246.0 52.0 238.0 56.5 233.0 60.5 L 3.2 250.5 A 13.5 13.5 0 0 0 0.5 260.0 L 21.8 287.6 A 13.5 13.5 0 0 0 32.5 291.5 L 256.0 107.0 L 479.5 291.5 A 13.5 13.5 0 0 0 490.2 287.6 L 511.5 260.0 A 13.5 13.5 0 0 0 508.8 250.5 L 439.0 192.5 L 439.0 63.0 A 10 10 0 0 0 429.0 53.0 L 367.5 53.0 A 10 10 0 0 0 357.5 63.0 L 357.5 125.0 L 279.0 60.5 C 274.0 56.5 266.0 52.0 256.0 52.0 Z M 256.0 134.5 L 73.1 285.5 L 73.1 439.5 A 20.0 20.0 0 0 0 93.1 459.5 L 215.3 459.5 L 215.3 338.0 L 296.7 338.0 L 296.7 459.5 L 418.9 459.5 A 20.0 20.0 0 0 0 438.9 439.5 L 438.9 285.5 Z"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: string | number
  }>(),
  {
    size: '1em'
  }
)
</script>

<style scoped>
.icon-home {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>

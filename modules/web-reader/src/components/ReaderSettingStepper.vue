<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  label: string
  modelValue: number
  min: number
  max: number
  step?: number
  unit?: string
  night?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  step: 1,
  unit: '',
  night: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const canDecrease = computed(() => props.modelValue > props.min)
const canIncrease = computed(() => props.modelValue < props.max)

const displayValue = computed(() => `${props.modelValue}${props.unit}`)

const changeValue = (direction: -1 | 1) => {
  const nextValue = props.modelValue + props.step * direction
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, nextValue)))
}
</script>

<template>
  <li class="setting-stepper" :class="{ night, day: !night }">
    <span class="setting-stepper__label">{{ label }}</span>
    <div class="setting-stepper__control">
      <button
        type="button"
        class="setting-stepper__button"
        :disabled="!canDecrease"
        :aria-label="`减小${label}`"
        @click="changeValue(-1)"
      >
        −
      </button>
      <span class="setting-stepper__divider" aria-hidden="true"></span>
      <output class="setting-stepper__value" :aria-label="`${label} ${displayValue}`">
        {{ displayValue }}
      </output>
      <span class="setting-stepper__divider" aria-hidden="true"></span>
      <button
        type="button"
        class="setting-stepper__button"
        :disabled="!canIncrease"
        :aria-label="`增大${label}`"
        @click="changeValue(1)"
      >
        +
      </button>
    </div>
  </li>
</template>

<style scoped>
.setting-stepper {
  display: flex;
  align-items: center;
  margin-top: 22px;
  list-style: none outside none;
}

.setting-stepper__label {
  display: inline-block;
  min-width: 58px;
  margin-right: 16px;
  color: #666;
  font: 13px / 16px PingFangSC-Regular, '-apple-system', Simsun, sans-serif;
}

.setting-stepper__control {
  display: inline-flex;
  align-items: center;
  width: 240px;
  height: 32px;
  overflow: hidden;
  border: 1px solid #e5e5e5;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.6);
}

.setting-stepper__button,
.setting-stepper__value {
  display: inline-flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
}

.setting-stepper__button {
  min-width: 44px;
  font: 20px / 1 ui-monospace, SFMono-Regular, Consolas, monospace;
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.setting-stepper__button:hover:not(:disabled) {
  color: #ed4259;
  background: rgba(237, 66, 89, 0.06);
}

.setting-stepper__button:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid #ed4259;
  outline-offset: -2px;
}

.setting-stepper__button:disabled {
  cursor: not-allowed;
  opacity: 0.28;
}

.setting-stepper__value {
  color: #888;
  font: 500 13px / 1 FZZCYSK, sans-serif;
  white-space: nowrap;
}

.setting-stepper__divider {
  width: 1px;
  height: 16px;
  background: #e5e5e5;
}

.setting-stepper.night .setting-stepper__label {
  color: #8f8f92;
}

.setting-stepper.night .setting-stepper__control {
  border-color: #555;
  background: rgba(45, 45, 45, 0.6);
  color: #ddd;
}

.setting-stepper.night .setting-stepper__divider {
  background: #555;
}

.setting-stepper.night .setting-stepper__value {
  color: #aaa;
}

@media screen and (max-width: 500px) {
  .setting-stepper__label {
    min-width: 48px;
    font-size: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .setting-stepper__button {
    transition: none;
  }
}
</style>

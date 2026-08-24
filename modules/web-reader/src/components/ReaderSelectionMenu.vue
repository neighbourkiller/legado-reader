<template>
  <div
    class="selection-menu"
    :class="`selection-menu--${placement}`"
    :style="{ left: `${left}px`, top: `${top}px` }"
    role="toolbar"
    aria-label="选中文本操作"
    @pointerdown.prevent
    @click.stop
  >
    <button type="button" :disabled="anchoredActionsDisabled" @click="emit('replace')">替换</button>
    <button type="button" @click="emit('copy')">复制</button>
    <button type="button" :disabled="anchoredActionsDisabled" @click="emit('bookmark')">书签</button>
    <button type="button" :disabled="anchoredActionsDisabled" @click="showStyles = !showStyles">高亮</button>
    <button type="button" @click="emit('browser')">浏览器</button>

    <div v-if="showStyles" class="style-panel" aria-label="高亮样式">
      <button
        v-for="preset in presets"
        :key="`${preset.kind}:${preset.color}`"
        type="button"
        class="style-option"
        :class="[`style-option--${preset.kind}`, { selected: isSelected(preset.style) }]"
        :style="stylePreview(preset)"
        :title="preset.label"
        @click="selectStyle(preset.style)"
      ></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { CSSProperties } from 'vue'
import type { HighlightStyleRecord } from '@/storage/db'

const props = defineProps<{
  left: number
  top: number
  anchoredActionsDisabled: boolean
  placement: 'above' | 'below'
  selectedStyle: HighlightStyleRecord
}>()

const emit = defineEmits<{
  replace: []
  copy: []
  bookmark: []
  highlight: [style: HighlightStyleRecord]
  browser: []
}>()

const showStyles = ref(false)
const presets: Array<{ label: string; kind: HighlightStyleRecord['kind']; color: string; style: HighlightStyleRecord }> = [
  { label: '黄色高亮', kind: 'background', color: '#fff176', style: { kind: 'background', color: 'rgba(255, 241, 118, 0.5)' } },
  { label: '蓝色高亮', kind: 'background', color: '#4fc3f7', style: { kind: 'background', color: 'rgba(79, 195, 247, 0.5)' } },
  { label: '绿色高亮', kind: 'background', color: '#69f0ae', style: { kind: 'background', color: 'rgba(105, 240, 174, 0.5)' } },
  { label: '粉色高亮', kind: 'background', color: '#f48fb1', style: { kind: 'background', color: 'rgba(244, 143, 177, 0.5)' } },
  { label: '红色波浪线', kind: 'underline', color: '#e53935', style: { kind: 'underline', color: '#e53935', lineStyle: 'wavy' } },
]

const stylePreview = (preset: (typeof presets)[number]): CSSProperties => preset.kind === 'background'
  ? { backgroundColor: preset.color }
  : { borderBottom: `3px solid ${preset.color}` }

const selectStyle = (style: HighlightStyleRecord) => {
  showStyles.value = false
  emit('highlight', style)
}

const isSelected = (style: HighlightStyleRecord) =>
  props.selectedStyle.kind === style.kind && props.selectedStyle.color === style.color
</script>

<style scoped>
.selection-menu {
  position: fixed;
  z-index: 3100;
  display: flex;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: #303033;
  box-shadow: 0 5px 18px rgba(0, 0, 0, 0.32);
  user-select: none;
}

.selection-menu--above {
  transform: translate(-50%, -100%);
}

.selection-menu--below {
  transform: translate(-50%, 0);
}

.selection-menu > button {
  padding: 8px 10px;
  border: 0;
  border-radius: 4px;
  color: #f5f5f5;
  background: transparent;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
}

.selection-menu > button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.selection-menu > button:disabled {
  color: #858585;
  cursor: not-allowed;
}

.style-panel {
  position: absolute;
  top: calc(100% + 7px);
  left: 50%;
  display: flex;
  gap: 9px;
  padding: 10px;
  border-radius: 7px;
  background: #303033;
  box-shadow: 0 5px 18px rgba(0, 0, 0, 0.32);
  transform: translateX(-50%);
}

.style-option {
  width: 25px;
  height: 25px;
  padding: 0;
  border: 2px solid rgba(255, 255, 255, 0.78);
  border-radius: 50%;
  cursor: pointer;
}

.style-option.selected {
  box-shadow: 0 0 0 3px #409eff;
}

.style-option--underline {
  border: 0;
  border-radius: 0;
  background: transparent;
}
</style>

<template>
  <el-dialog
    :model-value="modelValue"
    title="编辑标注"
    width="min(520px, 92vw)"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p class="excerpt">{{ highlight?.text }}</p>
    <div class="palette" aria-label="高亮样式">
      <button
        v-for="preset in presets"
        :key="`${preset.kind}:${preset.color}`"
        type="button"
        :class="{ selected: isSelected(preset) }"
        :style="preview(preset)"
        :title="preset.label"
        @click="selectStyle(preset)"
      />
    </div>
    <el-input v-model="note" type="textarea" :rows="3" placeholder="备注（可选）" />
    <template #footer>
      <el-button type="danger" plain @click="emit('delete')">删除标注</el-button>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import type { HighlightRecord, HighlightStyleRecord } from '@/storage/db'

const props = defineProps<{ modelValue: boolean; highlight: HighlightRecord | null }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [style: HighlightStyleRecord, note: string]
  delete: []
}>()

const note = ref('')
const style = reactive<HighlightStyleRecord>({ kind: 'background', color: 'rgba(255, 241, 118, 0.5)' })
const presets = [
  { label: '黄色高亮', kind: 'background' as const, color: 'rgba(255, 241, 118, 0.5)' },
  { label: '蓝色高亮', kind: 'background' as const, color: 'rgba(79, 195, 247, 0.5)' },
  { label: '绿色高亮', kind: 'background' as const, color: 'rgba(105, 240, 174, 0.5)' },
  { label: '粉色高亮', kind: 'background' as const, color: 'rgba(244, 143, 177, 0.5)' },
  { label: '红色波浪线', kind: 'underline' as const, color: '#e53935', lineStyle: 'wavy' as const },
]

watch(() => [props.modelValue, props.highlight] as const, () => {
  if (!props.modelValue || !props.highlight) return
  note.value = props.highlight.note || ''
  Object.assign(style, props.highlight.style)
}, { immediate: true })

const isSelected = (preset: (typeof presets)[number]) =>
  style.kind === preset.kind && style.color === preset.color
const preview = (preset: (typeof presets)[number]): CSSProperties => preset.kind === 'background'
  ? { backgroundColor: preset.color }
  : { borderBottom: `3px solid ${preset.color}` }
const selectStyle = (preset: (typeof presets)[number]) => {
  Object.assign(style, {
    kind: preset.kind,
    color: preset.color,
    lineStyle: preset.lineStyle,
  })
}
const save = () => emit('save', { ...style }, note.value.trim())
</script>

<style scoped>
.excerpt { margin: 0 0 16px; color: var(--el-text-color-regular); }
.palette { display: flex; gap: 12px; margin-bottom: 18px; }
.palette button { width: 30px; height: 30px; border: 2px solid transparent; border-radius: 50%; cursor: pointer; }
.palette button.selected { border-color: var(--el-color-primary); box-shadow: 0 0 0 2px var(--el-color-primary-light-7); }
</style>

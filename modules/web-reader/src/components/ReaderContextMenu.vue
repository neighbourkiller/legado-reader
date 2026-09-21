<script setup lang="ts">
import { computed, nextTick, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { List, CollectionTag, FullScreen, HomeFilled } from '@element-plus/icons-vue'
import IconPalette from './icons/IconPalette.vue'
import type { ReaderContextMenuAction, ReaderContextMenuPosition } from '@/composables/useReaderContextMenu'

const props = defineProps<{
  position: ReaderContextMenuPosition
  background: string
  color: string
  isNight: boolean
  isFullscreen: boolean
}>()
const emit = defineEmits<{
  action: [action: ReaderContextMenuAction]
  close: []
}>()
const menu = useTemplateRef<HTMLElement>('menu')
const activeIndex = shallowRef(0)
const left = shallowRef(0)
const top = shallowRef(0)
const ready = shallowRef(false)
const items = computed(() => [
  { action: 'catalog' as const, label: '目录', icon: List },
  { action: 'settings' as const, label: '阅读设置', icon: IconPalette },
  { action: 'bookmarks' as const, label: '书签与划线', icon: CollectionTag },
  { action: 'fullscreen' as const, label: props.isFullscreen ? '退出全屏' : '进入全屏', icon: FullScreen },
  { action: 'shelf' as const, label: '返回书架', icon: HomeFilled },
])
const menuStyle = computed(() => ({
  left: `${left.value}px`, top: `${top.value}px`,
  maxWidth: `${Math.max(0, props.position.bounds.right - props.position.bounds.left - 16)}px`,
  maxHeight: `${Math.max(0, props.position.bounds.bottom - props.position.bounds.top - 16)}px`,
  background: props.background, color: props.color,
  visibility: ready.value ? 'visible' as const : 'hidden' as const,
}))
const focusItem = (index: number) => {
  activeIndex.value = index
  menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[index]?.focus({ preventScroll: true })
}
const place = async () => {
  await nextTick()
  if (!menu.value) return
  const rect = menu.value.getBoundingClientRect()
  const { x, y, bounds } = props.position
  left.value = Math.max(bounds.left + 8, Math.min(x + 2, bounds.right - rect.width - 8))
  top.value = Math.max(bounds.top + 8, Math.min(y + 2, bounds.bottom - rect.height - 8))
  ready.value = true
  await nextTick()
  focusItem(0)
}
onMounted(place)
watch(() => props.position, place)

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'F11') return
  event.stopPropagation()
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); focusItem((activeIndex.value + 1) % items.value.length); break
    case 'ArrowUp': event.preventDefault(); focusItem((activeIndex.value + items.value.length - 1) % items.value.length); break
    case 'Home': event.preventDefault(); focusItem(0); break
    case 'End': event.preventDefault(); focusItem(items.value.length - 1); break
    case 'ArrowLeft':
    case 'ArrowRight': event.preventDefault(); break
    case 'Enter':
    case ' ':
      event.preventDefault()
      if (!event.repeat) emit('action', items.value[activeIndex.value]!.action)
      break
    case 'Escape': event.preventDefault(); emit('close'); break
    // 同步恢复原焦点后，让浏览器继续原页面的 Tab 顺序。
    case 'Tab': emit('close'); break
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="menu"
      class="reader-context-menu"
      :class="{ 'is-night': isNight }"
      :style="menuStyle"
      data-reader-context-menu
      role="menu"
      aria-label="阅读快捷菜单"
      @keydown="onKeyDown"
      @keyup.stop
      @click.stop
      @pointerdown.stop
      @contextmenu.prevent.stop
    >
      <button
        v-for="(item, index) in items"
        :key="item.action"
        class="reader-context-menu-item"
        :class="{ 'is-separated': item.action === 'shelf' }"
        type="button"
        role="menuitem"
        :tabindex="activeIndex === index ? 0 : -1"
        @focus="activeIndex = index"
        @click="emit('action', item.action)"
      >
        <component :is="item.icon" class="reader-context-menu-icon" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.reader-context-menu {
  position: fixed;
  z-index: 3200;
  width: 200px;
  box-sizing: border-box;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 5px;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 8px;
  box-shadow: 0 6px 22px rgb(0 0 0 / 18%);
  font-family: var(--legado-font-ui);
  user-select: none;
}
.reader-context-menu.is-night { box-shadow: 0 6px 22px rgb(0 0 0 / 40%); }
.reader-context-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 8px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.reader-context-menu-item:hover,
.reader-context-menu-item:focus-visible { background: color-mix(in srgb, currentColor 10%, transparent); }
.reader-context-menu-item:focus-visible { outline: 2px solid currentColor; outline-offset: -2px; }
.reader-context-menu-item.is-separated {
  margin-top: 5px;
  border-top: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
.reader-context-menu-icon { width: 17px; height: 17px; flex-shrink: 0; }
</style>

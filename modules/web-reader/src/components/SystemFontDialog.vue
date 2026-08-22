<template>
  <el-dialog
    v-model="visible"
    title="选择系统字体"
    width="540px"
    class="system-font-dialog"
    destroy-on-close
    append-to-body
    @open="handleOpen"
  >
    <div class="font-dialog-body" v-loading="isLoading">
      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-input
          v-model="searchQuery"
          placeholder="搜索字体名称..."
          clearable
          :prefix-icon="Search"
        />
      </div>

      <!-- 字体列表容器 -->
      <div class="font-list-scroll">
        <!-- ⭐ 常用 / 当前使用置顶字体 -->
        <div v-if="displayFavorites.length > 0" class="section-container">
          <div class="section-title">
            <span class="star-icon filled">★</span> 常用 / 正在使用字体 (已置顶)
            <span class="count-badge">({{ displayFavorites.length }})</span>
          </div>
          <div class="font-grid">
            <div
              v-for="font in displayFavorites"
              :key="'fav-' + font"
              class="font-item-card"
              :class="{ active: currentFont === font }"
              @click="handleSelect(font)"
            >
              <div class="card-left">
                <button
                  type="button"
                  class="star-btn active"
                  title="常用字体"
                  @click.stop="toggleFavorite(font)"
                >
                  ★
                </button>
                <div class="font-meta">
                  <div class="font-name" :title="font">{{ font }}</div>
                  <div
                    class="font-preview"
                    :style="{ fontFamily: `&quot;${font}&quot;, sans-serif` }"
                  >
                    窗前明月光，疑是地上霜。
                  </div>
                </div>
              </div>
              <div class="card-right">
                <span v-if="currentFont === font" class="using-badge">使用中</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 🔤 所有系统字体 -->
        <div class="section-container">
          <div class="section-title">
            <span class="section-icon">🔤</span>
            所有系统已安装字体
            <span class="count-badge">({{ filteredAllFonts.length }})</span>
          </div>

          <div v-if="filteredAllFonts.length === 0 && !isLoading" class="empty-tip">
            未找到匹配的字体
          </div>

          <div class="font-grid">
            <div
              v-for="font in filteredAllFonts"
              :key="'all-' + font"
              class="font-item-card"
              :class="{ active: currentFont === font }"
              @click="handleSelect(font)"
            >
              <div class="card-left">
                <button
                  type="button"
                  class="star-btn"
                  :class="{ active: isFavorite(font) }"
                  :title="isFavorite(font) ? '取消常用' : '设为常用置顶'"
                  @click.stop="toggleFavorite(font)"
                >
                  {{ isFavorite(font) ? '★' : '☆' }}
                </button>
                <div class="font-meta">
                  <div class="font-name" :title="font">{{ font }}</div>
                  <div
                    class="font-preview"
                    :style="{ fontFamily: `&quot;${font}&quot;, sans-serif` }"
                  >
                    窗前明月光，疑是地上霜。
                  </div>
                </div>
              </div>
              <div class="card-right">
                <span v-if="currentFont === font" class="using-badge">使用中</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useSystemFonts } from '@/composables/useSystemFonts'

const props = defineProps<{
  modelValue: boolean
  currentFont: string
  favoriteFonts: string[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'select', fontName: string): void
  (e: 'updateFavorites', favorites: string[]): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
})

const { systemFonts, isLoading, loadFonts } = useSystemFonts()
const searchQuery = ref('')

const handleOpen = () => {
  searchQuery.value = ''
  loadFonts()
}

// 置顶列表：合并当前使用字体 + 常用收藏列表（去重）
const topFavorites = computed(() => {
  const list: string[] = []
  if (props.currentFont && props.currentFont.trim()) {
    list.push(props.currentFont.trim())
  }
  for (const f of props.favoriteFonts || []) {
    if (f && f.trim() && !list.includes(f.trim())) {
      list.push(f.trim())
    }
  }
  return list
})

const isFavorite = (font: string) => {
  return topFavorites.value.includes(font)
}

const toggleFavorite = (font: string) => {
  const current = [...(props.favoriteFonts || [])]
  const idx = current.indexOf(font)
  if (idx !== -1) {
    current.splice(idx, 1)
  } else {
    current.unshift(font) // 勾选后置顶于常用最上方
  }
  emit('updateFavorites', current)
}

// 过滤后的常用字体
const displayFavorites = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return topFavorites.value
  return topFavorites.value.filter(f => f.toLowerCase().includes(q))
})

// 过滤后的全部字体 (排除已在置顶常用中的，避免重复展示)
const filteredAllFonts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const list = systemFonts.value.filter(f => !topFavorites.value.includes(f))
  if (!q) return list
  return list.filter(f => f.toLowerCase().includes(q))
})

const handleSelect = (font: string) => {
  // 选择字体时，自动加入常用置顶列表最前部
  const current = [
    font,
    ...(props.favoriteFonts || []).filter(f => f !== font),
  ]
  emit('updateFavorites', current)
  emit('select', font)
  visible.value = false
}
</script>

<style lang="scss" scoped>
.font-dialog-body {
  min-height: 240px;
}

.search-bar {
  margin-bottom: 16px;
}

.font-list-scroll {
  max-height: 440px;
  overflow-y: auto;
  padding-right: 4px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(128, 128, 128, 0.3);
    border-radius: 3px;
  }
}

.section-container {
  margin-bottom: 20px;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary, #909399);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;

  .star-icon.filled {
    color: #e6a23c;
  }

  .count-badge {
    font-size: 12px;
    opacity: 0.8;
  }
}

.font-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.font-item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  background: var(--el-fill-color-blank, #ffffff);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #ed4259;
    background: var(--el-fill-color-light, rgba(237, 66, 89, 0.04));
  }

  &.active {
    border-color: #ed4259;
    background: rgba(237, 66, 89, 0.08);
  }
}

.card-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.star-btn {
  background: none;
  border: none;
  padding: 4px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  color: var(--el-text-color-placeholder, #c0c4cc);
  transition: color 0.15s ease, transform 0.15s ease;

  &:hover {
    color: #e6a23c;
    transform: scale(1.15);
  }

  &.active {
    color: #e6a23c;
  }
}

.font-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.font-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary, #303133);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.font-preview {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-right {
  margin-left: 12px;
}

.using-badge {
  font-size: 11px;
  color: #ed4259;
  border: 1px solid #ed4259;
  border-radius: 4px;
  padding: 1px 6px;
  font-weight: 500;
}

.empty-tip {
  text-align: center;
  padding: 24px;
  color: var(--el-text-color-placeholder, #909399);
  font-size: 13px;
}
</style>

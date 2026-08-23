<template>
  <div class="search-view">
    <div class="page-header">
      <div class="header-left">
        <el-button text @click="router.push('/book-sources')">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <h2 class="page-title">搜索书籍</h2>
      </div>
    </div>

    <!-- 指定书源检索指示条 -->
    <div class="target-source-bar" v-if="targetSource">
      <span class="target-label">当前仅在指定书源检索：</span>
      <el-tag closable type="primary" effect="plain" @close="clearTargetSource">
        {{ targetSource.bookSourceName || targetSource.bookSourceUrl }}
      </el-tag>
      <el-button text size="small" type="primary" @click="clearTargetSource">
        切回全部已启用书源
      </el-button>
    </div>

    <div class="search-bar">
      <el-input
        v-model="keyword"
        placeholder="输入书名或作者搜索..."
        size="large"
        clearable
        @keyup.enter="handleSearch"
      >
        <template #append>
          <el-button @click="handleSearch" :loading="isSearching">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
        </template>
      </el-input>
    </div>

    <div class="search-results" v-loading="isSearching">
      <el-empty v-if="!isSearching && results.length === 0 && hasSearched" description="未找到相关书籍" />

      <div v-if="results.length > 0" class="result-list">
        <div
          v-for="(result, index) in results"
          :key="index"
          class="result-card"
          @click="openBookDetail(result)"
        >
          <div class="result-cover" v-if="result.coverUrl">
            <img :src="result.coverUrl" :alt="result.name" @error="onImageError" />
          </div>
          <div class="result-cover placeholder" v-else>
            <span>{{ result.name?.charAt(0) || '书' }}</span>
          </div>
          <div class="result-info">
            <div class="result-header">
              <div class="result-name">{{ result.name }}</div>
              <span class="result-source" v-if="result.sourceName">{{ result.sourceName }}</span>
            </div>
            <div class="result-author" v-if="result.author">作者：{{ result.author }}</div>
            <div class="result-intro" v-if="result.intro">{{ result.intro }}</div>
            <div class="result-meta">
              <span v-if="result.kind" class="result-kind">{{ result.kind }}</span>
              <span v-if="result.lastChapter" class="result-last-chapter">
                最新: {{ result.lastChapter }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Search } from '@element-plus/icons-vue'
import { useBookSourceStore } from '@/stores/bookSource'
import { useSearchStore } from '@/stores/search'
import { SourceEngine } from '@/source/engine/SourceEngine'
import { generateBookId } from '@/source/engine/RuleParser'
import type { SearchResult, BookSource } from '@/source/types/BookSource'

const router = useRouter()
const route = useRoute()
const bookSourceStore = useBookSourceStore()
const searchStore = useSearchStore()

const keyword = computed({
  get: () => searchStore.keyword,
  set: (val) => { searchStore.keyword = val },
})
const isSearching = ref(false)
const hasSearched = computed(() => searchStore.hasSearched)
const results = computed(() => searchStore.results)
const targetSourceUrl = ref<string>('')

onMounted(async () => {
  if (bookSourceStore.sources.length === 0) {
    await bookSourceStore.loadSources()
  }

  if (route.query.sourceUrl) {
    targetSourceUrl.value = String(route.query.sourceUrl)
    searchStore.targetSourceUrl = targetSourceUrl.value
  } else if (searchStore.targetSourceUrl) {
    targetSourceUrl.value = searchStore.targetSourceUrl
  }
})

const targetSource = computed<BookSource | undefined>(() => {
  if (!targetSourceUrl.value) return undefined
  return bookSourceStore.sources.find(s => s.bookSourceUrl === targetSourceUrl.value)
})

const clearTargetSource = () => {
  targetSourceUrl.value = ''
  searchStore.targetSourceUrl = ''
  router.replace({ path: '/search' })
  ElMessage.info('已切回全书源搜索模式')
}

let engine: SourceEngine | null = null

function getEngine(): SourceEngine {
  if (!engine) {
    engine = new SourceEngine()
  }
  return engine
}

const handleSearch = async () => {
  const query = keyword.value.trim()
  if (!query) {
    ElMessage.warning('请输入搜索关键词')
    return
  }

  let searchSources: BookSource[] = []

  if (targetSource.value) {
    searchSources = [targetSource.value]
  } else {
    searchSources = bookSourceStore.getEnabledSources()
  }

  if (searchSources.length === 0) {
    ElMessage.warning('没有可用的书源进行搜索，请先启用至少一个书源')
    return
  }

  isSearching.value = true

  try {
    const eng = getEngine()

    const promises = searchSources.map(source =>
      eng.search(source, query).catch(err => {
        console.warn(`书源 ${source.bookSourceName} 搜索失败:`, err)
        return [] as SearchResult[]
      })
    )

    const allResults = await Promise.allSettled(promises)
    const merged: SearchResult[] = []

    for (const result of allResults) {
      if (result.status === 'fulfilled') {
        merged.push(...result.value)
      }
    }

    searchStore.setResults(query, merged, targetSourceUrl.value)
    if (merged.length === 0) {
      ElMessage.info('未找到相关书籍')
    }
  } catch (err) {
    console.error('搜索失败:', err)
    ElMessage.error('搜索失败，请重试')
  } finally {
    isSearching.value = false
  }
}

const openBookDetail = (result: SearchResult) => {
  const bookId = generateBookId(result.name, result.author, result.sourceUrl)
  router.push({
    path: '/book-detail',
    query: {
      id: bookId,
      name: result.name,
      author: result.author,
      bookUrl: result.bookUrl,
      coverUrl: result.coverUrl,
      intro: result.intro,
      kind: result.kind,
      lastChapter: result.lastChapter,
      sourceUrl: result.sourceUrl,
      sourceName: result.sourceName,
    },
    state: {
      id: bookId,
      ...result,
    },
  })
}

const onImageError = (e: Event) => {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}
</script>

<style scoped>
.search-view {
  min-height: 100vh;
  background-color: var(--el-bg-color);
  padding: 20px 40px;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.target-source-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 8px 14px;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 6px;
  max-width: 640px;
}

.target-label {
  font-size: 13px;
  color: var(--el-color-primary);
  font-weight: 500;
}

.search-bar {
  max-width: 640px;
  margin-bottom: 32px;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 800px;
}

.result-card {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.result-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.result-cover {
  width: 80px;
  height: 110px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  background: var(--el-fill-color);
}

.result-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.result-cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
  color: var(--el-text-color-secondary);
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.result-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-source {
  font-size: 11px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.result-author {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.result-intro {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8px;
}

.result-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
}

.result-kind {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  padding: 2px 8px;
  border-radius: 4px;
}

.result-last-chapter {
  color: var(--el-text-color-secondary);
}

@media screen and (max-width: 768px) {
  .search-view {
    padding: 16px 20px;
  }

  .result-cover {
    width: 60px;
    height: 80px;
  }
}
</style>

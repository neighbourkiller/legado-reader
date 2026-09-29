import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SearchResult } from '@/source/types/BookSource'

export const useSearchStore = defineStore('search', () => {
  const keyword = ref('')
  const results = ref<SearchResult[]>([])
  const hasSearched = ref(false)
  const targetSourceUrl = ref('')
  const exactSearch = ref(false)
  // null 表示全部已启用书源，空数组表示未选择任何分组；空字符串代表未分组。
  const selectedGroups = ref<string[] | null>(null)

  function setResults(kw: string, res: SearchResult[], sourceUrl = '') {
    keyword.value = kw
    results.value = res
    hasSearched.value = true
    targetSourceUrl.value = sourceUrl
  }

  function clearResults() {
    results.value = []
    hasSearched.value = false
  }

  return {
    keyword,
    results,
    hasSearched,
    targetSourceUrl,
    exactSearch,
    selectedGroups,
    setResults,
    clearResults,
  }
})

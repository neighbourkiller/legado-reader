import { defineStore } from 'pinia';
import { ref } from 'vue';
export const useSearchStore = defineStore('search', () => {
    const keyword = ref('');
    const results = ref([]);
    const hasSearched = ref(false);
    const targetSourceUrl = ref('');
    function setResults(kw, res, sourceUrl = '') {
        keyword.value = kw;
        results.value = res;
        hasSearched.value = true;
        targetSourceUrl.value = sourceUrl;
    }
    function clearResults() {
        results.value = [];
        hasSearched.value = false;
    }
    return {
        keyword,
        results,
        hasSearched,
        targetSourceUrl,
        setResults,
        clearResults,
    };
});

import { readonly, shallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import { useBookshelfStore } from '@/stores/bookshelf'

interface UseBookImportOptions {
  afterSuccess?: () => void | Promise<void>
}

export function selectSupportedBookFiles(files: Iterable<File>): File[] {
  return Array.from(files).filter(file => {
    const extension = file.name.split('.').pop()?.toLowerCase()
    return extension === 'txt' || extension === 'epub'
  })
}

export function useBookImport(options: UseBookImportOptions = {}) {
  const bookshelfStore = useBookshelfStore()
  const isImporting = shallowRef(false)

  const importFiles = async (files: Iterable<File>): Promise<boolean> => {
    const validFiles = selectSupportedBookFiles(files)
    if (validFiles.length === 0) {
      ElMessage.error('仅支持导入 TXT 和 EPUB 格式的小说文件')
      return false
    }

    isImporting.value = true
    const loading = ElMessage({
      message: `正在导入 ${validFiles.length} 本书籍...`,
      type: 'info',
      duration: 0,
    })

    try {
      for (const file of validFiles) {
        await bookshelfStore.parseAndImportBook(file)
      }
      ElMessage.success('导入成功')
      await options.afterSuccess?.()
      return true
    } catch (error) {
      ElMessage.error('导入失败，请重试')
      console.error(error)
      return false
    } finally {
      loading.close()
      isImporting.value = false
    }
  }

  return {
    isImporting: readonly(isImporting),
    importFiles,
  }
}

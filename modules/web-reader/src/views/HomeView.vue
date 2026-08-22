<template>
  <div class="home-container">
    <div class="upload-area">
      <el-upload
        class="upload-dropzone"
        drag
        action=""
        :auto-upload="false"
        :on-change="handleFileChange"
        :show-file-list="false"
        accept=".txt,.epub"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">
          拖拽小说文件到此处，或 <em>点击选择文件</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            支持格式：TXT、EPUB
          </div>
        </template>
      </el-upload>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ElMessage, type UploadFile } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { useBookshelfStore } from '@/stores/bookshelf'

const router = useRouter()
const bookshelfStore = useBookshelfStore()

const handleFileChange = async (uploadFile: UploadFile) => {
  const file = uploadFile.raw
  if (!file) return

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'txt' && ext !== 'epub') {
    ElMessage.error('仅支持 TXT 和 EPUB 格式的文件')
    return
  }

  const loading = ElMessage({
    message: '正在导入书籍...',
    type: 'info',
    duration: 0
  })

  try {
    await bookshelfStore.parseAndImportBook(file)
    loading.close()
    ElMessage.success('导入成功')
    router.push('/bookshelf')
  } catch (error) {
    loading.close()
    ElMessage.error('导入失败，请重试')
    console.error(error)
  }
}
</script>

<style scoped>
.home-container {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-fill-color-lighter);
}
.upload-area {
  width: 100%;
  max-width: 600px;
  padding: 20px;
}
.upload-dropzone {
  width: 100%;
}
:deep(.el-upload-dragger) {
  padding: 60px 20px;
}
.el-icon--upload {
  font-size: 67px;
  color: var(--el-text-color-placeholder);
  margin-bottom: 16px;
  line-height: 50px;
}
.el-upload__text {
  font-size: 16px;
  color: var(--el-text-color-regular);
}
.el-upload__tip {
  text-align: center;
  font-size: 14px;
  margin-top: 16px;
  color: var(--el-text-color-secondary);
}
</style>

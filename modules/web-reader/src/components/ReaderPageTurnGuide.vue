<template>
  <div
    v-if="modelValue"
    class="reader-page-turn-guide"
    role="dialog"
    aria-modal="true"
    aria-labelledby="reader-page-turn-guide-title"
    @click.self="close"
  >
    <section class="guide-panel">
      <header class="guide-header">
        <div>
          <h2 id="reader-page-turn-guide-title">阅读操作引导</h2>
          <p>翻页阅读时，正文左右区域可用于翻页。</p>
        </div>
        <button class="guide-close" type="button" aria-label="关闭引导" @click="close">×</button>
      </header>

      <div class="guide-grid" aria-label="正文点击区域">
        <div v-for="index in 3" :key="`left-${index}`" class="guide-region previous">上一页</div>
        <div v-for="index in 3" :key="`center-${index}`" class="guide-region inactive">无操作</div>
        <div v-for="index in 3" :key="`right-${index}`" class="guide-region next">下一页</div>
      </div>

      <p class="guide-note">
        {{ paginationEnabled ? '当前为翻页阅读，可直接点击正文左右区域。' : '当前为滚动阅读，请使用鼠标滚轮或触控板滚动；切换为翻页阅读后可使用左右区域。' }}
      </p>
      <button class="guide-confirm" type="button" @click="close">开始阅读</button>
    </section>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
  paginationEnabled: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const close = () => emit('update:modelValue', false)
</script>

<style scoped>
.reader-page-turn-guide {
  position: fixed;
  top: var(--reader-toolbar-top, 0px);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  color: #fff;
  background: rgba(0, 0, 0, 0.62);
}

.guide-panel {
  width: min(960px, 100%);
  max-height: 100%;
  overflow: auto;
}

.guide-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 14px;
}

.guide-header h2,
.guide-header p,
.guide-note {
  margin: 0;
}

.guide-header h2 {
  font-size: 20px;
}

.guide-header p,
.guide-note {
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 14px;
  line-height: 1.6;
}

.guide-close,
.guide-confirm {
  border: 0;
  color: #fff;
  cursor: pointer;
}

.guide-close {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  font-size: 25px;
  line-height: 1;
}

.guide-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(88px, 1fr));
  grid-auto-flow: column;
  gap: 8px;
  min-height: min(520px, 60vh);
}

.guide-region {
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 18px;
  font-weight: 600;
}

.guide-region.previous,
.guide-region.next {
  background: rgba(64, 158, 255, 0.3);
}

.guide-region.inactive {
  color: rgba(255, 255, 255, 0.72);
}

.guide-confirm {
  display: block;
  min-width: 132px;
  margin: 18px auto 0;
  padding: 10px 22px;
  border-radius: 6px;
  background: #409eff;
  font-size: 15px;
}

.guide-close:hover,
.guide-close:focus-visible {
  background: rgba(255, 255, 255, 0.25);
}

.guide-confirm:hover,
.guide-confirm:focus-visible {
  background: #66b1ff;
}

@media screen and (max-width: 776px) {
  .reader-page-turn-guide {
    padding: 14px;
  }

  .guide-grid {
    min-height: min(420px, 58vh);
    gap: 5px;
  }

  .guide-region {
    font-size: 14px;
  }
}
</style>

<template>
  <div
    class="settings-wrapper"
    :style="popupTheme"
    :class="{ night: isNight, day: !isNight }"
  >
    <div class="settings-title">设置</div>
    <div class="setting-list">
      <ul>
        <!-- 阅读主题 -->
        <li class="theme-list">
          <i>阅读主题</i>
          <span
            class="theme-item"
            v-for="(themeColor, index) in themeColors"
            :key="index"
            :style="themeColor"
            @click="setTheme(index)"
            :class="{ selected: settings.theme === index }"
          >
            <em v-if="index < 6" class="iconfont">&#58980;</em>
            <em v-else class="moon-icon">{{ moonIcon }}</em>
          </span>
        </li>

        <!-- 正文字体 -->
        <li class="font-list">
          <i>正文字体</i>
          <div class="font-group-items">
            <span
              class="font-item"
              v-for="(fontName, index) in fontOptions"
              :key="index"
              :class="{ selected: settings.font === index }"
              @click="setFont(index)"
            >
              {{ fontName }}
            </span>
          </div>
        </li>

        <!-- 常用置顶字体 (如有使用或收藏的自定义字体) -->
        <li class="font-list" v-if="favoriteFontsList.length > 0">
          <i>常用字体</i>
          <div class="font-group-items">
            <span
              class="font-item font-fav-item"
              v-for="favFont in favoriteFontsList"
              :key="favFont"
              :class="{ selected: settings.font === -1 && settings.customFontName === favFont }"
              @click="selectFavoriteFont(favFont)"
              :title="favFont"
            >
              {{ favFont }}
            </span>
          </div>
        </li>

        <!-- 自定字体 -->
        <li class="font-list">
          <i>自定字体</i>
          <div class="font-group-items">
            <el-tooltip effect="dark" content="输入已在系统安装的字体名称" placement="top">
              <input
                type="text"
                class="font-item font-item-input"
                :class="{ selected: settings.font === -1 && (!favoriteFontsList.includes(settings.customFontName) || !settings.customFontName) }"
                v-model="customFontNameInput"
                placeholder="输入自定义字体..."
                @input="handleFontInputChange"
                @change="handleFontInputChange"
                @keyup.enter="saveCustomFont"
              />
            </el-tooltip>

            <el-popover
              placement="top"
              :width="270"
              trigger="click"
              v-model:visible="customFontSavePopVisible"
            >
              <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5">
                已安装在您设备上的字体请确认输入的字体名称完整无误，或直接从网络下载字体。
              </p>
              <div style="text-align: right; margin: 0">
                <el-button
                  size="small"
                  plain
                  @click="customFontSavePopVisible = false"
                >
                  取消
                </el-button>
                <el-button type="primary" size="small" @click="saveCustomFont">
                  确定
                </el-button>
                <el-button type="primary" size="small" @click="loadFontFromURL">
                  网络下载
                </el-button>
              </div>
              <template #reference>
                <span class="font-item font-btn" @click="saveCustomFont">保存</span>
              </template>
            </el-popover>

            <span class="font-item font-btn system-font-btn" @click="showSystemFontDialog = true">
              系统字体
            </span>
          </div>
        </li>

        <!-- 字体大小 -->
        <li class="font-size">
          <i>字体大小</i>
          <div class="resize">
            <span class="less" @click="lessFontSize">
              <em class="iconfont">&#58966;</em>
            </span>
            <b></b>
            <span class="lang">{{ settings.fontSize }}</span>
            <b></b>
            <span class="more" @click="moreFontSize">
              <em class="iconfont">&#58976;</em>
            </span>
          </div>
        </li>

        <!-- 字距 -->
        <li class="letter-spacing">
          <i>字距</i>
          <div class="resize">
            <span class="less" @click="lessLetterSpacing">
              <em class="iconfont">&#58966;</em>
            </span>
            <b></b>
            <span class="lang">{{ (settings.spacing?.letter ?? 0).toFixed(2) }}</span>
            <b></b>
            <span class="more" @click="moreLetterSpacing">
              <em class="iconfont">&#58976;</em>
            </span>
          </div>
        </li>

        <!-- 行距 -->
        <li class="line-spacing">
          <i>行距</i>
          <div class="resize">
            <span class="less" @click="lessLineSpacing">
              <em class="iconfont">&#58966;</em>
            </span>
            <b></b>
            <span class="lang">{{ (settings.spacing?.line ?? 1.0).toFixed(1) }}</span>
            <b></b>
            <span class="more" @click="moreLineSpacing">
              <em class="iconfont">&#58976;</em>
            </span>
          </div>
        </li>

        <!-- 段距 -->
        <li class="paragraph-spacing">
          <i>段距</i>
          <div class="resize">
            <span class="less" @click="lessParagraphSpacing">
              <em class="iconfont">&#58966;</em>
            </span>
            <b></b>
            <span class="lang">{{ (settings.spacing?.paragraph ?? 1.0).toFixed(1) }}</span>
            <b></b>
            <span class="more" @click="moreParagraphSpacing">
              <em class="iconfont">&#58976;</em>
            </span>
          </div>
        </li>

        <!-- 页面宽度 (非移动模式) -->
        <li class="read-width" v-if="!miniInterface">
          <i>页面宽度</i>
          <div class="resize">
            <span class="less" @click="lessReadWidth">
              <em class="iconfont">&#58965;</em>
            </span>
            <b></b>
            <span class="lang">{{ settings.readWidth }}</span>
            <b></b>
            <span class="more" @click="moreReadWidth">
              <em class="iconfont">&#58975;</em>
            </span>
          </div>
        </li>

        <!-- 翻页速度 -->
        <li class="paragraph-spacing">
          <i>翻页速度</i>
          <div class="resize">
            <span class="less" @click="lessJumpDuration">
              <em class="iconfont">&#58966;</em>
            </span>
            <b></b>
            <span class="lang">{{ settings.jumpDuration }}ms</span>
            <b></b>
            <span class="more" @click="moreJumpDuration">
              <em class="iconfont">&#58976;</em>
            </span>
          </div>
        </li>

        <!-- 无限加载 -->
        <li class="infinite-loading">
          <i>无限加载</i>
          <span
            class="infinite-loading-item"
            :class="{ selected: !settings.infiniteLoading }"
            @click="setInfiniteLoading(false)"
          >
            关闭
          </span>
          <span
            class="infinite-loading-item"
            :class="{ selected: settings.infiniteLoading }"
            @click="setInfiniteLoading(true)"
          >
            开启
          </span>
        </li>
      </ul>
    </div>

    <!-- 系统字体与常用置顶管理弹窗 -->
    <SystemFontDialog
      v-model="showSystemFontDialog"
      :currentFont="settings.font === -1 ? settings.customFontName : ''"
      :favoriteFonts="favoriteFontsList"
      @select="handleSystemFontSelect"
      @updateFavorites="handleUpdateFavorites"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useDebounceFn } from '@vueuse/shared'
import { useReadingStore } from '@/stores/reading'
import { useTheme } from '@/composables/useTheme'
import themeConfig from '@/config/themeConfig'
import SystemFontDialog from './SystemFontDialog.vue'
import '@/assets/fonts/popfont.css'
import '@/assets/fonts/iconfont.css'

const store = useReadingStore()
const { settings, miniInterface } = storeToRefs(store)
const { setTheme: setGlobalTheme } = useTheme()

const saveDebounced = useDebounceFn(() => {
  store.updateSettings(settings.value)
}, 400)

const isNight = computed(() => settings.value.theme === 6)
const moonIcon = computed(() => (settings.value.theme === 6 ? '' : ''))

const themeColors = [
  { background: 'rgba(250, 245, 235, 0.8)' },
  { background: 'rgba(245, 234, 204, 0.8)' },
  { background: 'rgba(230, 242, 230, 0.8)' },
  { background: 'rgba(228, 241, 245, 0.8)' },
  { background: 'rgba(245, 228, 228, 0.8)' },
  { background: 'rgba(224, 224, 224, 0.8)' },
  { background: 'rgba(0, 0, 0, 0.5)' },
]

const popupTheme = computed(() => {
  const themeIdx = settings.value.theme ?? 1
  return {
    background: themeConfig.themes[themeIdx]?.popup || '#ede7da',
  }
})

const setTheme = (idx: number) => {
  settings.value.theme = idx
  if (idx === 6) {
    setGlobalTheme('dark')
  } else {
    setGlobalTheme('light')
  }
  saveDebounced()
}

// 预设字体
const fontOptions = ['雅黑', '宋体', '楷书']
const setFont = (fontIdx: number) => {
  settings.value.font = fontIdx
  saveDebounced()
}

// 常用字体与系统字体弹窗
const showSystemFontDialog = ref(false)

const favoriteFontsList = computed(() => {
  const list: string[] = []
  if (settings.value.font === -1 && settings.value.customFontName?.trim()) {
    list.push(settings.value.customFontName.trim())
  }
  for (const f of settings.value.favoriteFonts || []) {
    if (f && f.trim() && !list.includes(f.trim())) {
      list.push(f.trim())
    }
  }
  return list
})

const selectFavoriteFont = async (fontName: string) => {
  settings.value.font = -1
  settings.value.customFontName = fontName
  const currentFavs = [
    fontName,
    ...(settings.value.favoriteFonts || []).filter(f => f !== fontName),
  ]
  settings.value.favoriteFonts = currentFavs
  await store.updateSettings({
    font: -1,
    customFontName: fontName,
    favoriteFonts: currentFavs,
  })
}

const handleSystemFontSelect = async (fontName: string) => {
  settings.value.font = -1
  settings.value.customFontName = fontName
  const currentFavs = [
    fontName,
    ...(settings.value.favoriteFonts || []).filter(f => f !== fontName),
  ]
  settings.value.favoriteFonts = currentFavs
  await store.updateSettings({
    font: -1,
    customFontName: fontName,
    favoriteFonts: currentFavs,
  })
  ElMessage.success(`已应用系统字体: ${fontName}`)
}

const handleUpdateFavorites = async (favorites: string[]) => {
  settings.value.favoriteFonts = favorites
  await store.updateSettings({
    favoriteFonts: favorites,
  })
}

// 自定义字体
const customFontNameInput = ref(settings.value.customFontName || '')
const customFontSavePopVisible = ref(false)

watch(
  () => settings.value.customFontName,
  name => {
    customFontNameInput.value = name || ''
  },
  { immediate: true }
)

const handleFontInputChange = () => {
  const fontName = customFontNameInput.value.trim()
  if (fontName) {
    settings.value.font = -1
    settings.value.customFontName = fontName
    store.updateSettings({
      font: -1,
      customFontName: fontName,
    })
  }
}

const saveCustomFont = async () => {
  customFontSavePopVisible.value = false
  const fontName = customFontNameInput.value.trim()
  if (!fontName) {
    ElMessage.warning('请输入自定义字体名称')
    return
  }
  settings.value.font = -1
  settings.value.customFontName = fontName
  const currentFavs = [
    fontName,
    ...(settings.value.favoriteFonts || []).filter(f => f !== fontName),
  ]
  settings.value.favoriteFonts = currentFavs
  await store.updateSettings({
    font: -1,
    customFontName: fontName,
    favoriteFonts: currentFavs,
  })
  ElMessage.success(`已应用自定义字体: ${fontName}`)
}

const loadFontFromURL = () => {
  customFontSavePopVisible.value = false
  ElMessageBox.prompt('请输入字体网络链接 (URL)', '下载网络字体', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPattern: /^https?:.+$/,
    inputErrorMessage: 'URL 格式不正确',
    beforeClose: (action, instance, done) => {
      if (action === 'confirm') {
        instance.confirmButtonLoading = true
        instance.confirmButtonText = '下载中...'
        const url = instance.inputValue
        if (typeof FontFace !== 'function') {
          ElMessage.error('当前浏览器不支持 FontFace API')
          return done()
        }
        const fontName = customFontNameInput.value.trim() || 'CustomWebFont'
        const fontface = new FontFace(fontName, `url("${url}")`)
        document.fonts.add(fontface)
        fontface
          .load()
          .then(async () => {
            instance.confirmButtonLoading = false
            ElMessage.success('字体加载成功！')
            settings.value.customFontName = fontName
            settings.value.customFontUrl = url
            settings.value.font = -1
            await store.updateSettings({
              font: -1,
              customFontName: fontName,
              customFontUrl: url,
            })
            done()
          })
          .catch(err => {
            instance.confirmButtonLoading = false
            instance.confirmButtonText = '确定'
            ElMessage.error('字体下载失败，请检查链接有效性与跨域策略')
            console.error(err)
          })
      } else {
        done()
      }
    },
  })
}

// 字体大小
const moreFontSize = () => {
  if (settings.value.fontSize < 48) {
    settings.value.fontSize += 2
    saveDebounced()
  }
}
const lessFontSize = () => {
  if (settings.value.fontSize > 12) {
    settings.value.fontSize -= 2
    saveDebounced()
  }
}

// 字距 / 行距 / 段距
const lessLetterSpacing = () => {
  settings.value.spacing.letter = Math.max(-0.2, settings.value.spacing.letter - 0.01)
  saveDebounced()
}
const moreLetterSpacing = () => {
  settings.value.spacing.letter = Math.min(1.0, settings.value.spacing.letter + 0.01)
  saveDebounced()
}

const lessLineSpacing = () => {
  settings.value.spacing.line = Math.max(0.5, settings.value.spacing.line - 0.1)
  saveDebounced()
}
const moreLineSpacing = () => {
  settings.value.spacing.line = Math.min(3.0, settings.value.spacing.line + 0.1)
  saveDebounced()
}

const lessParagraphSpacing = () => {
  settings.value.spacing.paragraph = Math.max(0.2, settings.value.spacing.paragraph - 0.1)
  saveDebounced()
}
const moreParagraphSpacing = () => {
  settings.value.spacing.paragraph = Math.min(3.0, settings.value.spacing.paragraph + 0.1)
  saveDebounced()
}

// 页面宽度
const moreReadWidth = () => {
  if (settings.value.readWidth + 160 + 2 * 68 > window.innerWidth) return
  settings.value.readWidth += 160
  saveDebounced()
}
const lessReadWidth = () => {
  if (settings.value.readWidth > 640) {
    settings.value.readWidth -= 160
    saveDebounced()
  }
}

// 翻页速度
const moreJumpDuration = () => {
  settings.value.jumpDuration = Math.min(1500, settings.value.jumpDuration + 100)
  saveDebounced()
}
const lessJumpDuration = () => {
  settings.value.jumpDuration = Math.max(0, settings.value.jumpDuration - 100)
  saveDebounced()
}

// 无限加载
const setInfiniteLoading = (val: boolean) => {
  settings.value.infiniteLoading = val
  saveDebounced()
}
</script>

<style lang="scss" scoped>
:deep(.iconfont),
:deep(.moon-icon) {
  font-family: iconfont !important;
  font-style: normal;
}

.settings-wrapper {
  user-select: none;
  margin: -16px;
  text-align: left;
  padding: 30px 0 30px 24px;
  box-sizing: border-box;

  .settings-title {
    font-size: 18px;
    line-height: 22px;
    margin-bottom: 24px;
    font-family: FZZCYSK, sans-serif;
    font-weight: 400;
  }

  .setting-list {
    max-height: calc(75vh - 50px);
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 16px;

    ul {
      list-style: none outside none;
      margin: 0;
      padding: 0;

      li {
        list-style: none outside none;
        display: flex;
        align-items: center;

        i {
          font: 13px / 16px PingFangSC-Regular, '-apple-system', Simsun, sans-serif;
          display: inline-block;
          min-width: 58px;
          margin-right: 16px;
          color: #666;
        }

        .theme-item {
          line-height: 32px;
          width: 32px;
          height: 32px;
          margin-right: 12px;
          border-radius: 100%;
          display: inline-block;
          cursor: pointer;
          text-align: center;
          vertical-align: middle;

          .iconfont {
            display: none;
          }
        }

        .selected {
          color: #ed4259;

          .iconfont {
            display: inline;
          }
        }
      }

      .font-list {
        margin-top: 22px;
        align-items: flex-start;

        i {
          line-height: 32px;
        }

        .font-group-items {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          flex: 1;
          align-items: center;
        }

        .font-item {
          min-width: 60px;
          max-width: 140px;
          height: 32px;
          padding: 0 8px;
          cursor: pointer;
          border-radius: 2px;
          text-align: center;
          vertical-align: middle;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          box-sizing: border-box;
          font: 13px / 32px PingFangSC-Regular,
            HelveticaNeue-Light,
            'Helvetica Neue Light',
            'Microsoft YaHei',
            sans-serif;
          transition: all 0.2s ease;
        }

        .font-fav-item {
          max-width: 150px;
        }

        .font-item-input {
          width: 130px;
          max-width: 130px;
          padding: 0 8px;
          color: inherit;
          box-sizing: border-box;
          outline: none;
          text-overflow: ellipsis;
        }

        .font-btn {
          min-width: 44px;
          padding: 0 8px;
        }

        .system-font-btn {
          min-width: 72px;
          padding: 0 8px;
          white-space: nowrap;
        }

        .selected {
          color: #ed4259;
          border: 1px solid #ed4259 !important;
          font-weight: bold;
        }

        .font-item:hover {
          border: 1px solid #ed4259;
          color: #ed4259;
        }
      }

      .infinite-loading {
        margin-top: 22px;

        .infinite-loading-item {
          width: 72px;
          height: 32px;
          cursor: pointer;
          margin-right: 12px;
          border-radius: 2px;
          text-align: center;
          vertical-align: middle;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font: 13px / 32px PingFangSC-Regular,
            HelveticaNeue-Light,
            'Helvetica Neue Light',
            'Microsoft YaHei',
            sans-serif;
          transition: all 0.2s ease;
        }

        .selected {
          color: #ed4259;
          border: 1px solid #ed4259 !important;
          font-weight: bold;
        }

        .infinite-loading-item:hover {
          border: 1px solid #ed4259;
          color: #ed4259;
        }
      }

      .font-size,
      .read-width,
      .letter-spacing,
      .line-spacing,
      .paragraph-spacing {
        margin-top: 22px;

        .resize {
          display: inline-flex;
          align-items: center;
          width: 240px;
          height: 32px;
          border-radius: 2px;

          span {
            flex: 1;
            height: 32px;
            line-height: 32px;
            cursor: pointer;
            text-align: center;

            em {
              font-style: normal;
            }
          }

          .less:hover,
          .more:hover {
            color: #ed4259;
          }

          .lang {
            color: #888;
            font-weight: 500;
            font-family: FZZCYSK, sans-serif;
            font-size: 13px;
          }

          b {
            display: inline-block;
            height: 16px;
            width: 1px;
          }
        }
      }
    }
  }
}

.night {
  color: #c8c8c8;

  :deep(.theme-item) {
    border: 1px solid #555;
  }

  :deep(.selected) {
    border: 1px solid #ed4259;
  }

  :deep(.moon-icon) {
    color: #ed4259;
  }

  :deep(.font-list),
  .infinite-loading {
    .font-item,
    .infinite-loading-item {
      border: 1px solid #555;
      background: rgba(45, 45, 45, 0.6);
      color: #ddd;
    }
  }

  :deep(.resize) {
    border: 1px solid #555;
    background: rgba(45, 45, 45, 0.6);

    b {
      border-right: 1px solid #555;
    }
  }
}

.day {
  color: #333;

  :deep(.theme-item) {
    border: 1px solid #e5e5e5;
  }

  :deep(.selected) {
    border: 1px solid #ed4259;
  }

  :deep(.moon-icon) {
    display: inline;
    color: rgba(255, 255, 255, 0.4);
  }

  :deep(.font-list),
  .infinite-loading {
    .font-item,
    .infinite-loading-item {
      background: rgba(255, 255, 255, 0.6);
      border: 1px solid rgba(0, 0, 0, 0.12);
      color: #333;
    }
  }

  :deep(.resize) {
    border: 1px solid #e5e5e5;
    background: rgba(255, 255, 255, 0.6);

    b {
      border-right: 1px solid #e5e5e5;
    }
  }
}

@media screen and (max-width: 500px) {
  .settings-wrapper i {
    min-width: 48px !important;
    font-size: 12px !important;
  }
}
</style>

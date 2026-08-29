<template>
  <div class="source-edit-panel" v-if="formData">
    <div class="edit-navigation">
      <el-tabs v-model="activeSection" class="sub-rule-tabs sharp-tabs" @tab-change="handleSectionChange">
        <el-tab-pane label="基本设置" name="base" />
        <el-tab-pane label="搜索规则" name="search" />
        <el-tab-pane label="发现规则" name="explore" />
        <el-tab-pane label="详情规则" name="info" />
        <el-tab-pane label="目录规则" name="toc" />
        <el-tab-pane label="正文规则" name="content" />
        <el-tab-pane label="JSON" name="json" />
      </el-tabs>
    </div>

    <div class="panel-body">
      <!-- 表单可视化编辑 -->
      <div v-show="activeSection !== 'json'" class="form-pane">
        <el-form label-position="top" size="default" class="source-form">
          <!-- 1. 基本设置 -->
          <div v-show="activeSection === 'base'" class="sub-tab-pane">
            <div class="form-section">
              <div class="form-section-title">基本信息</div>
              <div class="form-grid-basic">
                <el-form-item label="书源名称" required>
                  <el-input v-model="formData.bookSourceName" placeholder="例如：顶点小说" class="sharp-input" />
                </el-form-item>
                <el-form-item label="书源分组">
                  <div
                    class="book-source-group-select-toggle"
                    @mousedown.capture="handleBookSourceGroupSelectMouseDown"
                    @click.capture="handleBookSourceGroupSelectClick"
                  >
                    <el-select
                      ref="bookSourceGroupSelectRef"
                      v-model="formData.bookSourceGroup"
                      filterable
                      allow-create
                      clearable
                      default-first-option
                      placeholder="选择或输入新分组"
                      class="sharp-input"
                      style="width: 100%;"
                    >
                      <el-option v-for="group in groupOptions" :key="group" :label="group" :value="group" />
                    </el-select>
                  </div>
                </el-form-item>
                <el-form-item label="书源类型">
                  <el-select v-model="formData.bookSourceType" class="sharp-input" style="width: 100%;">
                    <el-option :value="0" label="0 - 文本小说 (Text)" />
                    <el-option :value="2" label="2 - 图片/漫画 (Image)" />
                  </el-select>
                </el-form-item>
              </div>
              <el-form-item label="书源基础 URL" required>
                <el-input v-model="formData.bookSourceUrl" placeholder="https://www.example.com" class="sharp-input" />
              </el-form-item>

              <div class="form-switches-grid">
                <div class="setting-tile">
                  <div><strong>启用书源</strong><span>参与搜索与在线阅读</span></div>
                  <el-switch v-model="formData.enabled" aria-label="启用书源" />
                </div>
                <div class="setting-tile">
                  <div><strong>启用发现</strong><span>允许显示书源的发现分类</span></div>
                  <el-switch v-model="formData.enabledExplore" aria-label="启用发现" />
                </div>
                <div class="setting-tile">
                  <div><strong>保存 Cookie</strong><span>跨请求保存站点 CookieJar</span></div>
                  <el-switch v-model="formData.enabledCookieJar" aria-label="保存 Cookie" />
                </div>
                <div class="setting-tile">
                  <div><strong>WebView 穿透</strong><span>用于 Cloudflare 盾与验证码</span></div>
                  <el-switch v-model="formData.useWebView" aria-label="启用 WebView 穿透" />
                </div>
              </div>
            </div>

            <el-collapse v-model="activeAdvancedSections" class="advanced-config-collapse">
              <el-collapse-item name="network">
                <template #title><strong>网络与鉴权配置</strong><span class="collapse-summary">请求头、并发、登录与 URL 匹配</span></template>
                <div class="advanced-config-body">
                  <el-form-item label="自定义请求头">
                    <el-input v-model="formData.header" type="textarea" :rows="3" placeholder="JSON 格式请求头对象" class="sharp-textarea code-textarea" />
                    <div class="field-help">Header JSON，例如 {&quot;User-Agent&quot;: &quot;...&quot;, &quot;Referer&quot;: &quot;...&quot;}</div>
                  </el-form-item>
                  <div class="form-grid-2">
                    <el-form-item label="并发限制 / 请求间隔">
                      <el-input v-model="formData.concurrentRate" placeholder="例如：1000（毫秒）" class="sharp-input" />
                      <div class="field-help"><code>concurrentRate</code></div>
                    </el-form-item>
                    <el-form-item label="登录地址">
                      <el-input v-model="formData.loginUrl" placeholder="如 https://example.com/login" class="sharp-input" />
                      <div class="field-help"><code>loginUrl</code></div>
                    </el-form-item>
                  </div>
                  <el-form-item label="书籍详情 URL 正则匹配">
                    <el-input v-model="formData.bookUrlPattern" placeholder="如 https?://.*example\\.com/book/\\d+" class="sharp-input" />
                    <div class="field-help"><code>bookUrlPattern</code></div>
                  </el-form-item>
                </div>
              </el-collapse-item>
              <el-collapse-item name="notes">
                <template #title><strong>说明与备注</strong><span class="collapse-summary">使用说明、账号提示与注意事项</span></template>
                <div class="advanced-config-body">
                  <el-form-item label="书源说明注释">
                    <el-input v-model="formData.bookSourceComment" type="textarea" :rows="3" placeholder="书源作者使用说明、账号密码提示或注意事项..." class="sharp-textarea" />
                    <div class="field-help"><code>bookSourceComment</code></div>
                  </el-form-item>
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>

          <!-- 2. 搜索规则 -->
          <div v-show="activeSection === 'search'" class="sub-tab-pane">
            <div class="form-section">
              <div class="form-section-title">搜索请求配置</div>
              <el-form-item label="搜索 URL (使用 {{key}} 代替搜索词，{{page}} 代替页码)">
                <el-input
                  v-model="formData.searchUrl"
                  type="textarea"
                  :rows="2"
                  placeholder="例如：https://example.com/search?keyword={{key}}"
                  class="sharp-textarea code-textarea"
                />
              </el-form-item>
              <el-form-item label="搜索校验关键字 (checkKeyWord)">
                <el-input v-model="formData.ruleSearch.checkKeyWord" placeholder="用于校验搜索结果页是否正常加载" class="sharp-input" />
              </el-form-item>
            </div>

            <div class="form-section">
              <div class="form-section-title">搜索结果提取 (Search)</div>
              <el-form-item label="书籍列表规则 (bookList)">
                <el-input v-model="formData.ruleSearch.bookList" placeholder="CSS/XPath/JSONPath，如 .book-item" class="sharp-input" />
              </el-form-item>
              <div class="form-grid-2">
                <el-form-item label="书名规则 (name)">
                  <el-input v-model="formData.ruleSearch.name" placeholder="如 .title@text 或 $.name" class="sharp-input" />
                </el-form-item>
                <el-form-item label="作者规则 (author)">
                  <el-input v-model="formData.ruleSearch.author" placeholder="如 .author@text" class="sharp-input" />
                </el-form-item>
              </div>
              <div class="form-grid-2">
                <el-form-item label="详情链接规则 (bookUrl)">
                  <el-input v-model="formData.ruleSearch.bookUrl" placeholder="如 a.title@href" class="sharp-input" />
                </el-form-item>
                <el-form-item label="封面规则 (coverUrl)">
                  <el-input v-model="formData.ruleSearch.coverUrl" placeholder="如 img@src" class="sharp-input" />
                </el-form-item>
              </div>
              <el-form-item label="简介规则 (intro)">
                <el-input v-model="formData.ruleSearch.intro" type="textarea" :rows="2" placeholder="如 .intro@text" class="sharp-textarea" />
              </el-form-item>
              <div class="form-grid-2">
                <el-form-item label="分类/状态 (kind)">
                  <el-input v-model="formData.ruleSearch.kind" placeholder="如 .kind@text" class="sharp-input" />
                </el-form-item>
                <el-form-item label="最新章节 (lastChapter)">
                  <el-input v-model="formData.ruleSearch.lastChapter" placeholder="如 .last-chapter@text" class="sharp-input" />
                </el-form-item>
              </div>
              <div class="form-grid-2">
                <el-form-item label="更新时间 (updateTime)">
                  <el-input v-model="formData.ruleSearch.updateTime" placeholder="如 .update-time@text" class="sharp-input" />
                </el-form-item>
                <el-form-item label="总字数 (wordCount)">
                  <el-input v-model="formData.ruleSearch.wordCount" placeholder="如 .word-count@text" class="sharp-input" />
                </el-form-item>
              </div>
            </div>
          </div>

          <!-- 3. 发现规则 -->
          <div v-show="activeSection === 'explore'" class="sub-tab-pane">
            <div class="form-section">
              <div class="form-section-header-row">
                <div class="form-section-title" style="margin-bottom: 0;">发现请求配置</div>
                <el-button size="small" @click="copySearchToExplore" class="sharp-btn">
                  <el-icon><CopyDocument /></el-icon>
                  <span>一键复制搜索规则</span>
                </el-button>
              </div>
              <div class="helper-hint">
                提示：若发现规则字段未单独填写，引擎将自动缺省回退复用搜索规则。发现地址支持以 <code>标题::URL</code> 形式分行配置多个分类。
              </div>
              <el-form-item label="发现 URL (exploreUrl)" style="margin-top: 12px;">
                <el-input
                  v-model="formData.exploreUrl"
                  type="textarea"
                  :rows="3"
                  placeholder="例如：&#10;玄幻::https://example.com/sort/1_{{page}}&#10;都市::https://example.com/sort/2_{{page}}"
                  class="sharp-textarea code-textarea"
                />
              </el-form-item>
            </div>

            <div class="form-section">
              <div class="form-section-title">发现结果提取 (Explore)</div>
              <el-form-item label="书籍列表规则 (bookList)">
                <el-input v-model="formData.ruleExplore.bookList" placeholder="CSS/XPath/JSONPath，如 .book-item" class="sharp-input" />
              </el-form-item>
              <div class="form-grid-2">
                <el-form-item label="书名规则 (name)">
                  <el-input v-model="formData.ruleExplore.name" placeholder="如 .title@text" class="sharp-input" />
                </el-form-item>
                <el-form-item label="作者规则 (author)">
                  <el-input v-model="formData.ruleExplore.author" placeholder="如 .author@text" class="sharp-input" />
                </el-form-item>
              </div>
              <div class="form-grid-2">
                <el-form-item label="详情链接规则 (bookUrl)">
                  <el-input v-model="formData.ruleExplore.bookUrl" placeholder="如 a.title@href" class="sharp-input" />
                </el-form-item>
                <el-form-item label="封面规则 (coverUrl)">
                  <el-input v-model="formData.ruleExplore.coverUrl" placeholder="如 img@src" class="sharp-input" />
                </el-form-item>
              </div>
              <el-form-item label="简介规则 (intro)">
                <el-input v-model="formData.ruleExplore.intro" type="textarea" :rows="2" placeholder="如 .intro@text" class="sharp-textarea" />
              </el-form-item>
              <div class="form-grid-2">
                <el-form-item label="分类/状态 (kind)">
                  <el-input v-model="formData.ruleExplore.kind" placeholder="如 .kind@text" class="sharp-input" />
                </el-form-item>
                <el-form-item label="最新章节 (lastChapter)">
                  <el-input v-model="formData.ruleExplore.lastChapter" placeholder="如 .last-chapter@text" class="sharp-input" />
                </el-form-item>
              </div>
              <div class="form-grid-2">
                <el-form-item label="更新时间 (updateTime)">
                  <el-input v-model="formData.ruleExplore.updateTime" placeholder="如 .update-time@text" class="sharp-input" />
                </el-form-item>
                <el-form-item label="总字数 (wordCount)">
                  <el-input v-model="formData.ruleExplore.wordCount" placeholder="如 .word-count@text" class="sharp-input" />
                </el-form-item>
              </div>
            </div>
          </div>

          <!-- 4. 详情规则 -->
          <div v-show="activeSection === 'info'" class="sub-tab-pane">
            <div class="form-section">
              <div class="form-section-title">详情预处理</div>
              <el-form-item label="预处理初始化规则 (init)">
                <el-input
                  v-model="formData.ruleBookInfo.init"
                  type="textarea"
                  :rows="2"
                  placeholder="通常留空，若详情页需二次请求或执行 JS 前置逻辑在此填写"
                  class="sharp-textarea code-textarea"
                />
              </el-form-item>
            </div>

            <div class="form-section">
              <div class="form-section-title">详情提取 (BookInfo)</div>
              <div class="form-grid-2">
                <el-form-item label="详情书名 (name)">
                  <el-input v-model="formData.ruleBookInfo.name" placeholder="如 h1.name@text" class="sharp-input" />
                </el-form-item>
                <el-form-item label="作者规则 (author)">
                  <el-input v-model="formData.ruleBookInfo.author" placeholder="如 .author@text" class="sharp-input" />
                </el-form-item>
              </div>
              <div class="form-grid-2">
                <el-form-item label="封面规则 (coverUrl)">
                  <el-input v-model="formData.ruleBookInfo.coverUrl" placeholder="如 .cover img@src" class="sharp-input" />
                </el-form-item>
                <el-form-item label="目录链接 (tocUrl)">
                  <el-input v-model="formData.ruleBookInfo.tocUrl" placeholder="若详情页即为目录留空或填写 a.toc@href" class="sharp-input" />
                </el-form-item>
              </div>
              <el-form-item label="简介规则 (intro)">
                <el-input
                  v-model="formData.ruleBookInfo.intro"
                  type="textarea"
                  :rows="3"
                  placeholder="如 #intro@text 或 .description@text"
                  class="sharp-textarea"
                />
              </el-form-item>
              <div class="form-grid-2">
                <el-form-item label="分类/状态 (kind)">
                  <el-input v-model="formData.ruleBookInfo.kind" placeholder="如 .tag@text" class="sharp-input" />
                </el-form-item>
                <el-form-item label="最新章节 (lastChapter)">
                  <el-input v-model="formData.ruleBookInfo.lastChapter" placeholder="如 .last-chapter a@text" class="sharp-input" />
                </el-form-item>
              </div>
              <div class="form-grid-2">
                <el-form-item label="更新时间 (updateTime)">
                  <el-input v-model="formData.ruleBookInfo.updateTime" placeholder="如 .update-time@text" class="sharp-input" />
                </el-form-item>
                <el-form-item label="总字数 (wordCount)">
                  <el-input v-model="formData.ruleBookInfo.wordCount" placeholder="如 .word-count@text" class="sharp-input" />
                </el-form-item>
              </div>
              <div class="form-grid-2">
                <el-form-item label="全本下载链接 (downloadUrls)">
                  <el-input v-model="formData.ruleBookInfo.downloadUrls" placeholder="如 a.download@href" class="sharp-input" />
                </el-form-item>
                <el-form-item label="允许重命名 (canReName)">
                  <el-input v-model="formData.ruleBookInfo.canReName" placeholder="如 true 或表达式" class="sharp-input" />
                </el-form-item>
              </div>
            </div>
          </div>

          <!-- 5. 目录规则 -->
          <div v-show="activeSection === 'toc'" class="sub-tab-pane">
            <div class="form-section">
              <div class="form-section-title">章节列表提取 (Toc)</div>
              <el-form-item label="章节列表规则 (chapterList)">
                <el-input v-model="formData.ruleToc.chapterList" placeholder="如 .chapter-list li a 或 //ul[@id='chapters']/li/a" class="sharp-input" />
              </el-form-item>
              <div class="form-grid-2">
                <el-form-item label="章节名称 (chapterName)">
                  <el-input v-model="formData.ruleToc.chapterName" placeholder="如 text 或 a@text" class="sharp-input" />
                </el-form-item>
                <el-form-item label="章节链接 (chapterUrl)">
                  <el-input v-model="formData.ruleToc.chapterUrl" placeholder="如 href 或 a@href" class="sharp-input" />
                </el-form-item>
              </div>
              <el-form-item label="目录下一页链接 (nextTocUrl)">
                <el-input v-model="formData.ruleToc.nextTocUrl" placeholder="用于长篇小说目录多页翻页，如 a.next-page@href" class="sharp-input" />
              </el-form-item>
              <div class="form-grid-2">
                <el-form-item label="分卷标识 (isVolume)">
                  <el-input v-model="formData.ruleToc.isVolume" placeholder="如 class.volume 或表达式，命中则解析为分卷" class="sharp-input" />
                </el-form-item>
                <el-form-item label="VIP 标识 (isVip)">
                  <el-input v-model="formData.ruleToc.isVip" placeholder="如 class.vip 或 a[href*='vip']" class="sharp-input" />
                </el-form-item>
              </div>
              <div class="form-grid-2">
                <el-form-item label="付费标识 (isPay)">
                  <el-input v-model="formData.ruleToc.isPay" placeholder="如 class.pay 或 span.lock" class="sharp-input" />
                </el-form-item>
                <el-form-item label="章节更新时间 (updateTime)">
                  <el-input v-model="formData.ruleToc.updateTime" placeholder="如 .update-time@text" class="sharp-input" />
                </el-form-item>
              </div>
            </div>

            <div class="form-section">
              <div class="form-section-title">脚本增强处理</div>
              <el-form-item label="章节名格式化处理 JS (formatJs)">
                <el-input
                  v-model="formData.ruleToc.formatJs"
                  type="textarea"
                  :rows="2"
                  placeholder="如用于正则替换章节名中冗余文字的 JS 脚本"
                  class="sharp-textarea code-textarea"
                />
              </el-form-item>
              <el-form-item label="目录刷新前执行 JS (preUpdateJs)">
                <el-input
                  v-model="formData.ruleToc.preUpdateJs"
                  type="textarea"
                  :rows="2"
                  placeholder="获取目录前执行的预处理 JS 脚本"
                  class="sharp-textarea code-textarea"
                />
              </el-form-item>
            </div>
          </div>

          <!-- 6. 正文规则 -->
          <div v-show="activeSection === 'content'" class="sub-tab-pane">
            <div class="form-section">
              <div class="form-section-title">正文内容提取 (Content)</div>
              <el-form-item label="正文内容规则 (content)">
                <el-input
                  v-model="formData.ruleContent.content"
                  type="textarea"
                  :rows="3"
                  placeholder="如 #content@text 或 //div[@id='content']/text()"
                  class="sharp-textarea code-textarea"
                />
              </el-form-item>
              <div class="form-grid-2">
                <el-form-item label="正文章节标题 (title)">
                  <el-input v-model="formData.ruleContent.title" placeholder="如 h1.title@text，用于与目录核对" class="sharp-input" />
                </el-form-item>
                <el-form-item label="下一页链接 (nextContentUrl)">
                  <el-input v-model="formData.ruleContent.nextContentUrl" placeholder="用于单章分页阅读，如 a.next-page@href" class="sharp-input" />
                </el-form-item>
              </div>
              <el-form-item label="正文副内容/增量 (subContent)">
                <el-input v-model="formData.ruleContent.subContent" placeholder="如附加作者有话说等内容" class="sharp-input" />
              </el-form-item>
              <el-form-item label="正文替换与净化 (replaceRegex)">
                <el-input
                  v-model="formData.ruleContent.replaceRegex"
                  type="textarea"
                  :rows="3"
                  placeholder="如 ##广告内容## 或 ##匹配正则##替换内容"
                  class="sharp-textarea code-textarea"
                />
              </el-form-item>
              <el-form-item label="资源过滤正则 (sourceRegex)">
                <el-input v-model="formData.ruleContent.sourceRegex" placeholder="用于过滤正文中无关图片或资源的正则表达式" class="sharp-input" />
              </el-form-item>
            </div>

            <div class="form-section">
              <div class="form-section-title">动态渲染与漫画图源</div>
              <el-form-item label="页面渲染执行 WebJS (webJs)">
                <el-input
                  v-model="formData.ruleContent.webJs"
                  type="textarea"
                  :rows="2"
                  placeholder="在目标网页上下文中执行的 JS 脚本（如触发动态点击等）"
                  class="sharp-textarea code-textarea"
                />
              </el-form-item>
              <div class="form-grid-2">
                <el-form-item label="漫画图片样式 (imageStyle)">
                  <el-select v-model="formData.ruleContent.imageStyle" placeholder="选择排版样式" class="sharp-input" clearable style="width: 100%;">
                    <el-option label="默认 (0)" value="0" />
                    <el-option label="单页居中 (1)" value="1" />
                    <el-option label="连续满宽 (FULL)" value="FULL" />
                  </el-select>
                </el-form-item>
                <el-form-item label="付费动作 (payAction)">
                  <el-input v-model="formData.ruleContent.payAction" placeholder="付费交互脚本或 URL" class="sharp-input" />
                </el-form-item>
              </div>
              <el-form-item label="漫画图片解密 JS (imageDecode)">
                <el-input
                  v-model="formData.ruleContent.imageDecode"
                  type="textarea"
                  :rows="2"
                  placeholder="针对混淆/异或加密图片数据的解密脚本"
                  class="sharp-textarea code-textarea"
                />
              </el-form-item>
            </div>
          </div>
        </el-form>
      </div>

      <!-- 原始 JSON 代码编辑 -->
      <div v-show="activeSection === 'json'" class="json-pane">
        <div class="json-actions">
          <span class="json-tip">可以直接编辑或粘贴书源的标准 Legado JSON 对象：</span>
          <el-button size="small" @click="formatJson" class="sharp-btn">格式化 JSON</el-button>
        </div>
        <el-input
          v-model="jsonText"
          type="textarea"
          :rows="24"
          placeholder="在此编辑书源 JSON..."
          class="json-textarea sharp-textarea"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { CopyDocument } from '@element-plus/icons-vue'
import type { BookSource } from '@/source/types/BookSource'
import { convertBookSourceXPath } from '@/source/engine/XPathConverter'

const props = withDefaults(
  defineProps<{
    source: BookSource | null
    isNew?: boolean
    groupOptions?: string[]
  }>(),
  {
    isNew: false,
    groupOptions: () => [],
  }
)

const emit = defineEmits<{
  (e: 'save', source: BookSource): void
}>()

export type EditableBookSource = BookSource & {
  ruleSearch: NonNullable<BookSource['ruleSearch']>
  ruleExplore: Record<string, string | undefined>
  ruleBookInfo: NonNullable<BookSource['ruleBookInfo']>
  ruleToc: NonNullable<BookSource['ruleToc']>
  ruleContent: NonNullable<BookSource['ruleContent']>
}

type EditSection = 'base' | 'search' | 'explore' | 'info' | 'toc' | 'content' | 'json'
const activeSection = ref<EditSection>('base')
const previousSection = ref<EditSection>('base')
const activeAdvancedSections = ref<string[]>([])
const formData = ref<EditableBookSource | null>(null)
const jsonText = ref('')
type SelectToggleInstance = {
  expanded: boolean
  blur: () => void
}
const bookSourceGroupSelectRef = ref<SelectToggleInstance | null>(null)
let suppressBookSourceGroupSelectClick = false

function handleBookSourceGroupSelectMouseDown(event: MouseEvent) {
  if (!(event.target instanceof HTMLInputElement) || !bookSourceGroupSelectRef.value?.expanded) return

  suppressBookSourceGroupSelectClick = true
  event.preventDefault()
  bookSourceGroupSelectRef.value.blur()
}

function handleBookSourceGroupSelectClick(event: MouseEvent) {
  if (!suppressBookSourceGroupSelectClick) return
  suppressBookSourceGroupSelectClick = false
  event.stopImmediatePropagation()
}

function cloneSource(src: BookSource | null): EditableBookSource | null {
  if (!src) return null
  const cloned = JSON.parse(JSON.stringify(src))
  if (!cloned.ruleSearch) cloned.ruleSearch = {}
  if (!cloned.ruleExplore) cloned.ruleExplore = {}
  if (!cloned.ruleBookInfo) cloned.ruleBookInfo = {}
  if (!cloned.ruleToc) cloned.ruleToc = {}
  if (!cloned.ruleContent) cloned.ruleContent = {}

  if (cloned.bookSourceType === undefined) cloned.bookSourceType = 0
  if (cloned.enabled === undefined) cloned.enabled = true
  if (cloned.enabledExplore === undefined) cloned.enabledExplore = true
  if (cloned.enabledCookieJar === undefined) cloned.enabledCookieJar = false
  if (cloned.useWebView === undefined) cloned.useWebView = false

  return cloned as EditableBookSource
}

/**
 * 清理各规则中未填写的空字符串字段，保持输出的 JSON 清爽精炼
 */
function cleanEmptyRules(src: BookSource | null): BookSource {
  if (!src) return {} as BookSource
  const cloned: any = JSON.parse(JSON.stringify(src))

  const ruleSections = ['ruleSearch', 'ruleExplore', 'ruleBookInfo', 'ruleToc', 'ruleContent']
  for (const section of ruleSections) {
    if (cloned[section] && typeof cloned[section] === 'object') {
      for (const [key, value] of Object.entries(cloned[section])) {
        if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
          delete cloned[section][key]
        }
      }
      // 若发现规则对象为空，则不输出该键
      if (section === 'ruleExplore' && Object.keys(cloned[section]).length === 0) {
        delete cloned[section]
      }
    }
  }

  const optionalTopLevelStrings = [
    'bookSourceGroup',
    'header',
    'bookSourceComment',
    'loginUrl',
    'loginUi',
    'loginCheckJs',
    'coverDecodeJs',
    'bookUrlPattern',
    'concurrentRate',
    'exploreUrl',
    'jsLib',
    'mainJs',
  ]
  for (const field of optionalTopLevelStrings) {
    if (typeof cloned[field] === 'string' && cloned[field].trim() === '') {
      delete cloned[field]
    }
  }

  return cloned as BookSource
}

function resolveAdvancedSections(source: BookSource): string[] {
  const sections: string[] = []
  if ([source.header, source.concurrentRate, source.loginUrl, source.bookUrlPattern]
    .some(value => typeof value === 'string' && value.trim())) {
    sections.push('network')
  }
  if (typeof source.bookSourceComment === 'string' && source.bookSourceComment.trim()) {
    sections.push('notes')
  }
  return sections
}

watch(
  () => props.source,
  newSource => {
    if (newSource) {
      formData.value = cloneSource(newSource)
      const cleaned = cleanEmptyRules(newSource)
      jsonText.value = JSON.stringify(cleaned, null, 2)
      activeAdvancedSections.value = resolveAdvancedSections(newSource)
    }
  },
  { immediate: true }
)

const handleSectionChange = (tabName: string | number) => {
  if (tabName === 'json') {
    if (formData.value) {
      const cleaned = cleanEmptyRules(formData.value)
      jsonText.value = JSON.stringify(cleaned, null, 2)
    }
  } else if (previousSection.value === 'json') {
    try {
      const parsed = JSON.parse(jsonText.value)
      formData.value = cloneSource(parsed)
    } catch {
      ElMessage.warning('当前 JSON 格式有误，未应用到表单')
    }
  }
  previousSection.value = String(tabName) as EditSection
}

const copySearchToExplore = () => {
  if (!formData.value) return
  formData.value.ruleExplore = JSON.parse(JSON.stringify(formData.value.ruleSearch || {}))
  ElMessage.success('已将搜索规则成功复制到发现规则')
}

const handleReset = () => {
  if (props.source) {
    formData.value = cloneSource(props.source)
    const cleaned = cleanEmptyRules(props.source)
    jsonText.value = JSON.stringify(cleaned, null, 2)
    activeAdvancedSections.value = resolveAdvancedSections(props.source)
    ElMessage.info('已恢复至当前书源初始内容')
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const handleConvertToCss = async () => {
  if (activeSection.value === 'json') {
    try {
      formData.value = cloneSource(JSON.parse(jsonText.value))
    } catch {
      ElMessage.error('当前 JSON 格式有误，请先修正后再执行转换')
      return
    }
  }

  if (!formData.value) return

  try {
    await ElMessageBox.confirm(
      '确定要将当前书源中的 XPath 规则批量转换为 CSS 选择器吗？\n复杂或无法等价转换的规则将自动保留原样。未保存前可点击“重置”按钮恢复初始状态。',
      'XPath 转 CSS 规则优化',
      {
        confirmButtonText: '确认转换',
        cancelButtonText: '取消',
        type: 'info',
      }
    )
  } catch {
    return
  }

  const summary = convertBookSourceXPath(formData.value)

  if (summary.convertedCount === 0 && summary.skippedCount === 0) {
    ElMessage.info('未在当前书源中检测到 XPath 规则')
    return
  }

  if (summary.convertedCount === 0 && summary.skippedCount > 0) {
    ElMessage.warning(`检测到 ${summary.skippedCount} 处 XPath 规则，但均包含不支持的复杂语法，已保持原样`)
    return
  }

  formData.value = cloneSource(summary.source)
  const cleaned = cleanEmptyRules(summary.source)
  jsonText.value = JSON.stringify(cleaned, null, 2)

  const detailItems = summary.details.map(
    d => `<li><b>${escapeHtml(d.field)}</b>: <code>${escapeHtml(d.from)}</code> &rarr; <code style="color: #67c23a;">${escapeHtml(d.to)}</code></li>`
  ).join('')

  const skippedItems = summary.skipped.map(
    s => `<li><b>${escapeHtml(s.field)}</b>: <code>${escapeHtml(s.rule)}</code> <span style="color: #e6a23c;">(${escapeHtml(s.reason)})</span></li>`
  ).join('')

  let messageHtml = `<div style="font-size: 13px; line-height: 1.6;">
    <p style="margin-bottom: 6px;">成功转换 <b>${summary.convertedCount}</b> 处规则${summary.skippedCount > 0 ? `，跳过 <b>${summary.skippedCount}</b> 处` : ''}：</p>
    <ul style="padding-left: 18px; margin: 4px 0 8px 0; max-height: 160px; overflow-y: auto;">${detailItems}</ul>`

  if (summary.skippedCount > 0) {
    messageHtml += `<p style="margin: 6px 0 4px 0; color: #909399;">跳过的规则（已保留）：</p>
      <ul style="padding-left: 18px; margin: 0; max-height: 100px; overflow-y: auto;">${skippedItems}</ul>`
  }

  messageHtml += `<p style="margin-top: 8px; color: #909399; font-size: 12px;">提示：修改已更新至编辑区，点击“保存修改”以生效，或点击“重置”放弃。</p></div>`

  ElNotification({
    title: 'XPath 转 CSS 完成',
    dangerouslyUseHTMLString: true,
    message: messageHtml,
    type: 'success',
    duration: 8000,
  })
}

const formatJson = () => {
  try {
    const parsed = JSON.parse(jsonText.value)
    jsonText.value = JSON.stringify(parsed, null, 2)
    ElMessage.success('已格式化')
  } catch {
    ElMessage.error('JSON 语法错误，无法格式化')
  }
}

const handleSave = () => {
  let targetSource: BookSource

  if (activeSection.value === 'json') {
    try {
      targetSource = JSON.parse(jsonText.value)
    } catch {
      ElMessage.error('JSON 语法错误，请检查后再保存')
      return
    }
  } else {
    targetSource = cleanEmptyRules(formData.value)
  }

  if (!targetSource.bookSourceName?.trim()) {
    ElMessage.warning('请输入书源名称')
    return
  }

  if (!targetSource.bookSourceUrl?.trim()) {
    ElMessage.warning('请输入书源基础 URL')
    return
  }

  emit('save', targetSource)
}

defineExpose({
  save: handleSave,
  reset: handleReset,
  convertToCss: handleConvertToCss,
  getFormData: () => {
    if (activeSection.value === 'json') {
      try {
        return JSON.parse(jsonText.value)
      } catch {
        return cleanEmptyRules(formData.value)
      }
    }
    return cleanEmptyRules(formData.value)
  },
})
</script>

<style scoped>
.source-edit-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.edit-navigation {
  flex-shrink: 0;
  margin-bottom: 12px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  padding: 0 12px;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.form-pane {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1360px;
  margin: 0 auto;
}

.sub-rule-tabs :deep(.el-tabs__header) {
  margin: 0;
  border-bottom: none;
}

.sub-rule-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.sub-rule-tabs :deep(.el-tabs__nav-wrap) { overflow-x: auto; }

.sub-rule-tabs :deep(.el-tabs__item) {
  font-size: 13px;
  font-weight: 500;
  height: 38px;
  line-height: 38px;
  padding: 0 16px;
}

.sub-tab-pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-section {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-radius: 0 !important;
  padding: 16px 20px;
}

.form-section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 14px;
  padding-left: 8px;
  border-left: 3px solid var(--el-color-primary);
}

.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-grid-basic {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(180px, .8fr);
  gap: 16px;
}

.form-switches-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.setting-tile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 62px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}

.setting-tile > div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.setting-tile strong { color: var(--el-text-color-primary); font-size: 13px; }
.setting-tile span { color: var(--el-text-color-secondary); font-size: 11.5px; line-height: 1.35; }

.advanced-config-collapse {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color);
  border-bottom: 0;
}

.advanced-config-collapse :deep(.el-collapse-item__header) {
  gap: 10px;
  min-height: 48px;
  padding: 0 16px;
  background: var(--el-fill-color-light);
}

.advanced-config-collapse :deep(.el-collapse-item__wrap) { background: var(--el-bg-color-overlay); }
.advanced-config-collapse :deep(.el-collapse-item__content) { padding-bottom: 0; }
.collapse-summary { margin-left: 8px; color: var(--el-text-color-secondary); font-size: 12px; font-weight: 400; }
.advanced-config-body { padding: 16px 20px 2px; }
.field-help { margin-top: 5px; color: var(--el-text-color-secondary); font-size: 11.5px; line-height: 1.4; }
.field-help code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

.helper-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  margin-top: 6px;
}

.helper-hint code {
  background: var(--el-fill-color);
  padding: 2px 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.code-textarea :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  border-radius: 0 !important;
}

.json-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 1360px;
  margin: 0 auto;
}

.json-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.json-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.json-textarea :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  border-radius: 0 !important;
}

@media screen and (max-width: 767px) {
  .form-grid-2,
  .form-grid-basic,
  .form-switches-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .form-section { padding: 14px 12px; }
  .advanced-config-body { padding: 14px 12px 2px; }
  .collapse-summary { display: none; }
  .sub-rule-tabs :deep(.el-tabs__item) { padding: 0 12px; }
}
</style>

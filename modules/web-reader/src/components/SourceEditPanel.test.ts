import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('SourceEditPanel.vue 结构与字段完整性测试', () => {
  const panelPath = resolve(__dirname, './SourceEditPanel.vue')

  it('SourceEditPanel.vue 文件存在', () => {
    expect(existsSync(panelPath)).toBe(true)
  })

  it('具备完整的 6 个二级子分类 Tabs', () => {
    const content = readFileSync(panelPath, 'utf-8')
    expect(content).toContain('name="base"')
    expect(content).toContain('name="search"')
    expect(content).toContain('name="explore"')
    expect(content).toContain('name="info"')
    expect(content).toContain('name="toc"')
    expect(content).toContain('name="content"')
    expect(content).toContain('name="json"')
    expect(content).not.toContain('label="表单配置"')
  })

  it('基本设置包含书源类型、CF WebView 穿透及网络配置', () => {
    const content = readFileSync(panelPath, 'utf-8')
    expect(content).toContain('v-model="formData.bookSourceType"')
    expect(content).toContain('v-model="formData.useWebView"')
    expect(content).toContain('v-model="formData.enabledExplore"')
    expect(content).toContain('v-model="formData.enabledCookieJar"')
    expect(content).toContain('v-model="formData.header"')
    expect(content).toContain('v-model="formData.concurrentRate"')
    expect(content).toContain('v-model="formData.loginUrl"')
    expect(content).toContain('v-model="formData.bookUrlPattern"')
    expect(content).toContain('v-model="formData.bookSourceComment"')
  })

  it('按自然语言与规则语义分离 UI 字体和代码字体', () => {
    const content = readFileSync(panelPath, 'utf-8')
    expect(content).toContain(`:class="{ 'rule-font-fields': activeSection !== 'base' }"`)
    expect(content).toMatch(/v-model="formData\.bookSourceName"[^>]+class="sharp-input"/)
    expect(content).not.toMatch(/v-model="formData\.bookSourceName"[^>]+code-input/)
    expect(content).not.toMatch(/v-model="formData\.bookSourceComment"[^>]+code-input/)
    expect(content).toMatch(/v-model="formData\.bookSourceUrl"[^>]+code-input/)
    expect(content).toMatch(/v-model="formData\.concurrentRate"[^>]+code-input/)
    expect(content).toContain("font-feature-settings: 'calt' 0, 'liga' 0")
    expect(content).toContain('font-variant-ligatures: none')
  })

  it('详情页规则包含此前缺失的 intro、author、coverUrl 等全部核心字段', () => {
    const content = readFileSync(panelPath, 'utf-8')
    expect(content).toContain('v-model="formData.ruleBookInfo.intro"')
    expect(content).toContain('v-model="formData.ruleBookInfo.author"')
    expect(content).toContain('v-model="formData.ruleBookInfo.coverUrl"')
    expect(content).toContain('v-model="formData.ruleBookInfo.kind"')
    expect(content).toContain('v-model="formData.ruleBookInfo.lastChapter"')
    expect(content).toContain('v-model="formData.ruleBookInfo.updateTime"')
    expect(content).toContain('v-model="formData.ruleBookInfo.wordCount"')
    expect(content).toContain('v-model="formData.ruleBookInfo.init"')
    expect(content).toContain('v-model="formData.ruleBookInfo.downloadUrls"')
    expect(content).toContain('v-model="formData.ruleBookInfo.canReName"')
  })

  it('目录页规则包含翻页 nextTocUrl、分卷与脚本', () => {
    const content = readFileSync(panelPath, 'utf-8')
    expect(content).toContain('v-model="formData.ruleToc.nextTocUrl"')
    expect(content).toContain('v-model="formData.ruleToc.isVolume"')
    expect(content).toContain('v-model="formData.ruleToc.isVip"')
    expect(content).toContain('v-model="formData.ruleToc.isPay"')
    expect(content).toContain('v-model="formData.ruleToc.formatJs"')
    expect(content).toContain('v-model="formData.ruleToc.preUpdateJs"')
  })

  it('正文页规则包含标题、副内容、动态渲染与漫画样式/解密', () => {
    const content = readFileSync(panelPath, 'utf-8')
    expect(content).toContain('v-model="formData.ruleContent.title"')
    expect(content).toContain('v-model="formData.ruleContent.subContent"')
    expect(content).toContain('v-model="formData.ruleContent.replaceRegex"')
    expect(content).toContain('v-model="formData.ruleContent.webJs"')
    expect(content).toContain('v-model="formData.ruleContent.imageStyle"')
    expect(content).toContain('v-model="formData.ruleContent.imageDecode"')
  })

  it('发现规则包含快捷复制搜索规则功能', () => {
    const content = readFileSync(panelPath, 'utf-8')
    expect(content).toContain('copySearchToExplore')
    expect(content).toContain('v-model="formData.exploreUrl"')
    expect(content).toContain('v-model="formData.ruleExplore.bookList"')
  })

  it('支持 cleanEmptyRules 自动过滤保存时的空字段', () => {
    const content = readFileSync(panelPath, 'utf-8')
    expect(content).toContain('function cleanEmptyRules(')
    expect(content).toContain('cleanEmptyRules(formData.value)')
  })

  it('高级配置按已有字段自动展开，并向父级暴露统一工具方法', () => {
    const content = readFileSync(panelPath, 'utf-8')
    expect(content).toContain('resolveAdvancedSections')
    expect(content).toContain('activeAdvancedSections')
    expect(content).toContain('save: handleSave')
    expect(content).toContain('reset: handleReset')
    expect(content).toContain('convertToCss: handleConvertToCss')
  })

  it('表单可变输入框与普通输入框同样式并严格按内容行数增高', () => {
    const content = readFileSync(panelPath, 'utf-8')
    expect(content.match(/:autosize="\{ minRows: 1 \}"/g)).toHaveLength(14)
    expect(content.match(/class="sharp-input auto-height-input/g)).toHaveLength(14)
    expect(content).not.toContain('maxRows')
    expect(content).toContain('overflow-y: hidden !important')
    expect(content).toContain('wrap="soft"')
    expect(content).toContain('v-model="jsonText"\n          type="textarea"\n          :rows="24"')

    const theme = readFileSync(resolve(__dirname, '../assets/styles/element-theme.css'), 'utf-8')
    expect(theme).toContain('html.dark .auto-height-input .el-textarea__inner')
    expect(theme).toContain('background-color: #303030 !important')
  })
})

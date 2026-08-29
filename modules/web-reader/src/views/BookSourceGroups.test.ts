import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8')

describe('书源分组交互', () => {
  const view = source('./BookSourcesView.vue')
  const editor = source('../components/SourceEditPanel.vue')
  const sidebar = source('../components/BookSourceSidebar.vue')

  it('导入和编辑均支持选择已有分组或输入新分组', () => {
    expect(view).toContain('v-model="importGroup"')
    expect(view).toContain('选择已有分组或输入新分组')
    expect(view).toContain('importPreparedSources(\n      preview,\n      useSourceReplacement.value,\n      importGroup.value,')
    expect(editor).toContain('v-model="formData.bookSourceGroup"')
    expect(editor).toContain('filterable')
    expect(editor).toContain('allow-create')
    expect(editor).toContain('groupOptions')
  })

  it('顶部筛选框会下拉显示分组，选中后按该分组筛选', () => {
    expect(sidebar).toContain('<el-autocomplete')
    expect(sidebar).toContain(':fetch-suggestions="querySourceGroups"')
    expect(sidebar).toContain('@select="handleGroupSelect"')
    expect(sidebar).toContain("emit('group-filter', item.value)")
    expect(sidebar).not.toContain('handleGroupCommand')
    expect(view).toContain('const selectedSourceGroup = ref<string | null>(null)')
    expect(view).toContain('selectedSourceGroup.value === null')
    expect(view).toContain("'group-filter': handleSourceGroupFilter")
  })
})

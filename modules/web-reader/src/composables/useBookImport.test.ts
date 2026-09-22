import { describe, expect, it } from 'vitest'
import { selectSupportedBookFiles } from './useBookImport'

const namedFile = (name: string) => ({ name }) as File

describe('电子书导入文件筛选', () => {
  it('仅保留 TXT 与 EPUB，且扩展名不区分大小写', () => {
    const selected = selectSupportedBookFiles([
      namedFile('一封信.TXT'),
      namedFile('小说.epub'),
      namedFile('封面.png'),
      namedFile('无扩展名'),
    ])

    expect(selected.map(file => file.name)).toEqual(['一封信.TXT', '小说.epub'])
  })
})

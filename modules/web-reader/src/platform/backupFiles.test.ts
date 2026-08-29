// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import packageInfo from '../../package.json'
import { getAppVersion } from './appInfo'
import { chooseBackupFile, saveBackupFile } from './backupFiles'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('Web 本地备份文件适配', () => {
  it('读取用户选择的 ZIP 文件', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4])
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      Object.defineProperty(this, 'files', {
        configurable: true,
        value: [{ name: 'backup.zip', arrayBuffer: async () => bytes.buffer }],
      })
      this.dispatchEvent(new Event('change'))
    })

    const selected = await chooseBackupFile()

    expect(selected?.path).toBe('backup.zip')
    expect([...selected!.bytes]).toEqual([...bytes])
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('通过浏览器下载生成的 ZIP', async () => {
    const createObjectURL = vi.fn(() => 'blob:backup')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await expect(saveBackupFile(new Uint8Array([1, 2, 3]), 'backup.zip')).resolves.toBe('backup.zip')

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:backup')
  })

  it('Web 备份清单使用当前前端版本号', async () => {
    await expect(getAppVersion()).resolves.toBe(packageInfo.version)
  })
})

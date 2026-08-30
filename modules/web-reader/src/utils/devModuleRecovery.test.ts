// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDevModuleRecovery, recoverTransientDevModuleFailure } from './devModuleRecovery'

describe('Vite 模块预构建恢复', () => {
  beforeEach(() => clearDevModuleRecovery())

  it('仅在开发模式为模块导入失败触发一次刷新', () => {
    const reload = vi.fn()
    const error = new TypeError('Importing a module script failed.')

    expect(recoverTransientDevModuleFailure(error, { dev: true, now: 100, reload })).toBe(true)
    expect(recoverTransientDevModuleFailure(error, { dev: true, now: 101, reload })).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('不吞掉正式构建或非模块加载错误', () => {
    const reload = vi.fn()

    expect(recoverTransientDevModuleFailure(
      new TypeError('Importing a module script failed.'), { dev: false, reload },
    )).toBe(false)
    expect(recoverTransientDevModuleFailure(new Error('database failed'), {
      dev: true, reload,
    })).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { runSourceAuditCliIfRequested } from './SourceAuditBootstrap'
import type { SourceAuditCliBridge, SourceAuditCliOptions } from './SourceAuditCliTypes'

const options: SourceAuditCliOptions = {
  outputPath: '/tmp/report.json', mode: 'quick', concurrency: 1, scope: 'enabled',
}

function createBridge(overrides: Partial<SourceAuditCliBridge> = {}): SourceAuditCliBridge {
  return {
    getOptions: vi.fn(async () => null),
    markStarted: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    exit: vi.fn(async () => undefined),
    loadReplayBundle: vi.fn(),
    completeReplay: vi.fn(),
    loadSources: vi.fn(),
    complete: vi.fn(),
    ...overrides,
  }
}

describe('书源审计前端启动器', () => {
  it('普通客户端不加载审计模块', async () => {
    const bridge = createBridge()
    const loadCli = vi.fn()

    await expect(runSourceAuditCliIfRequested({ desktop: true, bridge, loadCli })).resolves.toBe(false)
    expect(loadCli).not.toHaveBeenCalled()
  })

  it('先标记接管再运行审计模块', async () => {
    const runSourceAuditCli = vi.fn(async () => undefined)
    const calls: string[] = []
    const bridge = createBridge({
      getOptions: vi.fn(async () => {
        calls.push('getOptions')
        return options
      }),
      markStarted: vi.fn(async () => {
        calls.push('markStarted')
      }),
    })

    await expect(runSourceAuditCliIfRequested({
      desktop: true, bridge, loadCli: async () => ({ runSourceAuditCli }),
    })).resolves.toBe(true)

    expect(calls).toEqual(['getOptions', 'markStarted'])
    expect(runSourceAuditCli).toHaveBeenCalledWith(options)
  })

  it('模块加载失败时写错误报告并结束审计，不把异常交给存储错误页', async () => {
    const bridge = createBridge({ getOptions: vi.fn(async () => options) })

    await expect(runSourceAuditCliIfRequested({
      desktop: true, bridge,
      recoverModuleFailure: () => false,
      loadCli: async () => { throw new TypeError('Importing a module script failed.') },
    })).resolves.toBe(true)

    expect(bridge.fail).toHaveBeenCalledWith(
      '书源审计前端启动失败: Importing a module script failed.',
    )
  })

  it('错误报告命令不可用时回退为退出码 2', async () => {
    const bridge = createBridge({
      getOptions: vi.fn(async () => options),
      fail: vi.fn(async () => {
        throw new Error('IPC failed')
      }),
    })

    await runSourceAuditCliIfRequested({
      desktop: true, bridge,
      recoverModuleFailure: () => false,
      loadCli: async () => { throw new Error('load failed') },
    })

    expect(bridge.exit).toHaveBeenCalledWith(2)
  })
})

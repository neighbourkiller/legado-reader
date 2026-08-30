// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { runSourceAuditCliIfRequested } from './SourceAuditBootstrap'
import type { SourceAuditCliOptions } from './SourceAuditCli'

const options: SourceAuditCliOptions = {
  outputPath: '/tmp/report.json', mode: 'quick', concurrency: 1, scope: 'enabled',
}

describe('书源审计前端启动器', () => {
  it('普通客户端不加载审计模块', async () => {
    const invoke = vi.fn(async () => null)
    const loadCli = vi.fn()

    await expect(runSourceAuditCliIfRequested({ desktop: true, invoke, loadCli })).resolves.toBe(false)
    expect(loadCli).not.toHaveBeenCalled()
  })

  it('先标记接管再运行审计模块', async () => {
    const runSourceAuditCli = vi.fn(async () => undefined)
    const invoke = vi.fn(async command => command === 'get_source_audit_cli_options' ? options : undefined)

    await expect(runSourceAuditCliIfRequested({
      desktop: true, invoke, loadCli: async () => ({ runSourceAuditCli }),
    })).resolves.toBe(true)

    expect(invoke.mock.calls.map(call => call[0])).toEqual([
      'get_source_audit_cli_options', 'mark_source_audit_cli_started',
    ])
    expect(runSourceAuditCli).toHaveBeenCalledWith(options)
  })

  it('模块加载失败时写错误报告并结束审计，不把异常交给存储错误页', async () => {
    const invoke = vi.fn(async command => command === 'get_source_audit_cli_options' ? options : undefined)

    await expect(runSourceAuditCliIfRequested({
      desktop: true,
      invoke,
      recoverModuleFailure: () => false,
      loadCli: async () => { throw new TypeError('Importing a module script failed.') },
    })).resolves.toBe(true)

    expect(invoke).toHaveBeenCalledWith('fail_source_audit_cli', {
      message: '书源审计前端启动失败: Importing a module script failed.',
    })
  })

  it('错误报告命令不可用时回退为退出码 2', async () => {
    const invoke = vi.fn(async command => {
      if (command === 'get_source_audit_cli_options') return options
      if (command === 'fail_source_audit_cli') throw new Error('IPC failed')
      return undefined
    })

    await runSourceAuditCliIfRequested({
      desktop: true,
      invoke,
      recoverModuleFailure: () => false,
      loadCli: async () => { throw new Error('load failed') },
    })

    expect(invoke).toHaveBeenCalledWith('exit_source_audit_cli', { code: 2 })
  })
})

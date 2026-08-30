import { invoke } from '@tauri-apps/api/core'
import { clearDevModuleRecovery, recoverTransientDevModuleFailure } from '@/utils/devModuleRecovery'
import type { SourceAuditCliOptions } from './SourceAuditCli'

type AuditInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

interface SourceAuditBootstrapDependencies {
  desktop?: boolean
  invoke?: AuditInvoke
  loadCli?: () => Promise<{
    runSourceAuditCli: (options: SourceAuditCliOptions) => Promise<void>
  }>
  recoverModuleFailure?: (error: unknown) => boolean
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 2_000)
}

async function reportAuditBootstrapFailure(call: AuditInvoke, error: unknown) {
  const message = `书源审计前端启动失败: ${safeErrorMessage(error)}`
  try {
    await call('fail_source_audit_cli', { message })
  } catch {
    try {
      await call('exit_source_audit_cli', { code: 2 })
    } catch {
      // Rust 启动看门狗仍会终止未成功接管的审计进程。
    }
  }
}

/**
 * 在普通存储和 Vue 应用初始化之前识别审计模式。
 * 小型启动器先通知 Rust，再动态加载审计引擎；模块加载失败也必须写报告并退出。
 */
export async function runSourceAuditCliIfRequested(
  dependencies: SourceAuditBootstrapDependencies = {},
): Promise<boolean> {
  const desktop = dependencies.desktop ?? import.meta.env.VITE_APP_TARGET === 'desktop'
  if (!desktop) return false
  const call: AuditInvoke = dependencies.invoke || invoke
  const options = await call('get_source_audit_cli_options') as SourceAuditCliOptions | null
  if (!options) return false

  try {
    await call('mark_source_audit_cli_started')
    const cli = await (dependencies.loadCli || (() => import('./SourceAuditCli')))()
    clearDevModuleRecovery()
    await cli.runSourceAuditCli(options)
  } catch (error) {
    const recover = dependencies.recoverModuleFailure ?? recoverTransientDevModuleFailure
    if (recover(error)) return true
    await reportAuditBootstrapFailure(call, error)
  }
  return true
}

import { sourceAuditCliBridge } from '@/platform/sourceAuditCli'
import { clearDevModuleRecovery, recoverTransientDevModuleFailure } from '@/utils/devModuleRecovery'
import type { SourceAuditCliBridge, SourceAuditCliOptions } from './SourceAuditCliTypes'

interface SourceAuditBootstrapDependencies {
  desktop?: boolean
  bridge?: Pick<SourceAuditCliBridge, 'getOptions' | 'markStarted' | 'fail' | 'exit'>
  loadCli?: () => Promise<{
    runSourceAuditCli: (options: SourceAuditCliOptions) => Promise<void>
  }>
  recoverModuleFailure?: (error: unknown) => boolean
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 2_000)
}

async function reportAuditBootstrapFailure(
  bridge: Pick<SourceAuditCliBridge, 'fail' | 'exit'>,
  error: unknown,
) {
  const message = `书源审计前端启动失败: ${safeErrorMessage(error)}`
  try {
    await bridge.fail(message)
  } catch {
    try {
      await bridge.exit(2)
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
  const bridge = dependencies.bridge ?? sourceAuditCliBridge
  const options = await bridge.getOptions()
  if (!options) return false

  try {
    await bridge.markStarted()
    const cli = await (dependencies.loadCli || (() => import('./SourceAuditCli')))()
    clearDevModuleRecovery()
    await cli.runSourceAuditCli(options)
  } catch (error) {
    const recover = dependencies.recoverModuleFailure ?? recoverTransientDevModuleFailure
    if (recover(error)) return true
    await reportAuditBootstrapFailure(bridge, error)
  }
  return true
}

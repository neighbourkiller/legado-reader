import type { SourceAuditCliBridge } from '@/source/audit/SourceAuditCliTypes'
import { platform } from './capabilities'

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!platform.isDesktop) {
    throw new Error(`桌面审计命令不能在 Web 环境执行: ${command}`)
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export const sourceAuditCliBridge: SourceAuditCliBridge = {
  getOptions: () => invokeDesktop('get_source_audit_cli_options'),
  markStarted: () => invokeDesktop('mark_source_audit_cli_started'),
  fail: message => invokeDesktop('fail_source_audit_cli', { message }),
  exit: code => invokeDesktop('exit_source_audit_cli', { code }),
  loadReplayBundle: () => invokeDesktop('load_source_audit_replay_bundle'),
  completeReplay: result => invokeDesktop('complete_source_audit_replay', { result }),
  loadSources: () => invokeDesktop('load_source_audit_cli_sources'),
  complete: (run, diagnostics) => invokeDesktop('complete_source_audit_cli', { run, diagnostics }),
}

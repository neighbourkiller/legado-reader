import { sourceAuditCliBridge } from '@/platform/sourceAuditCli'
import { getAllBookSources } from '@/storage/db'
import { initializeStorage } from '@/storage/init'
import type { BookSource } from '@/source/types/BookSource'
import { SourceAuditRunner, summarizeSourceAuditRun } from './SourceAuditRunner'
import type { SourceAuditDiagnosticBundle } from './SourceAuditDiagnostics'
import { replaySourceAuditBundle } from './SourceAuditReplay'
import type { SourceAuditCliBridge, SourceAuditCliOptions } from './SourceAuditCliTypes'

export type { SourceAuditCliOptions } from './SourceAuditCliTypes'

function matchesScope(source: BookSource, scope: SourceAuditCliOptions['scope']) {
  if (scope === 'enabled') return source.enabled
  if (scope === 'text') return source.bookSourceType === 0
  if (scope === 'image') return source.bookSourceType === 2
  return true
}

function renderStatus(message: string) {
  const root = document.getElementById('app')
  if (!root) return
  root.textContent = message
  root.setAttribute('style', 'padding:24px;font-family:system-ui,sans-serif;white-space:pre-wrap')
}

/**
 * 在真实 Tauri WebView 中运行自动批测。
 * 输出路径只能来自 Rust 启动参数状态，前端不能任意指定文件系统位置。
 */
export async function runSourceAuditCli(
  options: SourceAuditCliOptions,
  bridge: SourceAuditCliBridge = sourceAuditCliBridge,
): Promise<void> {
  renderStatus('正在准备 Tauri 书源批测……')
  if (options.replayPath) {
    renderStatus('正在离线重放书源失败响应……')
    const bundle = await bridge.loadReplayBundle()
    const result = await replaySourceAuditBundle(bundle)
    await bridge.completeReplay(result)
    return
  }
  if (!options.dbPath) await initializeStorage()
  const rawSources = options.dbPath
    ? await bridge.loadSources()
    : await getAllBookSources()
  const sources = (rawSources as unknown as BookSource[]).filter(source => matchesScope(source, options.scope))
  if (sources.length === 0) throw new Error('指定范围内没有可测试书源')
  const runner = new SourceAuditRunner({
    mode: options.mode,
    concurrency: options.concurrency,
    captureDiagnostics: Boolean(options.diagnosticsDir),
    onUpdate: run => {
      const completed = run.entries.filter(entry => Object.values(entry.stages)
        .some(stage => stage?.status === 'passed' || stage?.status === 'failed')).length
      renderStatus(`正在执行 Tauri 书源批测……\n${completed} / ${run.entries.length}`)
    },
  })
  const run = await runner.run(sources)
  run.scope = options.scope
  run.summary = summarizeSourceAuditRun(run)
  const diagnostics: SourceAuditDiagnosticBundle | undefined = options.diagnosticsDir
    ? runner.createDiagnosticBundle(run, sources) : undefined
  renderStatus('批测完成，正在写入报告……')
  await bridge.complete(run, diagnostics)
}

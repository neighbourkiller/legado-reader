import { platform } from './capabilities'
import type { RuleExecutionContext } from '@/source/engine/RuleTypes'

export interface SourceScriptResult {
  result: unknown
  logs: string[]
  variables?: Record<string, string>
}

function bindings(context: RuleExecutionContext, result: unknown): Record<string, unknown> {
  return {
    source: context.source || null,
    book: context.book || null,
    chapter: context.chapter || null,
    key: context.key || '',
    page: context.page || 1,
    result,
    baseUrl: context.baseUrl || '',
    redirectUrl: context.redirectUrl || '',
    nextChapterUrl: context.nextChapterUrl || '',
    variables: Object.fromEntries(context.variables || []),
  }
}

export async function executeSourceJavaScript(
  sourceId: string,
  code: string,
  context: RuleExecutionContext,
  result: unknown,
): Promise<SourceScriptResult> {
  if (!platform.isDesktop) throw new Error('UNSUPPORTED_JAVASCRIPT: JavaScript 书源仅在 Tauri 客户端执行')
  const { invoke } = await import('@tauri-apps/api/core')
  const response = await invoke<SourceScriptResult>('execute_source_script', {
    request: { sourceId, code, bindings: bindings(context, result), timeoutMs: 3000 },
  })
  if (response.variables && context.variables) {
    for (const [k, v] of Object.entries(response.variables)) {
      context.variables.set(k, v)
    }
  }
  return response
}

export async function executeSourceWebJavaScript(
  sourceId: string,
  code: string,
  context: RuleExecutionContext,
  result: unknown,
): Promise<SourceScriptResult> {
  if (!platform.isDesktop) throw new Error('UNSUPPORTED_WEBJS: webJs 仅在 Tauri 客户端执行')
  if (!context.baseUrl) throw new Error('UNSUPPORTED_WEBJS: webJs 缺少页面 URL')
  const { invoke } = await import('@tauri-apps/api/core')
  const response = await invoke<{ result: unknown }>('execute_webview_script', {
    sourceId, url: context.baseUrl, code, bindings: bindings(context, result), timeoutMs: 10000,
  })
  return { result: response.result, logs: [] }
}

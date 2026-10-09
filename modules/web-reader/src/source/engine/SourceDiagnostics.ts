/** 仅供观察的阶段统计，不参与规则执行或结果修正。 */
export type PageEndReason = 'no-rule' | 'no-next' | 'repeat' | 'limit' | 'error' | 'script'

export interface SourceStageDiagnostic {
  stage: 'toc' | 'content'
  pages: number
  reason: PageEndReason
  parsed?: number
  filtered?: number
  deduplicated?: number
  finalCount?: number
  beforeReplace?: number
  afterReplace?: number
}

/** 观察者失败不能影响阅读、审计或规则执行。 */
export function notifyDiagnostic<T>(callback: ((event: T) => void) | undefined, event: T): void {
  try {
    const result: unknown = callback?.(event)
    if (result instanceof Promise) void result.catch(() => {})
  } catch { /* 诊断接收方故障不传播 */ }
}

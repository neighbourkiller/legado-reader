import { SourceTransportError, type SourceTransport, type SolveChallengeResponse } from '@/source/transport/SourceTransport'

export type ChallengeRecoveryPhase = 'navigating' | 'manual' | 'retrying'
export interface ChallengeRecoveryEvent {
  sourceId: string
  url: string
  phase: ChallengeRecoveryPhase
  message: string
}

interface Recovery {
  controller: AbortController
  promise: Promise<void>
  observers: Set<(event: ChallengeRecoveryEvent) => void>
  consumers: number
  opened: boolean
  closing?: Promise<void>
}

// 同一书源共用认证窗口；并发挑战只允许一次导航，避免打断正在进行的验证。
const recoveries = new WeakMap<SourceTransport, Map<string, Recovery>>()

export function throwIfSourceAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('书源请求已取消', 'AbortError')
}

function abortable<T>(action: () => Promise<T>, signal: AbortSignal, timeoutMs?: number): Promise<T> {
  throwIfSourceAborted(signal)
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
      clearTimeout(timer)
    }
    const onAbort = () => { cleanup(); reject(new DOMException('书源请求已取消', 'AbortError')) }
    signal.addEventListener('abort', onAbort, { once: true })
    if (timeoutMs !== undefined) timer = setTimeout(() => {
      cleanup()
      reject(new SourceTransportError('CHALLENGE_TIMEOUT', '网页验证等待超时，请完成验证后重试'))
    }, timeoutMs)
    Promise.resolve().then(() => { throwIfSourceAborted(signal); return action() })
      .then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}

async function runRecovery(
  transport: SourceTransport, sourceId: string, url: string, signal: AbortSignal,
  notify: (event: ChallengeRecoveryEvent) => void, isUsableHtml: (html: string) => boolean,
  windowOpened: () => void,
): Promise<void> {
  const emit = (phase: ChallengeRecoveryPhase, message: string) => notify({ sourceId, url, phase, message })
  emit('navigating', '检测到安全挑战，正在后台导航验证')
  let solved: SolveChallengeResponse | undefined
  let navigationError: unknown
  try {
    solved = await abortable(() => transport.solveChallenge!(sourceId, url, 5000), signal, 20_000)
  } catch (error) {
    throwIfSourceAborted(signal)
    navigationError = error
    emit('navigating', `后台导航验证未完成：${error instanceof Error ? error.message : String(error)}`)
  }
  if (solved?.success && solved.html && isUsableHtml(solved.html)) return
  if (!transport.openAuthWindow || !transport.inspectChallenge) {
    if (navigationError) throw navigationError
    throw new SourceTransportError('CHALLENGE_MANUAL_REQUIRED', '自动验证未通过，请打开网页验证窗口完成验证后重试')
  }

  const deadline = Date.now() + 60_000
  windowOpened()
  await abortable(() => transport.openAuthWindow!(sourceId, url, '书源安全验证'), signal, deadline - Date.now())
  emit('manual', '请在验证窗口完成验证；系统等待最多 60 秒，期间不会重新导航')
  while (Date.now() < deadline) {
    await abortable(() => new Promise(resolve => setTimeout(resolve, 500)), signal, deadline - Date.now())
    const inspected = await abortable(() => transport.inspectChallenge!(sourceId, url), signal, deadline - Date.now())
    if (inspected.success && inspected.html && isUsableHtml(inspected.html)) return
  }
  throw new SourceTransportError('CHALLENGE_TIMEOUT', '网页验证等待超时，请完成验证后重试')
}

export async function recoverSourceChallenge(
  transport: SourceTransport, sourceId: string, url: string,
  isUsableHtml: (html: string) => boolean,
  signal?: AbortSignal, observer?: (event: ChallengeRecoveryEvent) => void,
): Promise<() => Promise<void>> {
  throwIfSourceAborted(signal)
  let bySource = recoveries.get(transport)
  if (!bySource) { bySource = new Map(); recoveries.set(transport, bySource) }
  let recovery = bySource.get(sourceId)
  if (recovery?.controller.signal.aborted) {
    await recovery.closing
    throwIfSourceAborted(signal)
    recovery = bySource.get(sourceId)
  }
  if (!recovery) {
    const entry: Recovery = { controller: new AbortController(), promise: Promise.resolve(), observers: new Set(), consumers: 0, opened: false }
    entry.promise = Promise.resolve().then(() => runRecovery(transport, sourceId, url, entry.controller.signal,
      event => entry.observers.forEach(listener => listener(event)), isUsableHtml, () => { entry.opened = true }))
    // 全部调用方在认证启动前取消时，也要接住后台任务的 AbortError。
    void entry.promise.catch(() => {})
    bySource.set(sourceId, entry)
    recovery = entry
  }
  recovery.consumers++
  if (observer) recovery.observers.add(observer)
  const entry = recovery
  let released = false
  const release = async () => {
    if (released) return
    released = true
    signal?.removeEventListener('abort', onAbort)
    if (observer) entry.observers.delete(observer)
    entry.consumers--
    if (entry.consumers === 0) {
      entry.controller.abort()
      entry.closing = (async () => {
        await entry.promise.catch(() => {})
        // 所有认证后的原请求结束后才隐藏；失败或取消同样清理窗口。
        if (entry.opened && transport.closeAuthWindow) {
          await abortable(() => transport.closeAuthWindow!(sourceId), new AbortController().signal, 2000).catch(() => {})
        }
        if (bySource.get(sourceId) === entry) bySource.delete(sourceId)
      })()
      await entry.closing
    }
  }
  const onAbort = () => { void release() }
  try {
    await abortable(() => recovery.promise, signal || new AbortController().signal)
    throwIfSourceAborted(signal)
    signal?.addEventListener('abort', onAbort, { once: true })
    return release
  } catch (error) {
    await release()
    throw error
  }
}

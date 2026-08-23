import type { SourceRequest, SourceResponse, SourceTransport } from './SourceTransport'

export class TauriTransport implements SourceTransport {
  async request(req: SourceRequest): Promise<SourceResponse> {
    const { invoke } = await import('@tauri-apps/api/core')

    const res = await invoke<{
      status: number
      finalUrl: string
      headers: Record<string, string>
      body: number[]
      charset?: string
    }>('source_request', { request: req })

    return {
      ...res,
      body: new Uint8Array(res.body)
    }
  }
}

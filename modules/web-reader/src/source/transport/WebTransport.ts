import type { SourceRequest, SourceResponse, SourceTransport } from './SourceTransport'

export class WebTransport implements SourceTransport {
  async request(req: SourceRequest): Promise<SourceResponse> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), req.timeout || 10000)

    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.method === 'POST' ? req.body : undefined,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      const buffer = await response.arrayBuffer()
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      return {
        status: response.status,
        finalUrl: response.url,
        headers,
        body: new Uint8Array(buffer),
        charset: req.charset
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }
}

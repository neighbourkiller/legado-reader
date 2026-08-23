export interface SourceRequest {
  sourceId: string
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  charset?: string
  timeout?: number
}

export interface SourceResponse {
  status: number
  finalUrl: string
  headers: Record<string, string>
  body: Uint8Array
  charset?: string
}

export interface SourceTransport {
  request(req: SourceRequest): Promise<SourceResponse>
}

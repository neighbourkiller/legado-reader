import { platform } from '@/platform/capabilities'
import type { SourceTransport } from './SourceTransport'

let transportInstance: SourceTransport | null = null

export async function getTransport(): Promise<SourceTransport> {
  if (transportInstance) {
    return transportInstance
  }

  if (platform.isDesktop) {
    const { TauriTransport } = await import('./TauriTransport')
    transportInstance = new TauriTransport()
  } else {
    const { WebTransport } = await import('./WebTransport')
    transportInstance = new WebTransport()
  }

  return transportInstance
}

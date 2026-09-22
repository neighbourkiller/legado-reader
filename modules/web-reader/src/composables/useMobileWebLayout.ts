import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { platform } from '@/platform/capabilities'

export function resolveMobileWebLayout(isDesktop: boolean, isNarrow: boolean): boolean {
  return !isDesktop && isNarrow
}

export function useMobileWebLayout() {
  const isNarrowViewport = useMediaQuery('(max-width: 767px)')
  const isMobileWeb = computed(() =>
    resolveMobileWebLayout(platform.isDesktop, isNarrowViewport.value),
  )

  return {
    isMobileWeb,
    isNarrowViewport,
  }
}

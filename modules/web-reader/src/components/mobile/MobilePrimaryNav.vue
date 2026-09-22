<script setup lang="ts">
import { useRoute } from 'vue-router'
import type { MobileNavItem } from '@/mobile/navigation'

defineProps<{
  items: readonly MobileNavItem[]
}>()

const route = useRoute()

const isActive = (item: MobileNavItem) => route.name === item.name
</script>

<template>
  <nav class="mobile-primary-nav" aria-label="主要导航">
    <RouterLink
      v-for="item in items"
      :key="item.name"
      :to="item.to"
      class="mobile-primary-nav__item"
      :class="{ 'is-active': isActive(item) }"
      :aria-current="isActive(item) ? 'page' : undefined"
    >
      <span class="mobile-primary-nav__icon" aria-hidden="true">
        <component :is="item.icon" />
      </span>
      <span class="mobile-primary-nav__label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.mobile-primary-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1850;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  height: var(--mobile-primary-nav-total-height);
  padding: 0 12px env(safe-area-inset-bottom, 0px);
  border-top: 1px solid var(--mobile-border);
  background: var(--mobile-nav-background);
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
}

.mobile-primary-nav__item {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 56px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 12px;
  color: var(--mobile-text-muted);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}

.mobile-primary-nav__item::before {
  position: absolute;
  top: 5px;
  width: 24px;
  height: 3px;
  border-radius: 999px;
  background: var(--el-color-primary);
  content: '';
  opacity: 0;
  transform: scaleX(0.45);
  transition: opacity 160ms ease, transform 160ms ease;
}

.mobile-primary-nav__icon {
  display: grid;
  width: 25px;
  height: 25px;
  place-items: center;
  font-size: 23px;
}

.mobile-primary-nav__icon :deep(svg) {
  width: 1em;
  height: 1em;
}

.mobile-primary-nav__label {
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.mobile-primary-nav__item.is-active {
  color: var(--el-color-primary);
}

.mobile-primary-nav__item.is-active::before {
  opacity: 1;
  transform: scaleX(1);
}

.mobile-primary-nav__item:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -4px;
}

@media (prefers-reduced-motion: reduce) {
  .mobile-primary-nav__item::before {
    transition: none;
  }
}
</style>

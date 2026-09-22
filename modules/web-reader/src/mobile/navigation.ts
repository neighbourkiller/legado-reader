import type { Component } from 'vue'

export interface MobileNavItem {
  name: 'home' | 'bookshelf' | 'settings'
  label: string
  to: string
  icon: Component
}

import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
  },
  {
    path: '/bookshelf',
    name: 'bookshelf',
    component: () => import('@/views/BookshelfView.vue'),
  },
  {
    path: '/reader/:id',
    name: 'reader',
    component: () => import('@/views/ReaderView.vue'),
  },
  {
    path: '/book-detail',
    name: 'book-detail',
    component: () => import('@/views/BookDetailView.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
  },
  {
    path: '/settings/preferences',
    name: 'settings-preferences',
    redirect: {
      path: '/settings',
      query: { section: 'preferences' },
    },
  },
]

// 仅书源网络执行相关页面保持桌面专属。
if (import.meta.env.VITE_APP_TARGET === 'desktop') {
  routes.push(
    {
      path: '/book-sources',
      name: 'book-sources',
      component: () => import('@/views/BookSourcesView.vue'),
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/SearchView.vue'),
    },
  )
}

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router

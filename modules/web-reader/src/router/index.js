import { createRouter, createWebHashHistory } from 'vue-router';
const routes = [
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
];
// 桌面模式注册额外路由（书源管理、搜索等）
if (import.meta.env.VITE_APP_TARGET === 'desktop') {
    routes.push({
        path: '/book-sources',
        name: 'book-sources',
        component: () => import('@/views/BookSourcesView.vue'),
    }, {
        path: '/search',
        name: 'search',
        component: () => import('@/views/SearchView.vue'),
    });
}
const router = createRouter({
    history: createWebHashHistory(),
    routes,
});
export default router;

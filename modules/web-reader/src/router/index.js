import { createRouter, createWebHashHistory } from 'vue-router';
const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            path: '/',
            name: 'home',
            component: () => import('@/views/HomeView.vue')
        },
        {
            path: '/bookshelf',
            name: 'bookshelf',
            component: () => import('@/views/BookshelfView.vue')
        },
        {
            path: '/reader/:id',
            name: 'reader',
            component: () => import('@/views/ReaderView.vue')
        }
    ]
});
export default router;

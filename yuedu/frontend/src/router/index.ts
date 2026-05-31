import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'bookshelf',
      component: () => import('@/views/BookShelfPage.vue'),
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/SearchPage.vue'),
    },
    {
      path: '/book/:id',
      name: 'book-detail',
      component: () => import('@/views/BookDetailPage.vue'),
    },
    {
      path: '/read/:bookId/:chapterIndex',
      name: 'reader',
      component: () => import('@/views/ReaderPage.vue'),
    },
    {
      path: '/sources',
      name: 'sources',
      component: () => import('@/views/SourceManagePage.vue'),
    },
  ],
})

export default router

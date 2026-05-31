<template>
  <header class="app-header">
    <router-link to="/" class="logo">Yuedu Reader</router-link>
    <nav class="nav-links">
      <router-link to="/">书架</router-link>
      <router-link to="/search">搜索</router-link>
      <router-link to="/sources">书源</router-link>
    </nav>
  </header>
</template>

<style scoped>
.app-header { display: flex; align-items: center; padding: 0 16px; height: 48px; background: #1a1a2e; color: #eee; }
.logo { font-weight: bold; text-decoration: none; color: #eee; margin-right: 24px; }
.nav-links { display: flex; gap: 16px; }
.nav-links a { color: #aaa; text-decoration: none; }
.nav-links a.router-link-active { color: #fff; font-weight: bold; }
</style>

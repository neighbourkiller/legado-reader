<template>
  <el-config-provider>
    <div class="app-container">
      <el-header class="app-header" height="50px">
        <div class="logo">阅读</div>
        <nav class="nav-links">
          <router-link to="/">首页</router-link>
          <router-link to="/bookshelf">书架</router-link>
        </nav>
      </el-header>
      <el-main class="app-main">
        <router-view />
      </el-main>
    </div>
  </el-config-provider>
</template>

<script setup lang="ts">
</script>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-light);
  background-color: var(--el-bg-color);
  padding: 0 20px;
}
.logo {
  font-size: 20px;
  font-weight: bold;
  color: var(--el-color-primary);
}
.nav-links {
  display: flex;
  gap: 20px;
}
.nav-links a {
  text-decoration: none;
  color: var(--el-text-color-regular);
}
.nav-links a.router-link-active {
  color: var(--el-color-primary);
  font-weight: bold;
}
.app-main {
  flex: 1;
  overflow: hidden;
  padding: 0;
  background-color: var(--el-bg-color-page);
}
</style>

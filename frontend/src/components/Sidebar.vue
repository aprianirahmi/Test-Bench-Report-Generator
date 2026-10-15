<script setup>
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTheme } from "../composables/useTheme";
import { useAuthStore } from "../stores/auth";

const { isDark, toggleTheme } = useTheme();

defineProps({
  collapsed: { type: Boolean, default: false },
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

function handleLogout() {
  authStore.logout();
  router.push({ name: "login" });
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <div class="logo">
      <i class="pi pi-microchip"></i>
      <span v-if="!collapsed">ValveDAX</span>
    </div>

    <nav class="menu">
      <router-link to="/" class="menu-item" exact-active-class="active">
        <i class="pi pi-home"></i>
        <span v-if="!collapsed">Dashboard</span>
      </router-link>

      <router-link to="/repair-jobs" class="menu-item" :class="{ active: route.name === 'repair-jobs' }">
        <i class="pi pi-wrench"></i>
        <span v-if="!collapsed">Repair Job List</span>
      </router-link>

      <router-link
        :to="{ name: 'repair-job-details-search' }"
        class="menu-item"
        :class="{ active: route.name === 'repair-job-details-search' || route.name === 'repair-job-details' }">
        <i class="pi pi-info-circle"></i>
        <span v-if="!collapsed">Repair Job Details</span>
      </router-link>

      <router-link to="/records" class="menu-item" active-class="active">
        <i class="pi pi-database"></i>
        <span v-if="!collapsed">Records</span>
      </router-link>

      <router-link to="/report" class="menu-item" active-class="active">
        <i class="pi pi-file-pdf"></i>
        <span v-if="!collapsed">Generate Report</span>
      </router-link>

      <router-link
        to="/settings"
        class="menu-item"
        active-class="active"
        v-if="authStore.user?.role === 'admin'">
        <i class="pi pi-cog"></i>
        <span v-if="!collapsed">Settings</span>
      </router-link>
    </nav>

    <div class="sidebar-footer">
      <button class="menu-item" @click="toggleTheme">
        <i :class="isDark ? 'pi pi-sun' : 'pi pi-moon'"></i>
        <span v-if="!collapsed">{{ isDark ? "Light Mode" : "Dark Mode" }}</span>
      </button>
      <button class="menu-item" @click="handleLogout">
        <i class="pi pi-sign-out"></i>
        <span v-if="!collapsed">Logout</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 240px;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.2s ease;
  height: 100vh;
  position: sticky;
  top: 0;
}
.sidebar.collapsed {
  width: 64px;
}
.logo {
  height: 64px;
  min-height: 64px;
  max-height: 64px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0 1rem;
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--sidebar-text-active);
  border-bottom: 1px solid var(--border-color);
}
.menu {
  flex: 1;
  padding: 0.75rem 0.5rem;
  overflow-y: auto;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  color: var(--sidebar-text);
  text-decoration: none;
  background: none;
  border: none;
  font-size: 0.95rem;
  cursor: pointer;
  text-align: left;
}
.menu-item:hover {
  background: var(--sidebar-active-bg);
}
.menu-item.active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-text-active);
  font-weight: 600;
}
.menu-item.active {
  box-shadow: inset 3px 0 0 var(--rexroth-6);
}
.menu-item.active i {
  color: var(--rexroth-6);
}
.toggle-icon {
  margin-left: auto;
  transition: transform 0.2s;
  font-size: 0.75rem;
}
.toggle-icon.open {
  transform: rotate(180deg);
}
.submenu {
  display: flex;
  flex-direction: column;
  padding-left: 2.2rem;
}
.submenu-item {
  padding: 0.5rem 0.5rem;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.9rem;
  border-radius: 6px;
}
.submenu-item:hover {
  background: var(--sidebar-active-bg);
}
.submenu-item.active {
  color: var(--sidebar-text-active);
  font-weight: 600;
}
.sidebar-footer {
  padding: 0.75rem 0.5rem;
  border-top: 1px solid var(--border-color);
}
</style>

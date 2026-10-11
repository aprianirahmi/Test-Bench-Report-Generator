<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'

defineEmits(['toggle-sidebar'])

const route = useRoute()
const authStore = useAuthStore()

const roleLabel = computed(() => {
  const role = authStore.user?.role
  if (!role) return ''
  return role.charAt(0).toUpperCase() + role.slice(1)
})

const pageTitle = computed(() => {
  switch (route.name) {
    case 'dashboard': return 'Dashboard'
    case 'valve-list': return 'Valve Database'
    case 'valve-details-search':
    case 'valve-details': return 'Valve Details'
    case 'repair-jobs': return 'Repair Job List'
    case 'records': return 'Test Workspace'
    case 'settings': return 'System Settings'
    case 'generate-report': return 'Generate Report'
    default: return ''
  }
})
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
      <button class="icon-btn" @click="$emit('toggle-sidebar')">
        <i class="pi pi-bars"></i>
      </button>
      <h2 class="page-title">{{ pageTitle }}</h2>
    </div>

    <div class="topbar-right">
      <button class="icon-btn">
        <i class="pi pi-bell"></i>
      </button>
      <div class="profile">
        <i class="pi pi-user-circle"></i>
        <span>{{ roleLabel }}</span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  height: 64px;
  min-height: 64px;
  max-height: 64px;
  flex-shrink: 0;
  flex-grow: 0;
  box-sizing: border-box;
  background: var(--topbar-bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.25rem;
  position: sticky;
  top: 0;
  z-index: 10;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: 1.25rem;
}
.page-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--sidebar-text-active); /* Forces the text to be white/cyan depending on the theme */
  letter-spacing: -0.01em;
}
.icon-btn {
  background: none;
  border: none;
  font-size: 1.1rem;
  color: var(--sidebar-text);
  cursor: pointer;
  padding: 0.4rem;
  border-radius: 6px;
}
.icon-btn:hover {
  background: var(--sidebar-active-bg);
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.profile {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--sidebar-text-active);
  font-weight: 500;
}
.profile i {
  font-size: 1.6rem;
}
</style>
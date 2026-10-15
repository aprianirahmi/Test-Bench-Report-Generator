<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useRecordingStore } from '../stores/recording'

defineEmits(['toggle-sidebar'])

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// A recording keeps running on other pages; show it here so it is not forgotten.
const rec = useRecordingStore()
const { isRecording, sessionDialog, formattedClock, signalLost } = storeToRefs(rec)
const awayFromRecords = computed(() => route.name !== 'records')
const goToRecords = () => router.push({ name: 'records' })

const roleLabel = computed(() => {
  const role = authStore.user?.role
  if (!role) return ''
  return role.charAt(0).toUpperCase() + role.slice(1)
})

const pageTitle = computed(() => {
  switch (route.name) {
    case 'dashboard': return 'Dashboard'
    case 'repair-job-details-search':
    case 'repair-job-details': return 'Repair Job Details'
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
      <button
        v-if="awayFromRecords && isRecording"
        class="rec-pill"
        :class="{ lost: signalLost }"
        :title="signalLost ? 'Recording, but no sensor values are received (PLC connection lost). Open the Test Workspace.' : 'A recording is running. Open the Test Workspace.'"
        @click="goToRecords"
      >
        <span class="rec-dot"></span>
        REC {{ formattedClock }}
        <template v-if="signalLost"> &middot; NO SIGNAL</template>
      </button>
      <button
        v-else-if="awayFromRecords && sessionDialog"
        class="rec-pill done"
        title="The recording has finished. Open the Test Workspace to save or export it."
        @click="goToRecords"
      >
        <i class="pi pi-check-circle"></i>
        Recording finished, review
      </button>
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
.rec-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.7rem;
  border: 0;
  border-radius: 999px;
  background: #be090f;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  font-family: Consolas, Monaco, monospace;
  cursor: pointer;
  white-space: nowrap;
}
.rec-pill.lost {
  background: #b45309;
  animation: rec-alert 0.8s infinite alternate;
}
@keyframes rec-alert {
  from { box-shadow: 0 0 0 0 rgba(180, 83, 9, 0.7); }
  to { box-shadow: 0 0 0 6px rgba(180, 83, 9, 0); }
}
.rec-pill.done {
  background: #007aa0;
  font-family: inherit;
}
.rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  animation: rec-blink 1s infinite alternate;
}
@keyframes rec-blink {
  from { opacity: 0.25; }
  to { opacity: 1; }
}
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
<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useToast } from 'primevue/usetoast'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Sidebar from '../components/Sidebar.vue'
import Topbar from '../components/Topbar.vue'
import { useRecordingStore } from '../stores/recording'
import { formatDateTime } from '../utils/format'

const sidebarCollapsed = ref(true)

const router = useRouter()
const toast = useToast()
const rec = useRecordingStore()
const { signalEvent, draftInfo } = storeToRefs(rec)

// Signal loss during a recording is announced on every page, not only in the
// Test Workspace: the recording keeps running with empty values meanwhile.
watch(signalEvent, (e) => {
  if (!e) return
  if (e.type === 'lost') {
    toast.add({
      severity: 'error',
      summary: e.kind === 'plc_offline' ? 'PLC connection lost' : 'No sensor values received',
      detail:
        (e.kind === 'plc_offline'
          ? 'The PLC does not answer. '
          : 'The PLC answers but no sensor value can be read. ') +
        'The recording continues, but the samples stay empty until the signal returns.',
      life: 12000,
    })
  } else {
    toast.add({
      severity: 'success',
      summary: 'Signal restored',
      detail: `Sensor values are being recorded again. The gap lasted ${e.seconds} s.`,
      life: 6000,
    })
  }
})

// An unsaved recording left by a closed app or a power cut is offered for
// recovery as soon as the user is logged in.
const confirmingDiscard = ref(false)
onMounted(() => rec.checkDraft())
function recover() {
  if (rec.recoverDraft()) router.push({ name: 'records' })
}
async function discardDraft() {
  if (!confirmingDiscard.value) {
    confirmingDiscard.value = true
    return
  }
  await rec.discardDraft()
  confirmingDiscard.value = false
}
</script>

<template>
  <div class="main-layout">
    <Sidebar :collapsed="sidebarCollapsed" />
    <div class="content-area">
      <Topbar @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed" />
      <main class="page-content">
        <router-view />
      </main>
    </div>

    <Dialog :visible="!!draftInfo" modal :closable="false" header="Unsaved recording found" :style="{ width: '30rem' }">
      <div v-if="draftInfo" class="draft-body">
        <p>
          The app was closed before this recording was saved. {{ draftInfo.samples }} samples were kept
          ({{ draftInfo.state === 'recording' ? 'recording was still running' : 'recording had finished' }}).
        </p>
        <p class="draft-meta">
          Started {{ formatDateTime(draftInfo.startedAt) }} &middot; last saved {{ formatDateTime(draftInfo.savedAt) }}<br />
          {{ draftInfo.job ? `${draftInfo.job.job_number} — ${draftInfo.job.job_name}` : 'Manual testing (no reference)' }}
        </p>
        <p v-if="confirmingDiscard" class="draft-warn">Discarding deletes these samples for good. Press Discard again to confirm.</p>
      </div>
      <template #footer>
        <Button :label="confirmingDiscard ? 'Confirm Discard' : 'Discard'" icon="pi pi-trash" severity="danger" text @click="discardDraft" />
        <Button label="Recover" icon="pi pi-history" @click="recover" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.draft-body p { margin: 0 0 0.6rem; line-height: 1.45; }
.draft-meta { font-size: 0.85rem; color: var(--text-muted); }
.draft-warn { font-size: 0.85rem; color: #be090f; font-weight: 600; }
.main-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100vh;
  overflow: hidden;
}
.page-content {
  flex: 1;
  padding: 1.5rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
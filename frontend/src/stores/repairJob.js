import { defineStore } from 'pinia'

// Test source chosen in the Test Workspace, kept while the user moves
// between pages. testMode: 'repair_job' (needs selectedJob) or 'manual'.
export const useRepairJobStore = defineStore('repairJob', {
  state: () => ({
    selectedJob: null,
    testMode: 'repair_job',
  }),
  actions: {
    selectJob(job) {
      this.selectedJob = job
      if (job) this.testMode = 'repair_job'
    },
    setMode(mode) {
      this.testMode = mode
    },
  },
})

import { createRouter, createWebHistory } from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'

import DashboardView from '../views/DashboardView.vue'
import ValveListView from '../views/ValveListView.vue'
import ValveDetailsView from '../views/ValveDetailsView.vue'
import RepairJobListView from '../views/RepairJobListView.vue'
import RepairJobDetailsView from '../views/RepairJobDetailsView.vue'
import RecordsView from '../views/RecordsView.vue'
import SettingView from '../views/SettingView.vue'
import LoginView from '../views/LoginView.vue'
import { useAuthStore } from '../stores/auth'
import GenerateReport from '../views/GenerateReport.vue'



const routes = [
  {
    path: '/login',
    name: 'login',
    component: LoginView
  },
  {
    path: '/',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'dashboard', component: DashboardView },
      // Valve List / Valve Details are no longer in the menu. The routes stay
      // (reachable by URL only) so older records that point at a valve still work.
      { path: 'valves', name: 'valve-list', component: ValveListView },
      { path: 'valves/details', name: 'valve-details-search', component: ValveDetailsView },
      { path: 'valves/:id', name: 'valve-details', component: ValveDetailsView },
      { path: 'repair-jobs', name: 'repair-jobs', component: RepairJobListView },
      { path: 'repair-jobs/details', name: 'repair-job-details-search', component: RepairJobDetailsView },
      { path: 'repair-jobs/:id', name: 'repair-job-details', component: RepairJobDetailsView },
      { path: 'records', name: 'records', component: RecordsView },
      { path: 'settings', name: 'settings', component: SettingView, meta: { requiresAdmin: true } },
      { path: 'report', name: 'generate-report', component: GenerateReport },
    ]
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    next({ name: 'login' })
  } else if (to.name === 'login' && authStore.isLoggedIn) {
    next({ name: 'dashboard' })
  } else if (to.meta.requiresAdmin && !authStore.isAdmin) {
    next({ name: 'dashboard' }) 
  } else {
    next()
  }
})

export default router
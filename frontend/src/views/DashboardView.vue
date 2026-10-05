<template>
  <div class="dashboard-view">
    <div class="welcome-container">
      <!-- Header with Bosch Rexroth Logo -->
      <header class="welcome-header">
        <div class="brand-pill">
          <img :src="rexrothLogo" alt="Bosch Rexroth" class="dashboard-logo" />
          <span class="pill-divider"></span>
          <span class="pill-context">ctrlX AUTOMATION Test Stand</span>
        </div>

        <h1 class="platform-title">ValveDAX</h1>
        <p class="platform-subtitle">
          Valve Data Acquisition System · Powered by ctrlX CORE
        </p>
      </header>

      <!-- Primary Operational Modules -->
      <div class="action-cards">
        <!-- Module 1: Test Workspace -->
        <div class="action-card" @click="goToRecords">
          <div class="icon-wrapper">
            <i class="pi pi-chart-line"></i>
          </div>
          <h3>Test Workspace</h3>
          <p>
            Monitor live OPC UA telemetry, actuate valves, and record pressure
            and flow response curves.
          </p>
          <Button
            label="Open Workspace"
            icon="pi pi-arrow-right"
            severity="secondary"
            outlined
            class="action-btn" />
        </div>

        <!-- Module 2: Valve Database -->
        <div class="action-card" @click="goToValveList">
          <div class="icon-wrapper">
            <i class="pi pi-server"></i>
          </div>
          <h3>Valve Database</h3>
          <p>
            Manage valve technical specifications, nominal limits, image
            references, and PDF datasheets.
          </p>
          <Button
            label="Open Catalog"
            icon="pi pi-arrow-right"
            severity="secondary"
            outlined
            class="action-btn" />
        </div>

        <!-- Module 3: Generate Report -->
        <div class="action-card" @click="goToReport">
          <div class="icon-wrapper">
            <i class="pi pi-file-pdf"></i>
          </div>
          <h3>Test Reports & PDF</h3>
          <p>
            Retrieve historical test sessions, verify deviations against
            specifications, and generate A4 PDF certificates.
          </p>
          <Button
            label="Generate Report"
            icon="pi pi-arrow-right"
            severity="secondary"
            outlined
            class="action-btn" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";
import Button from "primevue/button";
import rexrothLogo from "../assets/Bosch_Rexroth-Logo.wine.svg";

const router = useRouter();

function goToRecords() {
  router.push("/records");
}

function goToValveList() {
  router.push("/valves");
}

function goToReport() {
  router.push("/report");
}
</script>

<style scoped>
.dashboard-view {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  overflow-y: auto;
}

.welcome-container {
  max-width: 1100px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2.75rem;
  text-align: center;
  margin: auto 0;
}

/* Header & Logo */
.welcome-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
} 

.brand-pill   {
  display: inline-flex;
  align-items: center;
  gap: 0.85rem;
  background: #ffffff; /* Clean white base so the multi-colored logo colors remain 100% compliant */
  padding: 0.4rem 1rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  margin-bottom: 0.5rem;
}

.logo-wrapper {
  background: #ffffff;
  padding: 0.6rem 1.4rem;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
  margin-bottom: 1.5rem;
}

.dashboard-logo {
  height: 22px; /* Proportional, sleek height */
  width: auto;
  display: block;
}

.pill-divider {
  width: 1px;
  height: 14px;
  background: #cbd5e1;
} 

.pill-context {
  font-size: 0.75rem;
  font-weight: 600;
  color: #002B49; /* Rexroth Prussian Blue */
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-family: Consolas, Monaco, monospace;
}

.platform-title {
  font-size: 2.75rem;
  font-weight: 800;
  color: var(--text-color);
  letter-spacing: -0.03em;
  margin: 0;
  line-height: 1.1;
}

.platform-subtitle {
  font-size: 0.95rem;
  color: var(--text-muted);
  margin: 0;
  letter-spacing: 0.01em;
}

.welcome-header h1 {
  font-size: 2.25rem;
  margin: 0 0 0.5rem 0;
  color: var(--text-color);
  letter-spacing: -0.025em;
  font-weight: 700;
}

.welcome-header p {
  font-size: 1rem;
  color: var(--text-muted);
  margin: 0;
  max-width: 620px;
}

/* Action Cards */
.action-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
}

.action-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 2.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
  border-color: var(--primary-color);
}

.icon-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(0, 204, 255, 0.08);
  color: var(--primary-color);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

/* Hover inverts the icon: the circle fills with the primary colour and the
   icon takes the opposite one so it stays visible.
   Light: navy fill + cyan icon. Dark: cyan fill + navy icon (white on cyan
   is only about 1.9:1). */
.action-card:hover .icon-wrapper {
  background: var(--primary-color);
  color: var(--rexroth-6);
}

.p-dark .action-card:hover .icon-wrapper {
  color: var(--rexroth-3);
}

.icon-wrapper i {
  font-size: 1.75rem;
}

.action-card h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1.25rem;
  color: var(--text-color);
  font-weight: 600;
}

.action-card p {
  margin: 0 0 1.75rem 0;
  color: var(--text-muted);
  line-height: 1.5;
  font-size: 0.88rem;
  flex: 1;
}

.action-btn {
  margin-top: auto;
  pointer-events: none;
  font-size: 0.85rem;
}

@media (max-width: 960px) {
  .action-cards {
    grid-template-columns: 1fr;
  }
}
</style>

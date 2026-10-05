import { ref } from 'vue'


const isDark = ref(false)

function applyTheme() {
  const root = document.documentElement
  if (isDark.value) {
    root.classList.add('p-dark')
  } else {
    root.classList.remove('p-dark')
  }
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

function initTheme() {
  // Default is always light mode unless the user has explicitly toggled
  // dark mode before (and it's still remembered in this browser). We do
  // NOT fall back to the OS/browser prefers-color-scheme setting here —
  // that made the app open in dark mode on any machine whose Windows/
  // Chrome theme is set to dark, even for a user who never touched the
  // toggle. Light stays the true first-run default; toggling dark still
  // persists across reloads as before.
  const saved = localStorage.getItem('theme')
  isDark.value = saved === 'dark'
  applyTheme()
}

function toggleTheme() {
  isDark.value = !isDark.value
  applyTheme()
}

export function useTheme() {
  return { isDark, initTheme, toggleTheme }
}
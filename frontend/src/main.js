import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'

import PrimeVue from 'primevue/config'
import { TFIPreset } from './theme/tfiPreset'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import 'primeicons/primeicons.css'

const app = createApp(App)

app.use(PrimeVue, {
  theme: {
    // TFIPreset = Aura + our navy dark-mode tokens (see
    // theme/tfiPreset.js) — keeps light mode identical to stock Aura,
    // only remaps the dark colorScheme so PrimeVue's own components
    // (Card, DataTable, Dialog, inputs...) match the approved dark-mode
    // palette instead of Aura's default near-black scale.
    preset: TFIPreset,
    options: {
      darkModeSelector: '.p-dark'
    }
  }
})
app.use(ConfirmationService)
app.use(ToastService)
app.use(createPinia())
app.use(router)

app.mount('#app')
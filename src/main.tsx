import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import App from './App'
import './index.css'
import './motion.css'

registerSW({ immediate: true })

const root = document.getElementById('root')
if (!root) throw new Error('Missing root')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

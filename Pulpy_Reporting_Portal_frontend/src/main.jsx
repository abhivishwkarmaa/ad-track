import './utils/appClientLifecycle.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './shared/styles/shared-ui.css'
import './shared/styles/entity-list.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

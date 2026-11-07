import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './console.css'
import './index.css'
import App from './App'

const el = document.getElementById('root')
if (!el) throw new Error('#root entry missing')
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './fonts.css'
import './index.css'
import App from './App.jsx'
import { dropPrivatePages } from './analytics.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={dropPrivatePages} />
  </StrictMode>,
)

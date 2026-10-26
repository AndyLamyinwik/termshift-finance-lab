import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PayPalCaseStudy from './PayPalCaseStudy'
import '../../index.css'
import './case-study.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PayPalCaseStudy />
  </StrictMode>,
)

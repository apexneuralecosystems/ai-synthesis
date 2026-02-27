import { Component, StrictMode } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('App error:', err, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 560 }}>
          <h1 style={{ fontSize: 18, color: '#dc2626', marginBottom: 8 }}>Something went wrong</h1>
          <pre style={{ fontSize: 13, color: '#475569', overflow: 'auto', background: '#f1f5f9', padding: 16, borderRadius: 8 }}>
            {this.state.message}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8, background: '#e2e8f0', border: 0, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

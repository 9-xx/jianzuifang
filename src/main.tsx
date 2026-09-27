/**
 * 应用入口：路由 + 全局布局（顶栏导航）。
 */
import { StrictMode, useEffect, useState, createContext, useContext } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ScenarioSelectPage from './pages/ScenarioSelectPage'
import PracticePage from './pages/PracticePage'
import FeedbackPage from './pages/FeedbackPage'
import HistoryPage from './pages/HistoryPage'
import HistoryDetailPage from './pages/HistoryDetailPage'
import FrequentIssuesPage from './pages/FrequentIssuesPage'
import SimulateSetupPage from './pages/SimulateSetupPage'
import SimulatePlayPage from './pages/SimulatePlayPage'
import NotFoundPage from './pages/NotFoundPage'
import { ErrorBoundary } from './pages/ErrorBoundary'
import { isStorageAvailable } from './lib/storage'
import { hasUserApiKey, onKeyChanged } from './lib/user-key'
import Icon from './components/Icon'
import PageMotion from './components/PageMotion'
import KeyDialog from './components/KeyDialog'
import './styles/global.css'

/** 全局打开 Key 设置弹层（供页面内引导提示调用） */
const KeyDialogContext = createContext<(open?: boolean) => void>(() => {})
export function useKeyDialog() {
  return useContext(KeyDialogContext)
}

function TopBar({ onOpenKey }: { onOpenKey: () => void }) {
  const location = useLocation()
  const [hasKey, setHasKey] = useState(false)
  const isPracticeFlow =
    location.pathname.startsWith('/practice') ||
    location.pathname.startsWith('/feedback') ||
    location.pathname.startsWith('/simulate/play')

  useEffect(() => {
    const sync = () => {
      try {
        setHasKey(hasUserApiKey())
      } catch {
        /* ignore */
      }
    }
    sync()
    return onKeyChanged(sync)
  }, [])

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark"><Icon name="wave" size={22} /></span>
          有氧健嘴房
        </Link>
        <div className="topbar-right">
          {!isPracticeFlow && (
            <nav className="topnav" aria-label="主导航">
              <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
                练习空间
              </NavLink>
              <NavLink
                to="/history"
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                我的记录
              </NavLink>
              <NavLink
                to="/frequent-issues"
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                表达习惯
              </NavLink>
            </nav>
          )}
          <button
            className={`key-button ${hasKey ? 'key-set' : ''}`}
            onClick={onOpenKey}
            aria-label="设置你的 DeepSeek API Key"
            title={hasKey ? '已设置你自己的 API Key' : '设置你的 DeepSeek API Key（可选）'}
          >
            <Icon name="key" size={15} />
            <span>{hasKey ? '我的 Key' : 'Key'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}

function App() {
  const storageOk = isStorageAvailable()
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)
  const openKeyDialog = useState(() => (open?: boolean) => setKeyDialogOpen(open ?? true))[0]

  return (
    <KeyDialogContext.Provider value={openKeyDialog}>
      <BrowserRouter>
        <ErrorBoundary>
          <TopBar onOpenKey={() => setKeyDialogOpen(true)} />
          <main className="app-shell">
            {!storageOk && (
              <div className="notice notice-warn" role="alert">
                当前浏览器环境下无法保存记录（可能是隐私模式），本次练习可以正常进行，但历史记录和表达习惯功能将无法生效。
              </div>
            )}
            <PageMotion>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/scenarios/:mode" element={<ScenarioSelectPage />} />
              <Route path="/scenarios/:mode/sub/:subMode" element={<ScenarioSelectPage />} />
              <Route path="/practice" element={<PracticePage />} />
              <Route path="/simulate" element={<SimulateSetupPage />} />
              <Route path="/simulate/play" element={<SimulatePlayPage />} />
              <Route path="/feedback/:sessionId" element={<FeedbackPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/history/:sessionId" element={<HistoryDetailPage />} />
              <Route path="/frequent-issues" element={<FrequentIssuesPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </PageMotion>
          </main>
          {keyDialogOpen && <KeyDialog onClose={() => setKeyDialogOpen(false)} />}
        </ErrorBoundary>
      </BrowserRouter>
    </KeyDialogContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

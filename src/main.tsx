/**
 * 应用入口：路由 + 全局布局（顶栏导航）。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, NavLink, Link, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ScenarioSelectPage from './pages/ScenarioSelectPage'
import PracticePage from './pages/PracticePage'
import FeedbackPage from './pages/FeedbackPage'
import HistoryPage from './pages/HistoryPage'
import HistoryDetailPage from './pages/HistoryDetailPage'
import FrequentIssuesPage from './pages/FrequentIssuesPage'
import { isStorageAvailable } from './lib/storage'
import './styles/global.css'

function TopBar() {
  const location = useLocation()
  const isPracticeFlow =
    location.pathname.startsWith('/practice') || location.pathname.startsWith('/feedback')

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">健</span>
          有氧健嘴房
        </Link>
        {!isPracticeFlow && (
          <nav className="topnav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
              练习
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
              高频问题
            </NavLink>
          </nav>
        )}
      </div>
    </header>
  )
}

function App() {
  const storageOk = isStorageAvailable()
  return (
    <BrowserRouter>
      <TopBar />
      <main className="app-shell">
        {!storageOk && (
          <div className="notice notice-warn" role="alert">
            当前浏览器环境下无法保存记录（可能是隐私模式），本次练习可以正常进行，但历史记录和"高频问题"功能将无法生效。
          </div>
        )}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/scenarios/:mode" element={<ScenarioSelectPage />} />
          <Route path="/scenarios/:mode/sub/:subMode" element={<ScenarioSelectPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/feedback/:sessionId" element={<FeedbackPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:sessionId" element={<HistoryDetailPage />} />
          <Route path="/frequent-issues" element={<FrequentIssuesPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/**
 * 我的记录页：本地历史列表 + 顶部文字总结（进步情况，MVP 不做图表）
 * + 按模式筛选（全部 / 即兴问答 / 结构化表达 / 材料模拟）。
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadSessions, loadTagStatuses, loadDeclaredIssues } from '../lib/storage'
import { computeGrowthSummary } from '../lib/growth'
import type { PracticeMode } from '../lib/types'

const MODE_FILTERS: Array<{ id: PracticeMode | '全部'; label: string }> = [
  { id: '全部', label: '全部' },
  { id: '即兴问答', label: '即兴问答' },
  { id: '结构化表达', label: '结构化表达' },
  { id: '材料模拟', label: '材料模拟' },
]

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<PracticeMode | '全部'>('全部')
  const sessions = useMemo(() => loadSessions(), [])
  const summary = useMemo(
    () => computeGrowthSummary(sessions, loadTagStatuses(), loadDeclaredIssues()),
    [sessions],
  )

  const filtered = useMemo(
    () => (filter === '全部' ? sessions : sessions.filter((s) => s.mode === filter)),
    [sessions, filter],
  )

  if (sessions.length === 0) {
    return (
      <div>
        <h1 className="page-title">我的记录</h1>
        <div className="empty-state">
          <div className="icon">🌱</div>
          <p>还没有练习记录。去把一句想法练出口。</p>
          <button className="btn btn-primary mt-16" onClick={() => navigate('/')}>
            开始第一次练习
          </button>
        </div>
      </div>
    )
  }

  const hasSummary =
    summary.improvements.length + summary.newIssues.length + summary.disappeared.length > 0

  return (
    <div>
      <h1 className="page-title">我的记录</h1>
      <p className="page-subtitle">共 {sessions.length} 次练习 · 数据只存在你的浏览器里</p>

      {/* 文字总结（进步情况） */}
      {hasSummary && (
        <div className="card mb-16">
          <div className="section-title mt-0">📈 想法说得怎么样</div>
          {summary.improvements.map((s, i) => (
            <p key={`imp-${i}`} style={{ color: 'var(--success)', margin: '6px 0' }}>
              {s}
            </p>
          ))}
          {summary.disappeared.map((s, i) => (
            <p key={`dis-${i}`} style={{ color: 'var(--success)', margin: '6px 0' }}>
              🎉 {s}
            </p>
          ))}
          {summary.newIssues.map((s, i) => (
            <p key={`new-${i}`} style={{ color: '#8a6414', margin: '6px 0' }}>
              ⚠️ {s}
            </p>
          ))}
        </div>
      )}

      {/* 模式筛选 */}
      <div className="filter-row" role="tablist" aria-label="按模式筛选">
        {MODE_FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={`filter-chip ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 历史列表（按 createdAt 倒序） */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🗂</div>
          <p>这个模式下还没有记录。</p>
        </div>
      ) : (
        filtered.map((s) => (
          <button
            key={s.id}
            className="history-item"
            onClick={() => navigate(`/history/${s.id}`)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row wrap">
                <strong>{s.scenario}</strong>
                <span className="badge badge-neutral">{s.mode}</span>
                {s.subMode && <span className="badge badge-neutral">{s.subMode}</span>}
              </div>
              <div className="snippet">{s.userContent}</div>
              <div className="meta">
                <span>{formatTime(s.createdAt)}</span>
                <span>· {s.inputMethod}</span>
                {s.durationSeconds != null && <span>· {s.durationSeconds} 秒</span>}
                {s.feedbackTags.length > 0 && <span>· {s.feedbackTags.length} 个习惯标签</span>}
              </div>
            </div>
            <span className="muted">›</span>
          </button>
        ))
      )}
    </div>
  )
}

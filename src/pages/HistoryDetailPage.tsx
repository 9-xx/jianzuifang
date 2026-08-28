/**
 * 历史详情页：完整反馈回看；整理总结模式额外展示"当时的阅读材料"。
 */
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { loadSessions } from '../lib/storage'

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function HistoryDetailPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const session = useMemo(
    () => loadSessions().find((s) => s.id === sessionId),
    [sessionId],
  )

  if (!session) {
    return (
      <div className="empty-state">
        <div className="icon">🤔</div>
        <p>没有找到这条记录。</p>
        <button className="btn btn-primary mt-16" onClick={() => navigate('/history')}>
          返回记录列表
        </button>
      </div>
    )
  }

  const isSummary = session.subMode === '整理总结'
  const f = session.feedback

  return (
    <div>
      <button className="back-link" onClick={() => navigate('/history')}>
        ← 返回记录列表
      </button>
      <h1 className="page-title">{session.scenario}</h1>
      <p className="page-subtitle">
        {formatTime(session.createdAt)} · {session.mode}
        {session.subMode ? `（${session.subMode}）` : ''} · {session.inputMethod}作答
        {session.durationSeconds != null ? ` · 用时 ${session.durationSeconds} 秒` : ''}
      </p>

      {/* 当时的阅读材料（仅整理总结） */}
      {isSummary && session.aiGeneratedMaterial && (
        <div className="card mb-16">
          <div className="section-title mt-0">📖 当时的阅读材料</div>
          <div className="material-block">{session.aiGeneratedMaterial}</div>
        </div>
      )}

      {/* 你的作答 */}
      <div className="card">
        <div className="section-title mt-0">🗣 你的作答</div>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{session.userContent}</p>
      </div>

      {/* 反馈 */}
      <div className="card">
        <div className="section-title mt-0">反馈</div>
        {f.fillerWords && (
          <div className="feedback-dimension">
            <h4>
              填充词 / 口头禅 / 模糊表达 <span className="badge badge-lexicon">词库</span>
            </h4>
            <p>{f.fillerWords}</p>
          </div>
        )}
        {f.logic && (
          <div className="feedback-dimension">
            <h4>
              逻辑性 <span className="badge badge-ai">AI</span>
            </h4>
            <p>{f.logic}</p>
          </div>
        )}
        {f.fluency && (
          <div className="feedback-dimension">
            <h4>
              流畅度 <span className="badge badge-ai">AI</span>
            </h4>
            <p>{f.fluency}</p>
          </div>
        )}
        {f.structure && (
          <div className="feedback-dimension">
            <h4>
              结构完整度 <span className="badge badge-ai">AI</span>
            </h4>
            <p>{f.structure}</p>
          </div>
        )}
        {isSummary && f.informationCompleteness && (
          <div className="feedback-dimension">
            <h4>
              信息保留完整度 <span className="badge badge-ai">AI</span>
            </h4>
            <p>{f.informationCompleteness}</p>
          </div>
        )}
        {isSummary && f.opinionIndependence && (
          <div className="feedback-dimension">
            <h4>
              个人观点独立性 <span className="badge badge-ai">AI</span>
            </h4>
            <p>{f.opinionIndependence}</p>
          </div>
        )}
        {f.encouragement && <p className="mt-8">💪 {f.encouragement}</p>}
      </div>

      {/* 问题标签 */}
      {session.feedbackTags.length > 0 && (
        <div className="card">
          <div className="section-title mt-0">本次触发的问题标签</div>
          <div className="row wrap">
            {session.feedbackTags.map((t, i) => (
              <span key={`${t.tag}-${i}`} className="tag-chip">
                {t.tag}
                <span className={`badge ${t.source === 'ai' ? 'badge-ai' : 'badge-lexicon'}`}>
                  {t.source === 'ai' ? 'AI' : '词库'}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

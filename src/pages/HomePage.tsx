/**
 * 首页：练习模式选择 + "最近使用"快捷入口（最多 2 条，精确到大模式层级）。
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadSettings } from '../lib/storage'
import type { PracticeMode } from '../lib/types'

const MODE_ROUTES: Record<PracticeMode, string> = {
  即兴问答: '/scenarios/即兴问答',
  结构化表达: '/scenarios/结构化表达',
}

export default function HomePage() {
  const navigate = useNavigate()
  const recentModes = useMemo(() => loadSettings().recentModes ?? [], [])

  return (
    <div>
      <h1 className="page-title">今天练点什么？</h1>
      <p className="page-subtitle">无需注册，打开就能练。说完马上告诉你哪里可以更好。</p>

      {recentModes.length > 0 && (
        <>
          <div className="section-title">最近使用</div>
          <div className="row wrap mb-16">
            {recentModes.map((m) => (
              <button
                key={m.mode}
                className="btn btn-secondary"
                onClick={() => navigate(MODE_ROUTES[m.mode])}
              >
                ⏱ {m.mode}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mode-grid mt-16">
        <button
          className="mode-card mode-impromptu"
          onClick={() => navigate('/scenarios/即兴问答')}
        >
          <div className="mode-icon">🎤</div>
          <h2>即兴问答训练</h2>
          <p>随机场景抛出追问式问题，限时作答。练"被追问时不卡壳"。</p>
        </button>

        <button
          className="mode-card mode-structured"
          onClick={() => navigate('/scenarios/结构化表达')}
        >
          <div className="mode-icon">🧩</div>
          <h2>结构化表达训练</h2>
          <p>自由生成：把零散想法说成有逻辑的话；整理总结：读完材料后结构化转述。</p>
        </button>
      </div>

      <div className="card mt-24">
        <div className="row-between wrap">
          <div>
            <strong>你的表达记忆</strong>
            <div className="muted mt-8">
              系统会记住你反复出现的问题（需要你确认），你也可以主动告诉它你已知的问题。
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/frequent-issues')}>
            查看
          </button>
        </div>
      </div>
    </div>
  )
}

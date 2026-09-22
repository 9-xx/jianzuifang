/**
 * 首页：练习模式选择 + "最近使用"快捷入口（最多 2 条，精确到大模式层级）
 * + 练习统计（累计次数 / 连续天数 / 累计时长，实时计算不落库）。
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadSettings } from '../lib/storage'
import { loadSessions } from '../lib/storage'
import { computePracticeStats, lastPracticeLabel, totalDurationLabel } from '../lib/stats'
import type { PracticeMode } from '../lib/types'

const MODE_ROUTES: Record<PracticeMode, string> = {
  即兴问答: '/scenarios/即兴问答',
  结构化表达: '/scenarios/结构化表达',
  材料模拟: '/simulate',
}

export default function HomePage() {
  const navigate = useNavigate()
  const recentModes = useMemo(() => loadSettings().recentModes ?? [], [])
  const stats = useMemo(() => computePracticeStats(loadSessions()), [])
  const lastLabel = useMemo(() => lastPracticeLabel(stats), [stats])

  if (stats.totalCount === 0) {
    return (
      <div>
        <h1 className="page-title">今天练点什么？</h1>
        <p className="page-subtitle">
          把脑子里的想法练到能说出口。无需注册，说完告诉你哪一句还停在脑子里。
        </p>

        <div className="mode-grid mt-16">
          <button
            className="mode-card mode-impromptu"
            onClick={() => navigate('/scenarios/即兴问答')}
          >
            <div className="mode-icon">🎤</div>
            <h2>即兴问答训练</h2>
            <p>被追问时把判断说出来，而不是只在脑子里组织。</p>
          </button>

          <button
            className="mode-card mode-structured"
            onClick={() => navigate('/scenarios/结构化表达')}
          >
            <div className="mode-icon">🧩</div>
            <h2>结构化表达训练</h2>
            <p>自由生成：把零散想法说成一段完整的话；整理总结：读完之后用自己的判断说出来。</p>
          </button>

          <button
            className="mode-card mode-simulate"
            onClick={() => navigate('/simulate')}
          >
            <div className="mode-icon">🎯</div>
            <h2>材料模拟</h2>
            <p>贴上简历、JD、会议材料或一篇要讲的东西。对方入戏，结束后才告诉你有没有把判断说出口。</p>
          </button>
        </div>

        <div className="card mt-24">
          <div className="row-between wrap">
            <div>
              <strong>你的表达记忆</strong>
              <div className="muted mt-8">
                系统会记住你反复没说完整的地方（需要你确认），你也可以主动告诉它。
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

  return (
    <div>
      <h1 className="page-title">今天练点什么？</h1>
      <p className="page-subtitle">
        {lastLabel ? `${lastLabel}。` : ''}说完告诉你哪一句还停在脑子里。
      </p>

      <div className="stats-strip" role="group" aria-label="练习统计">
        <div className="stat-cell">
          <div className="stat-num">{stats.totalCount}</div>
          <div className="stat-label">累计练习</div>
        </div>
        <div className="stat-divider" aria-hidden="true" />
        <div className="stat-cell">
          <div className="stat-num">
            {stats.streakDays > 0 ? (
              <>
                {stats.streakDays}
                <span className="stat-flame" aria-hidden="true">🔥</span>
              </>
            ) : (
              '—'
            )}
          </div>
          <div className="stat-label">连续天数</div>
        </div>
        <div className="stat-divider" aria-hidden="true" />
        <div className="stat-cell">
          <div className="stat-num">{totalDurationLabel(stats)}</div>
          <div className="stat-label">累计开口</div>
        </div>
      </div>

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
          <p>被追问时把判断说出来，而不是只在脑子里组织。</p>
        </button>

        <button
          className="mode-card mode-structured"
          onClick={() => navigate('/scenarios/结构化表达')}
        >
          <div className="mode-icon">🧩</div>
          <h2>结构化表达训练</h2>
          <p>自由生成：把零散想法说成一段完整的话；整理总结：读完之后用自己的判断说出来。</p>
        </button>

        <button
          className="mode-card mode-simulate"
          onClick={() => navigate('/simulate')}
        >
          <div className="mode-icon">🎯</div>
          <h2>材料模拟</h2>
          <p>贴上简历、JD、会议材料或一篇要讲的东西。对方入戏，结束后才告诉你有没有把判断说出口。</p>
        </button>
      </div>

      <div className="card mt-24">
        <div className="row-between wrap">
          <div>
            <strong>你的表达记忆</strong>
            <div className="muted mt-8">
              系统会记住你反复没说完整的地方（需要你确认），你也可以主动告诉它。
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

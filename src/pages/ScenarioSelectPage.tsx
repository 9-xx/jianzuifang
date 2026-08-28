/**
 * 场景选择页：
 * - 即兴问答：场景卡片列表（职场向 / 日常表达向）
 * - 结构化表达：先选子模式（自由生成 / 整理总结），再选场景/话题
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  IMPROMPTU_SCENARIOS,
  FREEGEN_TOPICS,
  SUMMARY_TOPICS,
} from '../data/scenarios'
import { recordModeVisit } from '../lib/settings'
import type { PracticeMode, ScenarioCategory, SubMode } from '../lib/types'

function CategoryBadge({ category }: { category: ScenarioCategory }) {
  return (
    <span className={`badge ${category === '职场向' ? 'badge-work' : 'badge-daily'}`}>
      {category}
    </span>
  )
}

export default function ScenarioSelectPage() {
  const navigate = useNavigate()
  const params = useParams()
  const mode = (params.mode ?? '即兴问答') as PracticeMode
  const subModeParam = params.subMode as SubMode | undefined

  const [subMode, setSubMode] = useState<SubMode | undefined>(subModeParam)

  useEffect(() => {
    setSubMode(subModeParam)
  }, [subModeParam])

  // 记录"最近使用"（精确到大模式层级）
  useEffect(() => {
    recordModeVisit(mode)
  }, [mode])

  const impromptuByCategory = useMemo(() => {
    const groups: Record<ScenarioCategory, typeof IMPROMPTU_SCENARIOS> = {
      职场向: [],
      日常表达向: [],
    }
    for (const s of IMPROMPTU_SCENARIOS) groups[s.category].push(s)
    return groups
  }, [])

  const freeGenByCategory = useMemo(() => {
    const groups: Record<ScenarioCategory, typeof FREEGEN_TOPICS> = {
      职场向: [],
      日常表达向: [],
    }
    for (const s of FREEGEN_TOPICS) groups[s.category].push(s)
    return groups
  }, [])

  const summaryByCategory = useMemo(() => {
    const groups: Record<ScenarioCategory, typeof SUMMARY_TOPICS> = {
      职场向: [],
      日常表达向: [],
    }
    for (const s of SUMMARY_TOPICS) groups[s.category].push(s)
    return groups
  }, [])

  // ---- 即兴问答 ----
  if (mode === '即兴问答') {
    return (
      <div>
        <button className="back-link" onClick={() => navigate('/')}>
          ← 返回
        </button>
        <h1 className="page-title">选一个场景</h1>
        <p className="page-subtitle">每个场景对应一个问题池，每次练习随机抽一道题。</p>

        {(['职场向', '日常表达向'] as ScenarioCategory[]).map((cat) => (
          <div key={cat}>
            <div className="section-title">
              <CategoryBadge category={cat} />
            </div>
            <div className="card-grid">
              {impromptuByCategory[cat].map((s) => (
                <button
                  key={s.id}
                  className="scenario-card"
                  onClick={() =>
                    navigate(`/practice?mode=${encodeURIComponent(s.mode)}&scenario=${s.id}`)
                  }
                >
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  <div className="muted">⏱ 限时 {s.timeLimitSeconds} 秒 · {s.questions.length} 道候选题</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ---- 结构化表达：先选子模式 ----
  if (!subMode) {
    return (
      <div>
        <button className="back-link" onClick={() => navigate('/')}>
          ← 返回
        </button>
        <h1 className="page-title">结构化表达训练</h1>
        <p className="page-subtitle">先选一个子模式，两种模式练的能力不一样。</p>

        <div className="mode-grid">
          <button className="mode-card mode-impromptu" onClick={() => setSubMode('自由生成')}>
            <div className="mode-icon">✍️</div>
            <h2>自由生成</h2>
            <p>从零组织自己的想法，把零散想法说成一段有逻辑的话。</p>
          </button>
          <button className="mode-card mode-structured" onClick={() => setSubMode('整理总结')}>
            <div className="mode-icon">📖</div>
            <h2>整理总结</h2>
            <p>读一段 AI 生成的材料，总结要点、给出观点。练"信息压缩 + 提炼 + 转述"。</p>
          </button>
        </div>
      </div>
    )
  }

  // ---- 结构化表达：选场景/话题 ----
  const byCategory = subMode === '自由生成' ? freeGenByCategory : summaryByCategory
  return (
    <div>
      <button className="back-link" onClick={() => setSubMode(undefined)}>
        ← 重选子模式
      </button>
      <h1 className="page-title">
        {subMode === '自由生成' ? '自由生成 · 选一个话题' : '整理总结 · 选一个话题方向'}
      </h1>
      <p className="page-subtitle">
        {subMode === '自由生成'
          ? '先想清楚框架再开口，说完给你结构上的反馈。'
          : '进入练习页后会先展示一段 AI 生成的阅读材料，读完再总结。'}
      </p>

      {(['职场向', '日常表达向'] as ScenarioCategory[]).map((cat) => (
        <div key={cat}>
          <div className="section-title">
            <CategoryBadge category={cat} />
          </div>
          <div className="card-grid">
            {byCategory[cat].map((s) => (
              <button
                key={s.id}
                className="scenario-card"
                onClick={() =>
                  navigate(
                    `/practice?mode=${encodeURIComponent(s.mode)}&subMode=${encodeURIComponent(
                      subMode,
                    )}&scenario=${s.id}`,
                  )
                }
              >
                <h3>{s.name}</h3>
                <p>{s.description}</p>
                {subMode === '自由生成' && 'frameworkHint' in s && (
                  <div className="muted">{s.frameworkHint}</div>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

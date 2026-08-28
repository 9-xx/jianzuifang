/**
 * 我的高频问题页：系统检测区 + 用户手动声明区。
 *
 * 合并规则：
 * - 精确匹配类声明（lexicon/predefined）命中系统统计 → 合并为一条，
 *   标注"你自己提到过 · 系统也发现了 N 次"，不弹"待确认"；
 * - 系统检测到但未声明的候选 → 正常展示"确认/忽略"（dismissed 可恢复关注）；
 * - freeform 兜底声明 → 独立展示，不参与合并。
 *
 * 手动添加流程：先选大类 → 词库类直接输入具体词；语义类从预定义列表选
 * （列表末尾有"以上都不是，自己描述"兜底项）。
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  loadSessions,
  loadTagStatuses,
  loadDeclaredIssues,
  loadSettings,
  saveTagStatuses,
} from '../lib/storage'
import { computeFrequentIssues } from '../lib/memory'
import { getThreshold } from '../lib/settings'
import {
  addDeclaredIssue,
  removeDeclaredIssue,
  restoreTagAttention,
  setTagStatus,
  clearAllMemory,
} from '../lib/issues'
import { tagsOfCategory } from '../data/semantic-tags'
import type { DeclaredInputType, TagStatus } from '../lib/types'

/** 问题大类 → 录入方式 */
const CATEGORY_INPUT_TYPE: Record<string, DeclaredInputType> = {
  填充词: 'lexicon',
  模糊表达: 'lexicon',
  逻辑结构: 'predefined',
  紧张点: 'predefined',
  开场白依赖: 'predefined',
  情绪失衡: 'predefined',
}

const ALL_CATEGORIES = Object.keys(CATEGORY_INPUT_TYPE)

function AddIssueDialog({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState<string | null>(null)
  const [word, setWord] = useState('')
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const [freeform, setFreeform] = useState(false)
  const [freeformText, setFreeformText] = useState('')

  const inputType = category ? CATEGORY_INPUT_TYPE[category] : null

  const submit = () => {
    if (!category || !inputType) return

    if (inputType === 'lexicon') {
      const w = word.trim()
      if (!w) return
      addDeclaredIssue({ category, inputType, value: w, tag: `${category}:${w}` })
    } else if (inputType === 'predefined') {
      if (freeform) {
        const t = freeformText.trim()
        if (!t) return
        addDeclaredIssue({ category, inputType: 'freeform', value: t })
      } else {
        if (!selectedLabel) return
        addDeclaredIssue({ category, inputType, value: selectedLabel, tag: `${category}:${selectedLabel}` })
      }
    }
    onClose()
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>添加你已知的问题</h3>
        <p>告诉系统你清楚的问题，从下一次练习开始就会被特别关注。</p>

        {!category && (
          <>
            <div className="field-label">先选问题大类</div>
            <div className="row wrap">
              {ALL_CATEGORIES.map((c) => (
                <button key={c} className="btn btn-secondary btn-sm" onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
          </>
        )}

        {category && inputType === 'lexicon' && (
          <>
            <div className="field-label">输入具体的词（如"讲道理"）</div>
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="你的口头禅或常说的模糊词…"
              autoFocus
            />
            <p className="muted mt-8">这个词会被加入本地检测词库，之后每次练习都会被检测到。</p>
          </>
        )}

        {category && inputType === 'predefined' && !freeform && (
          <>
            <div className="field-label">从「{category}」的预定义列表里选</div>
            <div className="row wrap">
              {tagsOfCategory(category).map((tag) => {
                const label = tag.slice(category.length + 1)
                return (
                  <button
                    key={tag}
                    className={`btn btn-sm ${selectedLabel === label ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setSelectedLabel(label)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="mt-16">
              <button className="btn btn-ghost btn-sm" onClick={() => setFreeform(true)}>
                以上都不是，自己描述
              </button>
            </div>
          </>
        )}

        {category && inputType === 'predefined' && freeform && (
          <>
            <div className="field-label">用自己的话描述这个问题</div>
            <textarea
              value={freeformText}
              onChange={(e) => setFreeformText(e.target.value)}
              style={{ minHeight: 90 }}
              placeholder={`描述你在「${category}」方面的具体表现…`}
              autoFocus
            />
            <p className="muted mt-8">
              注意：这条不会自动和系统检测结果合并，仅作为你自己的记录展示。
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => setFreeform(false)}>
              ← 返回预定义列表
            </button>
          </>
        )}

        <div className="btn-row">
          <button className="btn btn-primary" onClick={submit} disabled={
            !category ||
            (inputType === 'lexicon' && !word.trim()) ||
            (inputType === 'predefined' && !freeform && !selectedLabel) ||
            (inputType === 'predefined' && freeform && !freeformText.trim())
          }>
            添加
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FrequentIssuesPage() {
  const navigate = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [tick, setTick] = useState(0)

  const refresh = () => setTick((t) => t + 1)

  const data = useMemo(() => {
    const sessions = loadSessions()
    const statuses = loadTagStatuses()
    const declared = loadDeclaredIssues()
    const threshold = getThreshold(loadSettings())
    const views = computeFrequentIssues(sessions, statuses, declared, threshold)
    return { views, declared, statuses }
    // tick 变化时重新读取本地存储
  }, [tick])

  const systemViews = data.views
  const freeformIssues = data.declared.filter((d) => d.inputType === 'freeform')
  const declaredOnly = data.declared.filter(
    (d) => (d.inputType === 'lexicon' || d.inputType === 'predefined') && d.tag,
  )
  const mergedTags = new Set(systemViews.filter((v) => v.declared).map((v) => v.tag))
  const declaredNotYetDetected = declaredOnly.filter((d) => !mergedTags.has(d.tag as string))

  const isEmpty =
    systemViews.length === 0 && data.declared.length === 0

  const handleConfirm = (tag: string) => {
    setTagStatus(tag, 'confirmed')
    refresh()
  }
  const handleDismiss = (tag: string) => {
    setTagStatus(tag, 'dismissed')
    refresh()
  }
  const handleRestore = (tag: string) => {
    restoreTagAttention(tag)
    refresh()
  }
  const handleRemoveDeclared = (id: string) => {
    removeDeclaredIssue(id)
    refresh()
  }
  const handleClearAll = () => {
    if (window.confirm('确定要清空全部高频问题记忆吗？包括确认/忽略状态和你手动声明的问题。此操作不可恢复。')) {
      saveTagStatuses([] as TagStatus[])
      clearAllMemory()
      refresh()
    }
  }

  return (
    <div>
      <div className="row-between wrap">
        <div>
          <h1 className="page-title">我的高频问题</h1>
          <p className="page-subtitle">
            系统检测（累计 ≥ {getThreshold(loadSettings())} 次）+ 你手动声明的问题，双轨并行。
          </p>
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            + 添加
          </button>
          {(data.statuses.length > 0 || data.declared.length > 0) && (
            <button className="btn btn-danger-ghost btn-sm" onClick={handleClearAll}>
              清空记忆
            </button>
          )}
        </div>
      </div>

      {isEmpty && (
        <div className="empty-state">
          <div className="icon">🧠</div>
          <p>暂时还没发现你的高频问题，多练几次我会告诉你；</p>
          <p>如果你自己知道有什么口头禅，也可以直接告诉我。</p>
          <button className="btn btn-primary mt-16" onClick={() => navigate('/')}>
            去练一次
          </button>
        </div>
      )}

      {/* 系统检测区 */}
      {systemViews.length > 0 && (
        <>
          <div className="section-title">系统检测到的候选</div>
          {systemViews.map((v) => (
            <div key={v.tag} className="card">
              <div className="row-between wrap">
                <div>
                  <div className="row wrap">
                    <strong>{v.tag}</strong>
                    {v.status === 'declared-merged' && (
                      <span className="badge badge-success">你自己提到过 · 系统也发现了 {v.count} 次</span>
                    )}
                    {v.status === 'confirmed' && <span className="badge badge-success">已确认</span>}
                    {v.status === 'pending' && <span className="badge badge-neutral">待确认 · 出现 {v.count} 次</span>}
                    {v.status === 'dismissed' && <span className="badge badge-neutral">已忽略</span>}
                  </div>
                  {v.declared && v.declaredValue && (
                    <div className="muted mt-8">你声明的原始描述：{v.declaredValue}</div>
                  )}
                </div>
                <div className="row">
                  {v.status === 'pending' && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => handleConfirm(v.tag)}>
                        确认
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDismiss(v.tag)}>
                        忽略
                      </button>
                    </>
                  )}
                  {v.status === 'confirmed' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDismiss(v.tag)}>
                      不算问题了
                    </button>
                  )}
                  {v.status === 'dismissed' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => handleRestore(v.tag)}>
                      恢复关注
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* 已声明但系统还没检测到的问题 */}
      {declaredNotYetDetected.length > 0 && (
        <>
          <div className="section-title">你声明的问题（系统还没检测到）</div>
          {declaredNotYetDetected.map((d) => (
            <div key={d.id} className="card">
              <div className="row-between">
                <div className="row wrap">
                  <strong>{d.tag ?? d.value}</strong>
                  <span className="badge badge-neutral">{d.category}</span>
                  <span className="badge badge-lexicon">你声明的</span>
                </div>
                <button className="btn btn-danger-ghost btn-sm" onClick={() => handleRemoveDeclared(d.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* 自由描述兜底声明（独立展示，不参与合并） */}
      {freeformIssues.length > 0 && (
        <>
          <div className="section-title">你自己的记录（自由描述）</div>
          {freeformIssues.map((d) => (
            <div key={d.id} className="card">
              <div className="row-between">
                <div>
                  <div className="row wrap">
                    <span className="badge badge-neutral">{d.category}</span>
                    <span className="muted">仅作为你自己的记录展示，不参与系统合并</span>
                  </div>
                  <p style={{ margin: '8px 0 0' }}>{d.value}</p>
                </div>
                <button className="btn btn-danger-ghost btn-sm" onClick={() => handleRemoveDeclared(d.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {showAdd && <AddIssueDialog onClose={() => { setShowAdd(false); refresh() }} />}
    </div>
  )
}

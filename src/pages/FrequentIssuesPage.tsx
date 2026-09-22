/**
 * 我的表达习惯页：系统检测区 + 用户手动声明区。
 *
 * 展示按主次分组：想法没说完整（主）/ 用词习惯 / 临场状态。
 * 合并规则与原先一致，只是不再把填充词和思维外化混在一堆里。
 * 支持 ?tag= 高亮定位（反馈页/历史详情页的标签点击跳转过来）。
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import {
  HABIT_FAMILY_META,
  habitFamilyOf,
  habitFamilyOfCategory,
  habitLabel,
  type HabitFamily,
} from '../lib/habits'
import type { DeclaredInputType, FrequentIssueView, TagStatus } from '../lib/types'

const CATEGORY_INPUT_TYPE: Record<string, DeclaredInputType> = {
  逻辑结构: 'predefined',
  针对性: 'predefined',
  填充词: 'lexicon',
  模糊表达: 'lexicon',
  开场白依赖: 'predefined',
  紧张点: 'predefined',
  情绪失衡: 'predefined',
}

const CATEGORY_GROUPS: Array<{ family: HabitFamily; categories: string[] }> = [
  { family: 'thought', categories: ['逻辑结构', '针对性'] },
  { family: 'wording', categories: ['填充词', '模糊表达', '开场白依赖'] },
  { family: 'presence', categories: ['紧张点', '情绪失衡'] },
]

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
        <h3>添加你已知的习惯</h3>
        <p>先告诉我哪类想法总是说不完整。用词和临场状态也可以记，但那是辅助。</p>

        {!category && (
          <>
            {CATEGORY_GROUPS.map((group) => (
              <div key={group.family} className="mb-16">
                <div className="field-label">
                  {HABIT_FAMILY_META[group.family].title}
                  <span className="muted"> · {HABIT_FAMILY_META[group.family].hint}</span>
                </div>
                <div className="row wrap">
                  {group.categories.map((c) => (
                    <button key={c} className="btn btn-secondary btn-sm" onClick={() => setCategory(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {category && inputType === 'lexicon' && (
          <>
            <div className="field-label">输入具体的词（如「讲道理」）</div>
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder="你常说的填充词或模糊词…"
              autoFocus
            />
            <p className="muted mt-8">这个词会加入本地检测，之后每次练习都会被扫到。它是辅助，不是主记忆。</p>
          </>
        )}

        {category && inputType === 'predefined' && !freeform && (
          <>
            <div className="field-label">从「{HABIT_FAMILY_META[habitFamilyOfCategory(category)].title}」里选</div>
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
            <div className="field-label">用自己的话描述这个习惯</div>
            <textarea
              value={freeformText}
              onChange={(e) => setFreeformText(e.target.value)}
              style={{ minHeight: 90 }}
              placeholder="比如：总把结论留在最后，说到判断就收回去…"
              autoFocus
            />
            <p className="muted mt-8">
              这条不会自动和系统检测结果合并，仅作为你自己的记录展示。
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

function HabitCard({
  view,
  highlight,
  onConfirm,
  onDismiss,
  onRestore,
}: {
  view: FrequentIssueView
  highlight: boolean
  onConfirm: (tag: string) => void
  onDismiss: (tag: string) => void
  onRestore: (tag: string) => void
}) {
  const family = habitFamilyOf(view.tag)
  return (
    <div className={`card ${highlight ? 'card-highlight' : ''}`} data-tag={view.tag}>
      <div className="row-between wrap">
        <div>
          <div className="row wrap">
            <strong>{habitLabel(view.tag)}</strong>
            <span className={`badge ${family === 'thought' ? 'badge-ai' : 'badge-neutral'}`}>
              {HABIT_FAMILY_META[family].title}
            </span>
            {view.status === 'declared-merged' && (
              <span className="badge badge-success">你自己提到过 · 系统也发现了 {view.count} 次</span>
            )}
            {view.status === 'confirmed' && <span className="badge badge-success">已确认</span>}
            {view.status === 'pending' && (
              <span className="badge badge-neutral">待确认 · 出现 {view.count} 次</span>
            )}
            {view.status === 'dismissed' && <span className="badge badge-neutral">已忽略</span>}
          </div>
          {view.declared && view.declaredValue && (
            <div className="muted mt-8">你声明的原始描述：{view.declaredValue}</div>
          )}
        </div>
        <div className="row">
          {view.status === 'pending' && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => onConfirm(view.tag)}>
                确认
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onDismiss(view.tag)}>
                忽略
              </button>
            </>
          )}
          {view.status === 'confirmed' && (
            <button className="btn btn-ghost btn-sm" onClick={() => onDismiss(view.tag)}>
              不用再盯了
            </button>
          )}
          {view.status === 'dismissed' && (
            <button className="btn btn-secondary btn-sm" onClick={() => onRestore(view.tag)}>
              恢复关注
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FrequentIssuesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const highlightTag = searchParams.get('tag')
  const [showAdd, setShowAdd] = useState(false)
  const [tick, setTick] = useState(0)

  // 带高亮进入时滚动到对应卡片
  useEffect(() => {
    if (!highlightTag) return
    const t = window.setTimeout(() => {
      document
        .querySelector(`[data-tag="${CSS.escape(highlightTag)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
    return () => window.clearTimeout(t)
  }, [highlightTag])

  const refresh = () => setTick((t) => t + 1)

  const data = useMemo(() => {
    const sessions = loadSessions()
    const statuses = loadTagStatuses()
    const declared = loadDeclaredIssues()
    const threshold = getThreshold(loadSettings())
    const views = computeFrequentIssues(sessions, statuses, declared, threshold)
    return { views, declared, statuses }
  }, [tick])

  const systemViews = data.views
  const freeformIssues = data.declared.filter((d) => d.inputType === 'freeform')
  const declaredOnly = data.declared.filter(
    (d) => (d.inputType === 'lexicon' || d.inputType === 'predefined') && d.tag,
  )
  const mergedTags = new Set(systemViews.filter((v) => v.declared).map((v) => v.tag))
  const declaredNotYetDetected = declaredOnly.filter((d) => !mergedTags.has(d.tag as string))

  const byFamily = (family: HabitFamily) => ({
    views: systemViews.filter((v) => habitFamilyOf(v.tag) === family),
    declared: declaredNotYetDetected.filter((d) => habitFamilyOf(d.tag as string) === family),
  })

  const isEmpty = systemViews.length === 0 && data.declared.length === 0

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
    if (
      window.confirm(
        '确定要清空全部表达习惯记忆吗？包括确认/忽略状态和你手动声明的习惯。此操作不可恢复。',
      )
    ) {
      saveTagStatuses([] as TagStatus[])
      clearAllMemory()
      refresh()
    }
  }

  const families: HabitFamily[] = ['thought', 'wording', 'presence']

  return (
    <div>
      <div className="row-between wrap">
        <div>
          <h1 className="page-title">我的表达习惯</h1>
          <p className="page-subtitle">
            先记「想法有没有说完整」。用词是辅助。累计 ≥ {getThreshold(loadSettings())}{' '}
            次会提醒你确认。
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
          <p>暂时还没发现反复出现的习惯。多练几次我会告诉你哪类想法总是说不完整；</p>
          <p>你自己知道的，也可以直接告诉我。</p>
          <button className="btn btn-primary mt-16" onClick={() => navigate('/')}>
            去练一次
          </button>
        </div>
      )}

      {families.map((family) => {
        const group = byFamily(family)
        if (group.views.length === 0 && group.declared.length === 0) return null
        const meta = HABIT_FAMILY_META[family]
        return (
          <div key={family}>
            <div className="section-title">
              {meta.title}
              {family !== 'thought' && <span className="muted"> · 辅助</span>}
            </div>
            {group.views.map((v) => (
              <HabitCard
                key={v.tag}
                view={v}
                highlight={v.tag === highlightTag}
                onConfirm={handleConfirm}
                onDismiss={handleDismiss}
                onRestore={handleRestore}
              />
            ))}
            {group.declared.map((d) => (
              <div key={d.id} className="card">
                <div className="row-between">
                  <div className="row wrap">
                    <strong>{habitLabel(d.tag as string)}</strong>
                    <span className="badge badge-neutral">{meta.title}</span>
                    <span className="badge badge-lexicon">你声明的 · 系统还没检测到</span>
                  </div>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => handleRemoveDeclared(d.id)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {freeformIssues.length > 0 && (
        <>
          <div className="section-title">你自己的记录（自由描述）</div>
          {freeformIssues.map((d) => (
            <div key={d.id} className="card">
              <div className="row-between">
                <div>
                  <div className="row wrap">
                    <span className="badge badge-neutral">
                      {HABIT_FAMILY_META[habitFamilyOfCategory(d.category)].title}
                    </span>
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

      {showAdd && (
        <AddIssueDialog
          onClose={() => {
            setShowAdd(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

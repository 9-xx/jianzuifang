/**
 * 反馈结果页：
 * - 词库匹配结果瞬时展示（随 draft 带入）
 * - AI 语义反馈单独加载（预计 5-10 秒），失败显示"生成失败，点击重试"，不丢已录入内容
 * - AI 成功后：合并 feedbackTags 写入本地存储（唯一写入时机），展示完整反馈
 * - 高频问题确认卡片（累计 ≥ 阈值且未被声明/忽略）+ 双来源标注
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  fetchAiFeedback,
  finalizeAndSaveSession,
  mergeAiIntoDraft,
} from '../lib/practice-flow'
import { retryPracticePath } from '../data/scenarios'
import { simulateRoleLabel } from '../data/simulate-scenes'
import { habitFamilyOf, habitLabel } from '../lib/habits'
import { loadTagStatuses, loadSessions, loadDeclaredIssues, loadSettings } from '../lib/storage'
import { setTagStatus } from '../lib/issues'
import { classifySessionTags } from '../lib/memory'
import { getThreshold } from '../lib/settings'
import { ApiClientError } from '../lib/api-client'
import KeyGateBanner from '../components/KeyGateBanner'
import type {
  AiFeedbackResponse,
  InputMethod,
  PracticeMode,
  PracticeSession,
  SubMode,
} from '../lib/types'

interface SubmitParamsState {
  mode: PracticeMode
  subMode?: SubMode
  scenario: string
  scenarioId?: string
  promptText?: string
  material?: string
  userContent: string
  followUpQuestions?: string[]
  followUpAnswers?: string
  inputMethod: InputMethod
  durationSeconds?: number
}

interface LocationState {
  draft?: PracticeSession
  params?: SubmitParamsState
  autoSubmitted?: boolean
  storageError?: boolean
  /** 空内容/存储不可用分支直接带顶层场景名（练习页与模拟页都这样传） */
  scenario?: string
}

/** 空内容 / 存储不可用的特殊分支页 */
function SpecialFeedback({
  kind,
  state,
}: {
  kind: 'empty' | 'unavailable'
  state: LocationState
}) {
  const navigate = useNavigate()
  const scenario =
    state.scenario ??
    state.params?.scenario ??
    (kind === 'empty' ? state.params?.userContent : undefined)

  return (
    <div>
      <h1 className="page-title">{kind === 'empty' ? '这次没有留下内容' : '反馈生成结果'}</h1>
      {kind === 'empty' ? (
        <div className="card">
          <p>
            没关系，开口本身就是在练。下次试着先把那句结论说出来。
            {scenario ? `（场景：${scenario}）` : ''}
          </p>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => navigate(-1)}>
              再试一次
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/')}>
              回首页
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="notice notice-warn">
            当前浏览器环境无法保存记录，本次练习的反馈无法生成完整存档。你可以继续练习，但历史记录和表达习惯功能暂不可用。
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              回首页
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function FeedbackPage() {
  const { sessionId } = useParams()
  const location = useLocation()
  const state = (location.state ?? {}) as LocationState

  // 空内容 / 存储不可用分支
  if (sessionId === 'empty') {
    return <SpecialFeedback kind="empty" state={state} />
  }
  if (sessionId === 'unavailable') {
    return <SpecialFeedback kind="unavailable" state={state} />
  }

  return <FeedbackContent sessionId={sessionId ?? ''} state={state} />
}

function FeedbackContent({
  sessionId,
  state,
}: {
  sessionId: string
  state: LocationState
}) {
  const navigate = useNavigate()
  const params = state.params

  // draft 可能来自练习页（正常流程）；直接刷新页面时尝试从本地存储恢复
  const draft = useMemo<PracticeSession | null>(() => {
    if (state.draft) return state.draft
    const sessions = loadSessions()
    return sessions.find((s) => s.id === sessionId) ?? null
  }, [state.draft, sessionId])

  const [ai, setAi] = useState<AiFeedbackResponse | null>(null)
  const [aiLoading, setAiLoading] = useState(() => {
    const existing = state.draft
    return !(existing?.feedback.ideaCompleteness || existing?.feedback.relevance)
  })
  const [aiError, setAiError] = useState<string | null>(null)
  const [keyNeeded, setKeyNeeded] = useState(false)
  const [savedSession, setSavedSession] = useState<PracticeSession | null>(
    // 已在存储里（刷新恢复）则直接用
    state.draft ? null : (draft ?? null),
  )
  const [, setTick] = useState(0)
  const finalizedRef = useRef(false)

  const submitParams = params
    ? {
        mode: params.mode,
        ...(params.subMode ? { subMode: params.subMode } : {}),
        ...(params.scenarioId ? { scenarioId: params.scenarioId } : {}),
        ...(params.promptText ? { promptText: params.promptText } : {}),
        scenario: params.scenario,
        ...(params.material ? { material: params.material } : {}),
        ...(params.followUpQuestions && params.followUpQuestions.length > 0
          ? { followUpQuestions: params.followUpQuestions }
          : {}),
        ...(params.followUpAnswers ? { followUpAnswers: params.followUpAnswers } : {}),
        userContent: params.userContent,
        inputMethod: params.inputMethod,
        ...(params.durationSeconds != null ? { durationSeconds: params.durationSeconds } : {}),
      }
    : null

  const runAi = useCallback(async () => {
    if (!submitParams) return
    setAiLoading(true)
    setAiError(null)
    setKeyNeeded(false)
    try {
      const result = await fetchAiFeedback(submitParams)
      setAi(result)
    } catch (err) {
      if (err instanceof ApiClientError && err.keyRequired) {
        setKeyNeeded(true)
        setAiError(null)
      } else {
        setAiError(
          err instanceof ApiClientError
            ? err.message
            : '生成反馈失败，点击重试',
        )
      }
    } finally {
      setAiLoading(false)
    }
  }, [submitParams])

  useEffect(() => {
    if (
      savedSession &&
      (savedSession.feedback.logic ||
        savedSession.feedback.ideaCompleteness ||
        savedSession.feedback.relevance)
    ) {
      setAiLoading(false)
      return
    }
    if (!submitParams) {
      if (draft && (draft.feedback.ideaCompleteness || draft.feedback.relevance)) {
        setSavedSession(draft)
      }
      setAiLoading(false)
      return
    }
    void runAi()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // AI 成功 → 合并写入（唯一写入时机）
  useEffect(() => {
    if (!ai || !draft || finalizedRef.current) return
    finalizedRef.current = true
    try {
      const session = finalizeAndSaveSession(draft, ai)
      setSavedSession(session)
    } catch {
      // 存储不可用：反馈照常展示，只是不落库
      setSavedSession(mergeAiIntoDraft(draft, ai))
    }
  }, [ai, draft])

  if (!draft && !savedSession) {
    return (
      <div className="empty-state">
        <div className="icon">🤔</div>
        <p>没有找到这次练习的记录。</p>
        <button className="btn btn-primary mt-16" onClick={() => navigate('/')}>
          回首页
        </button>
      </div>
    )
  }

  const session = savedSession ?? draft
  if (!session) return null

  const isSummary = session.subMode === '整理总结'
  const isSimulate = session.mode === '材料模拟'
  const lexiconTags = session.feedbackTags.filter((t) => t.source === 'lexicon')
  const aiTags = session.feedbackTags.filter((t) => t.source === 'ai')

  // 高频问题确认卡片（AI 成功落库后计算）
  const tagViews =
    savedSession && savedSession.feedbackTags.length > 0
      ? classifySessionTags(
          session.feedbackTags.map((t) => t.tag),
          loadSessions(),
          loadTagStatuses(),
          loadDeclaredIssues(),
          getThreshold(loadSettings()),
        )
      : []

  const confirmNeeded = tagViews.filter((v) => v.needsConfirmation)
  const declaredHits = tagViews.filter((v) => v.declared)

  const handleConfirm = (tag: string) => {
    setTagStatus(tag, 'confirmed')
    setTick((t) => t + 1)
  }
  const handleDismiss = (tag: string) => {
    setTagStatus(tag, 'dismissed')
    setTick((t) => t + 1)
  }

  const f = session.feedback
  const encouragement = ai?.encouragement ?? f.encouragement
  const ideaCompleteness = ai?.ideaCompleteness ?? f.ideaCompleteness
  const opinionIndependence = ai?.opinionIndependence ?? f.opinionIndependence
  const logic = ai?.logic ?? f.logic
  const fluency = ai?.fluency ?? f.fluency
  const structure = ai?.structure ?? f.structure
  const informationCompleteness = ai?.informationCompleteness ?? f.informationCompleteness
  const relevance = ai?.relevance ?? f.relevance
  const highlight = ai?.highlight ?? f.highlight
  const risk = ai?.risk ?? f.risk
  const nextTip = ai?.nextTip ?? f.nextTip
  const comparedWithLast = ai?.comparedWithLast ?? f.comparedWithLast
  const hasAiText = Boolean(ideaCompleteness || logic || relevance)

  return (
    <div>
      <h1 className="page-title">这次有没有说出来</h1>
      <p className="page-subtitle">
        {session.scenario} · {session.mode}
        {session.simulate ? ` · ${session.simulate.persona}` : ''} · {session.inputMethod}作答
        {session.durationSeconds != null ? ` · 用时 ${session.durationSeconds} 秒` : ''}
      </p>

      {encouragement && (
        <div className="card" style={{ background: 'var(--success-soft)', borderColor: 'transparent' }}>
          💪 {encouragement}
        </div>
      )}

      {comparedWithLast && (
        <div className="compare-card mt-16">
          <div className="section-title mt-0">跟上一次比</div>
          <p>{comparedWithLast}</p>
        </div>
      )}

      {session.simulate?.transcript && session.simulate.transcript.length > 0 && (
        <div className="card mt-16">
          <div className="section-title mt-0">当时的对话</div>
          <div className="sim-thread">
            {session.simulate.transcript.map((turn, i) => (
              <div key={`${turn.role}-${i}`} className={`sim-bubble ${turn.role}`}>
                <div className="sim-role">
                  {turn.role === 'ai'
                    ? simulateRoleLabel(session.simulate?.sceneType ?? '面试')
                    : '你'}
                </div>
                {turn.text}
              </div>
            ))}
          </div>
        </div>
      )}
      {session.followUpQuestions && session.followUpQuestions.length > 0 && (
        <div className="card mt-16">
          <div className="section-title mt-0">当时的追问</div>
          <ol className="followup-list">
            {session.followUpQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
          {session.followUpAnswers ? (
            <p style={{ whiteSpace: 'pre-wrap', margin: '12px 0 0' }}>{session.followUpAnswers}</p>
          ) : (
            <p className="muted mt-8" style={{ marginBottom: 0 }}>
              这次跳过了追问。
            </p>
          )}
        </div>
      )}

      {/* AI：想法是否说出口（主） */}
      <div className="card mt-16">
        <div className="section-title mt-0">
          想法有没有说出来 <span className="badge badge-ai">AI 判断</span>
        </div>

        {aiLoading && (
          <div className="loading">
            <span className="spinner" />
            正在看你有没有把想法说完整，预计 5-10 秒<span className="loading-dots" />
          </div>
        )}

        {keyNeeded && <KeyGateBanner />}

        {aiError && (
          <div className="notice notice-error" role="alert">
            {aiError}
            <div className="mt-8">
              <button className="btn btn-secondary btn-sm" onClick={() => void runAi()}>
                点击重试
              </button>
            </div>
          </div>
        )}

        {hasAiText && (
          <>
            {ideaCompleteness && (
              <div className="feedback-dimension">
                <h4>想法完整度</h4>
                <p>{ideaCompleteness}</p>
              </div>
            )}
            {opinionIndependence && (
              <div className="feedback-dimension">
                <h4>观点是不是你的</h4>
                <p>{opinionIndependence}</p>
              </div>
            )}
            {isSimulate && relevance && (
              <div className="feedback-dimension">
                <h4>有没有落到这份材料</h4>
                <p>{relevance}</p>
              </div>
            )}
            {isSimulate && highlight && (
              <div className="feedback-dimension">
                <h4>答得好的点</h4>
                <p>{highlight}</p>
              </div>
            )}
            {isSimulate && risk && (
              <div className="feedback-dimension">
                <h4>最大风险</h4>
                <p>{risk}</p>
              </div>
            )}
            {isSimulate && nextTip && (
              <div className="feedback-dimension">
                <h4>下次开口可以先说</h4>
                <p>{nextTip}</p>
              </div>
            )}
            {logic && (
              <div className="feedback-dimension">
                <h4>逻辑性</h4>
                <p>{logic}</p>
              </div>
            )}
            {fluency && (
              <div className="feedback-dimension">
                <h4>流畅度</h4>
                <p>{fluency}</p>
              </div>
            )}
            {structure && (
              <div className="feedback-dimension">
                <h4>结构完整度</h4>
                <p>{structure}</p>
              </div>
            )}
            {isSummary && informationCompleteness && (
              <div className="feedback-dimension">
                <h4>信息保留完整度</h4>
                <p>{informationCompleteness}</p>
              </div>
            )}
            {aiTags.length > 0 && (
              <div className="row wrap mt-8">
                {aiTags.map((t) => (
                  <button
                    key={t.tag}
                    className="tag-chip tag-chip-link"
                    onClick={() => navigate('/frequent-issues?tag=' + encodeURIComponent(t.tag))}
                    title="看看这个习惯的记录"
                  >
                    {t.tag} <span className="badge badge-ai">AI</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 用词习惯（辅助，词库瞬时） */}
      <div className="card">
        <div className="section-title mt-0">
          用词习惯 <span className="badge badge-lexicon">辅助</span>
        </div>
        {session.feedback.fillerWords ? (
          <div className="feedback-dimension">
            <h4>填充词 / 口头禅 / 模糊表达</h4>
            <p>{session.feedback.fillerWords}</p>
          </div>
        ) : (
          <p className="muted">这次没有检测到填充词和模糊表达。</p>
        )}
        {lexiconTags.length > 0 && (
          <div className="row wrap mt-8">
            {lexiconTags.map((t) => (
              <button
                key={t.tag}
                className="tag-chip tag-chip-link"
                onClick={() => navigate('/frequent-issues?tag=' + encodeURIComponent(t.tag))}
                title="看看这个习惯的记录"
              >
                {t.tag} <span className="badge badge-lexicon">词库</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 命中用户已声明的问题：特别标注 */}
      {declaredHits.length > 0 && (
        <div className="notice notice-info mt-16">
          {declaredHits.map((v) => (
            <div key={v.tag}>
              ✅「{habitLabel(v.tag)}」—— 你自己提到过这个{v.count > 0 ? ` · 系统这边也发现了 ${v.count} 次` : ''}
            </div>
          ))}
        </div>
      )}

      {/* 高频问题确认卡片 */}
      {confirmNeeded.map((v) => (
        <div key={v.tag} className="confirm-card">
          <h4>这是你反复出现的习惯吗？</h4>
          <p>
            {habitFamilyOf(v.tag) === 'thought'
              ? `「${habitLabel(v.tag)}」已经累计出现 ${v.count} 次了。要不要我帮你盯着，看下次有没有把想法说完整？`
              : `「${habitLabel(v.tag)}」已经累计出现 ${v.count} 次了。要不要我帮你盯着？`}
          </p>
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={() => handleConfirm(v.tag)}>
              是，帮我盯着
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleDismiss(v.tag)}>
              忽略
            </button>
          </div>
        </div>
      ))}

      {/* 当时的阅读材料（整理总结） */}
      {isSummary && session.aiGeneratedMaterial && (
        <div className="card mt-16">
          <div className="section-title mt-0">📖 当时的阅读材料</div>
          <div className="material-block">{session.aiGeneratedMaterial}</div>
        </div>
      )}

      {/* 下一步 */}
      <div className="bottom-bar">
        <button className="btn btn-primary" onClick={() => navigate(retryPracticePath(session))}>
          再练一次
        </button>
        <button
          className="btn btn-secondary"
          onClick={() =>
            navigate(
              session.mode === '材料模拟'
                ? '/simulate'
                : `/scenarios/${encodeURIComponent(session.mode)}`,
            )
          }
        >
          换个场景
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/history')}>
          查看历史
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/frequent-issues')}>
          我的习惯
        </button>
      </div>
    </div>
  )
}

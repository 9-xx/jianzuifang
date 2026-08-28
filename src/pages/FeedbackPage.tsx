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
} from '../lib/practice-flow'
import { loadTagStatuses, loadSessions, loadDeclaredIssues, loadSettings } from '../lib/storage'
import { setTagStatus } from '../lib/issues'
import { classifySessionTags } from '../lib/memory'
import { getThreshold } from '../lib/settings'
import { ApiClientError } from '../lib/api-client'
import type {
  AiFeedbackResponse,
  FeedbackTag,
  InputMethod,
  PracticeMode,
  PracticeSession,
  SubMode,
} from '../lib/types'

interface SubmitParamsState {
  mode: PracticeMode
  subMode?: SubMode
  scenario: string
  material?: string
  userContent: string
  inputMethod: InputMethod
  durationSeconds?: number
}

interface LocationState {
  draft?: PracticeSession
  params?: SubmitParamsState
  autoSubmitted?: boolean
  storageError?: boolean
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
  const scenario = state.params?.scenario ?? state.params?.userContent

  return (
    <div>
      <h1 className="page-title">{kind === 'empty' ? '这次没有留下内容' : '反馈生成结果'}</h1>
      {kind === 'empty' ? (
        <div className="card">
          <p>
            没关系，开口练习本身就需要勇气，下次再试。
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
            当前浏览器环境无法保存记录，本次练习的反馈无法生成完整存档。你可以继续练习，但历史记录和高频问题功能暂不可用。
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
  const [aiLoading, setAiLoading] = useState(true)
  const [aiError, setAiError] = useState<string | null>(null)
  const [savedSession, setSavedSession] = useState<PracticeSession | null>(
    // 已在存储里（刷新恢复）则直接用
    state.draft ? null : (draft ?? null),
  )
  const finalizedRef = useRef(false)

  const submitParams = params
    ? {
        mode: params.mode,
        ...(params.subMode ? { subMode: params.subMode } : {}),
        scenario: params.scenario,
        ...(params.material ? { material: params.material } : {}),
        userContent: params.userContent,
        inputMethod: params.inputMethod,
        ...(params.durationSeconds != null ? { durationSeconds: params.durationSeconds } : {}),
      }
    : null

  const runAi = useCallback(async () => {
    if (!submitParams) return
    setAiLoading(true)
    setAiError(null)
    try {
      const result = await fetchAiFeedback(submitParams)
      setAi(result)
    } catch (err) {
      setAiError(
        err instanceof ApiClientError
          ? err.message
          : '生成反馈失败，点击重试',
      )
    } finally {
      setAiLoading(false)
    }
  }, [submitParams])

  useEffect(() => {
    // 已有完整记录（刷新恢复）则不再请求
    if (savedSession && savedSession.feedback.logic) {
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
      const aiTags: FeedbackTag[] = ai.tags.map((tag) => ({ tag, source: 'ai' as const }))
      setSavedSession({
        ...draft,
        feedback: {
          logic: ai.logic,
          fluency: ai.fluency,
          structure: ai.structure,
          ...(draft.subMode === '整理总结'
            ? {
                informationCompleteness: ai.informationCompleteness,
                opinionIndependence: ai.opinionIndependence,
              }
            : {}),
          ...(draft.feedback.fillerWords ? { fillerWords: draft.feedback.fillerWords } : {}),
          encouragement: ai.encouragement,
        },
        feedbackTags: [...draft.feedbackTags, ...aiTags],
      })
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
  const lexiconTags = session.feedbackTags.filter((t) => t.source === 'lexicon')
  const aiTags = session.feedbackTags.filter((t) => t.source === 'ai')

  // 高频问题确认卡片（AI 成功落库后计算）
  const tagViews =
    ai && savedSession
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
    forceUpdate()
  }
  const handleDismiss = (tag: string) => {
    setTagStatus(tag, 'dismissed')
    forceUpdate()
  }

  const [, setTick] = useState(0)
  function forceUpdate() {
    setTick((t) => t + 1)
  }

  return (
    <div>
      <h1 className="page-title">这次的表现</h1>
      <p className="page-subtitle">
        {session.scenario} · {session.inputMethod}作答
        {session.durationSeconds != null ? ` · 用时 ${session.durationSeconds} 秒` : ''}
      </p>

      {/* 鼓励性总结（AI 成功后展示） */}
      {ai && (
        <div className="card" style={{ background: 'var(--success-soft)', borderColor: 'transparent' }}>
          💪 {ai.encouragement}
        </div>
      )}

      {/* 填充词维度（词库匹配，瞬时展示，不等 AI） */}
      <div className="card mt-16">
        <div className="section-title mt-0">
          词库检测 <span className="badge badge-lexicon">本地匹配</span>
        </div>
        {session.feedback.fillerWords ? (
          <div className="feedback-dimension">
            <h4>填充词 / 口头禅 / 模糊表达</h4>
            <p>{session.feedback.fillerWords}</p>
          </div>
        ) : (
          <p className="muted">这次没有检测到填充词和模糊表达，很干净！</p>
        )}
        {lexiconTags.length > 0 && (
          <div className="row wrap mt-8">
            {lexiconTags.map((t) => (
              <span key={t.tag} className="tag-chip">
                {t.tag} <span className="badge badge-lexicon">词库</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* AI 语义反馈 */}
      <div className="card">
        <div className="section-title mt-0">
          AI 语义分析 <span className="badge badge-ai">AI 判断</span>
        </div>

        {aiLoading && (
          <div className="loading">
            <span className="spinner" />
            正在分析逻辑结构、流畅度等维度，预计 5-10 秒<span className="loading-dots" />
          </div>
        )}

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

        {ai && (
          <>
            <div className="feedback-dimension">
              <h4>逻辑性</h4>
              <p>{ai.logic}</p>
            </div>
            <div className="feedback-dimension">
              <h4>流畅度</h4>
              <p>{ai.fluency}</p>
            </div>
            <div className="feedback-dimension">
              <h4>结构完整度</h4>
              <p>{ai.structure}</p>
            </div>
            {isSummary && (
              <>
                <div className="feedback-dimension">
                  <h4>信息保留完整度</h4>
                  <p>{ai.informationCompleteness}</p>
                </div>
                <div className="feedback-dimension">
                  <h4>个人观点独立性</h4>
                  <p>{ai.opinionIndependence}</p>
                </div>
              </>
            )}
            {aiTags.length > 0 && (
              <div className="row wrap mt-8">
                {aiTags.map((t) => (
                  <span key={t.tag} className="tag-chip">
                    {t.tag} <span className="badge badge-ai">AI</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 命中用户已声明的问题：特别标注 */}
      {declaredHits.length > 0 && (
        <div className="notice notice-info mt-16">
          {declaredHits.map((v) => (
            <div key={v.tag}>
              ✅「{v.tag}」—— 你自己提到过这个{v.count > 0 ? ` · 系统这边也发现了 ${v.count} 次` : ''}
            </div>
          ))}
        </div>
      )}

      {/* 高频问题确认卡片 */}
      {confirmNeeded.map((v) => (
        <div key={v.tag} className="confirm-card">
          <h4>这是你反复出现的问题吗？</h4>
          <p>
            「{v.tag}」已经累计出现 {v.count} 次了。要不要我帮你重点盯一下？
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
        <button
          className="btn btn-primary"
          onClick={() =>
            navigate(
              `/practice?mode=${encodeURIComponent(session.mode)}${
                session.subMode ? `&subMode=${encodeURIComponent(session.subMode)}` : ''
              }`,
            )
          }
        >
          再练一次
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => navigate(`/scenarios/${encodeURIComponent(session.mode)}`)}
        >
          换个场景
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/history')}>
          查看历史
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/frequent-issues')}>
          我的高频问题
        </button>
      </div>
    </div>
  )
}

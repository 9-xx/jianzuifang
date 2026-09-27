/**
 * 练习页：
 * - 开口前有一句短引导（计时从点「开始开口」才算）
 * - 语音 / 打字平级可选；不支持语音则降级为打字
 * - 即兴问答：抽题 + 倒计时，超时自动提交
 * - 整理总结：读材料 → 引导 → 总结 → 追问 1-2 个细节 → 进反馈
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { findScenario, pickQuestion, type ImpromptuScenario } from '../data/scenarios'
import { loadSettings, StorageUnavailableError } from '../lib/storage'
import { updatePreferredInputMethod } from '../lib/settings'
import { checkSpeechSupport, SpeechDictation } from '../lib/speech'
import { ApiClientError, requestFollowUp, requestMaterial } from '../lib/api-client'
import KeyGateBanner from '../components/KeyGateBanner'
import { buildSessionDraft } from '../lib/practice-flow'
import type { InputMethod, PracticeMode, SubMode } from '../lib/types'

type Phase = 'reading' | 'warmup' | 'answering' | 'followup'

function warmupCopy(mode: string, subMode?: string): { title: string; body: string } {
  if (mode === '即兴问答') {
    return {
      title: '先把那句话说出来',
      body: '被问到时，先说判断，再补理由。不要求完整，更不要等想完美。计时从你点开始才算。',
    }
  }
  if (subMode === '自由生成') {
    return {
      title: '先说结论',
      body: '框架已经给你了。开口时先把结论说完；卡住了停半秒，别用「然后」填。说出来比说完美重要。',
    }
  }
  return {
    title: '用自己的话说',
    body: '接下来用你的话讲：你记住了什么，你怎么看。说完我会追问一两个细节，看看是不是真理解了。',
  }
}

export default function PracticePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const mode = searchParams.get('mode') ?? '即兴问答'
  const subMode = searchParams.get('subMode') ?? undefined
  const scenarioId = searchParams.get('scenario') ?? ''
  const pinnedQuestion = searchParams.get('q') ?? ''

  const scenario = useMemo(() => findScenario(scenarioId), [scenarioId])

  const speechSupport = useMemo(() => checkSpeechSupport(), [])
  const [inputMethod, setInputMethod] = useState<InputMethod>(() => {
    const preferred = loadSettings().preferredInputMethod
    if (preferred === '语音' && !speechSupport.supported) return '打字'
    return preferred ?? '打字'
  })
  const [speechNotice, setSpeechNotice] = useState<string | null>(
    speechSupport.supported ? null : (speechSupport.reason ?? null),
  )

  const handleInputMethodChange = useCallback((method: InputMethod) => {
    if (method === '语音' && !checkSpeechSupport().supported) {
      setSpeechNotice('当前浏览器不支持语音识别，请使用打字输入')
      return
    }
    setInputMethod(method)
    setSpeechNotice(null)
    try {
      updatePreferredInputMethod(method)
    } catch {
      /* 存储不可用时不阻断练习 */
    }
  }, [])

  const [question, setQuestion] = useState('')
  useEffect(() => {
    if (mode === '即兴问答' && scenario && 'questions' in scenario) {
      const pool = scenario as ImpromptuScenario
      if (pinnedQuestion && pool.questions.includes(pinnedQuestion)) {
        setQuestion(pinnedQuestion)
        return
      }
      setQuestion(pickQuestion(pool))
    }
  }, [mode, scenario, pinnedQuestion])

  const timeLimit =
    mode === '即兴问答' && scenario && 'timeLimitSeconds' in scenario
      ? (scenario as ImpromptuScenario).timeLimitSeconds
      : undefined
  const [secondsLeft, setSecondsLeft] = useState<number | undefined>(timeLimit)

  const [material, setMaterial] = useState<string | null>(null)
  const [materialLoading, setMaterialLoading] = useState(false)
  const [materialError, setMaterialError] = useState<string | null>(null)
  const [materialKeyNeeded, setMaterialKeyNeeded] = useState(false)
  const [phase, setPhase] = useState<Phase>(subMode === '整理总结' ? 'reading' : 'warmup')

  const generateMaterial = useCallback(async () => {
    if (!scenario || !('topic' in scenario)) return
    setMaterialLoading(true)
    setMaterialError(null)
    setMaterialKeyNeeded(false)
    try {
      const res = await requestMaterial(scenario.topic)
      setMaterial(res.material)
    } catch (err) {
      setMaterialKeyNeeded(err instanceof ApiClientError && err.keyRequired)
      setMaterialError(err instanceof Error ? err.message : '内容生成失败，点击重新生成')
    } finally {
      setMaterialLoading(false)
    }
  }, [scenario])

  useEffect(() => {
    if (subMode === '整理总结' && phase === 'reading' && material === null && !materialLoading && !materialError) {
      void generateMaterial()
    }
  }, [subMode, phase, material, materialLoading, materialError, generateMaterial])

  const [text, setText] = useState('')
  const textRef = useRef('')
  textRef.current = text
  const [listening, setListening] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const dictationRef = useRef<SpeechDictation | null>(null)

  const summaryRef = useRef('')
  const followUpQuestionsRef = useRef<string[]>([])
  const skippedFollowUpRef = useRef(false)
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([])
  const [followUpLoading, setFollowUpLoading] = useState(false)
  const [followUpError, setFollowUpError] = useState<string | null>(null)
  const [followUpKeyNeeded, setFollowUpKeyNeeded] = useState(false)

  const stopDictation = useCallback(() => {
    dictationRef.current?.abort()
    dictationRef.current = null
    setListening(false)
  }, [])

  const toggleListening = useCallback(() => {
    if (listening) {
      const finalText = dictationRef.current?.stop() ?? ''
      dictationRef.current = null
      setListening(false)
      if (finalText) setText(finalText)
      return
    }

    setMicError(null)
    const dictation = new SpeechDictation({
      onText: (t) => setText(t),
      onError: (msg) => {
        setMicError(msg)
      },
      onEnd: () => setListening(false),
    })
    dictationRef.current = dictation
    if (dictation.start()) {
      setListening(true)
    } else {
      dictationRef.current = null
      setMicError('无法启动语音识别，请改用打字输入')
    }
  }, [listening])

  const submittedRef = useRef(false)

  const goToFeedback = useCallback(
    (opts: { userContent: string; followUpAnswers?: string; autoSubmitted?: boolean }) => {
      if (submittedRef.current) return
      submittedRef.current = true
      stopDictation()

      const content = opts.userContent.trim()
      if (!content) {
        navigate('/feedback/empty', {
          state: {
            autoSubmitted: opts.autoSubmitted,
            mode,
            scenario: scenario?.name ?? '',
            subMode,
          },
        })
        return
      }

      const durationSeconds =
        timeLimit != null ? Math.min(timeLimit, timeLimit - (secondsLeft ?? 0)) : undefined
      const questions = followUpQuestionsRef.current

      try {
        const { draft } = buildSessionDraft({
          mode: mode as PracticeMode,
          ...(subMode ? { subMode: subMode as SubMode } : {}),
          scenario: scenario?.name ?? '',
          ...(scenario?.id ? { scenarioId: scenario.id } : {}),
          ...(mode === '即兴问答' && question ? { promptText: question } : {}),
          ...(material ? { material } : {}),
          userContent: content,
          ...(questions.length > 0 ? { followUpQuestions: questions } : {}),
          ...(opts.followUpAnswers ? { followUpAnswers: opts.followUpAnswers } : {}),
          inputMethod,
          ...(durationSeconds != null && durationSeconds > 0 ? { durationSeconds } : {}),
        })
        navigate(`/feedback/${draft.id}`, {
          state: {
            draft,
            params: {
              mode,
              subMode,
              scenario: scenario?.name ?? '',
              scenarioId: scenario?.id,
              promptText: mode === '即兴问答' ? question : undefined,
              material,
              userContent: content,
              followUpQuestions: questions.length > 0 ? questions : undefined,
              followUpAnswers: opts.followUpAnswers,
              inputMethod,
              durationSeconds,
            },
          },
        })
      } catch (err) {
        if (err instanceof StorageUnavailableError) {
          navigate('/feedback/unavailable', {
            state: {
              storageError: true,
              mode,
              scenario: scenario?.name ?? '',
              subMode,
              userContent: content,
              inputMethod,
            },
          })
        }
      }
    },
    [navigate, mode, subMode, scenario, material, inputMethod, timeLimit, secondsLeft, stopDictation, question],
  )

  const beginFollowUp = useCallback(
    async (summary: string) => {
      summaryRef.current = summary
      skippedFollowUpRef.current = false
      setText('')
      textRef.current = ''
      setFollowUpQuestions([])
      followUpQuestionsRef.current = []
      setFollowUpError(null)
      setFollowUpKeyNeeded(false)
      setFollowUpLoading(true)
      setPhase('followup')
      stopDictation()

      const topic = scenario && 'topic' in scenario ? scenario.topic : (scenario?.name ?? '')
      try {
        const res = await requestFollowUp({
          material: material ?? '',
          userContent: summary,
          ...(topic ? { topic } : {}),
        })
        if (skippedFollowUpRef.current) return
        const questions = res.questions.slice(0, 2)
        if (questions.length === 0) {
          goToFeedback({ userContent: summary })
          return
        }
        followUpQuestionsRef.current = questions
        setFollowUpQuestions(questions)
      } catch (err) {
        if (skippedFollowUpRef.current) return
        setFollowUpKeyNeeded(err instanceof ApiClientError && err.keyRequired)
        setFollowUpError(
          err instanceof ApiClientError && !err.keyRequired
            ? err.message
            : err instanceof Error
              ? null
              : '追问生成失败，可以跳过或重试',
        )
      } finally {
        if (!skippedFollowUpRef.current) setFollowUpLoading(false)
      }
    },
    [goToFeedback, material, scenario, stopDictation],
  )

  const skipFollowUp = useCallback(() => {
    skippedFollowUpRef.current = true
    goToFeedback({ userContent: summaryRef.current })
  }, [goToFeedback])

  const submit = useCallback(
    (autoSubmitted: boolean) => {
      stopDictation()
      const content = textRef.current.trim()

      if (phase === 'answering' && subMode === '整理总结' && !autoSubmitted) {
        if (!content) return
        void beginFollowUp(content)
        return
      }

      if (phase === 'followup') {
        goToFeedback({
          userContent: summaryRef.current,
          ...(content ? { followUpAnswers: content } : {}),
        })
        return
      }

      goToFeedback({ userContent: content, autoSubmitted })
    },
    [phase, subMode, beginFollowUp, goToFeedback, stopDictation],
  )

  useEffect(() => {
    if (phase !== 'answering' || timeLimit == null) return
    if (secondsLeft == null) return
    if (secondsLeft <= 0) {
      submit(true)
      return
    }
    const timer = setTimeout(() => setSecondsLeft((s) => (s != null ? s - 1 : s)), 1000)
    return () => clearTimeout(timer)
  }, [phase, secondsLeft, timeLimit, submit])

  useEffect(() => () => stopDictation(), [stopDictation])

  if (!scenario) {
    return (
      <div className="empty-state">
        <div className="icon">🤔</div>
        <p>没有找到这个场景，可能链接已失效。</p>
        <button className="btn btn-primary mt-16" onClick={() => navigate('/')}>
          回首页
        </button>
      </div>
    )
  }

  const timerClass =
    secondsLeft == null
      ? ''
      : secondsLeft <= 10
        ? 'timer danger'
        : secondsLeft <= 30
          ? 'timer warning'
          : 'timer'

  const warmup = warmupCopy(mode, subMode)
  const showComposer = phase === 'answering' || (phase === 'followup' && !followUpLoading)
  const composerPlaceholder =
    phase === 'followup'
      ? inputMethod === '语音'
        ? '用自己的话回答追问，识别文字会出现在这里'
        : '用自己的话回答上面的追问…'
      : inputMethod === '语音'
        ? '识别的文字会显示在这里，也可以直接补充修改'
        : '在这里把想法说出来…'

  return (
    <div>
      <button className="back-link" onClick={() => navigate(-1)}>
        ← 换个场景
      </button>

      <h1 className="page-title">{scenario.name}</h1>
      <p className="page-subtitle">{scenario.description}</p>

      {subMode === '整理总结' && (
        <div className="card mb-16">
          <div className="row-between mb-8">
            <strong>📖 阅读材料</strong>
            {material && phase === 'reading' && (
              <span className="muted">约 {material.length} 字 · 读完后点下方按钮</span>
            )}
          </div>
          {materialLoading && (
            <div className="loading">
              <span className="spinner" />
              正在生成阅读材料，预计 5-10 秒<span className="loading-dots" />
            </div>
          )}
          {materialError && (
            <div className="notice notice-error" role="alert">
              {materialError}
              <button className="btn btn-secondary btn-sm mt-8" onClick={() => void generateMaterial()}>
                重新生成
              </button>
            </div>
          )}
          {materialKeyNeeded && <KeyGateBanner />}
          {material && <div className="material-block">{material}</div>}
          {material && phase === 'reading' && (
            <div className="btn-row">
              <button className="btn btn-primary btn-lg" onClick={() => setPhase('warmup')}>
                阅读完成，下一步 →
              </button>
            </div>
          )}
        </div>
      )}

      {mode === '即兴问答' && question && (
        <div className="card mb-16">
          <div className="muted mb-8">本次题目（随机抽取）</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{question}</div>
          {phase === 'answering' && (
            <p className="muted mt-8" style={{ marginBottom: 0 }}>
              先把结论说出来，再补一两个理由。宁可短，也别让想法停在脑子里。
            </p>
          )}
        </div>
      )}

      {(phase === 'warmup' || phase === 'answering') &&
        'frameworkHint' in scenario &&
        scenario.frameworkHint && (
          <div className="framework-hint mb-16">
            <strong>先用这个结构开口</strong>
            <p>{scenario.frameworkHint}</p>
          </div>
        )}

      {phase === 'warmup' && (
        <div className="warmup-card mb-16">
          <strong>{warmup.title}</strong>
          <p>{warmup.body}</p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-lg" onClick={() => setPhase('answering')}>
              开始开口
            </button>
          </div>
        </div>
      )}

      {phase === 'followup' && summaryRef.current && (
        <div className="card mb-16">
          <div className="section-title mt-0">你刚才的总结</div>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{summaryRef.current}</p>
        </div>
      )}

      {phase === 'followup' && (
        <div className="card mb-16">
          <div className="section-title mt-0">追问一下</div>
          {followUpLoading && (
            <div className="loading">
              <span className="spinner" />
              正在出一两个细节问题，预计 5-10 秒<span className="loading-dots" />
            </div>
          )}
          {followUpError && (
            <div className="notice notice-error" role="alert">
              {followUpError}
              <div className="mt-8 row wrap">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => void beginFollowUp(summaryRef.current)}
                >
                  重新生成
                </button>
                <button className="btn btn-ghost btn-sm" onClick={skipFollowUp}>
                  跳过，直接看反馈
                </button>
              </div>
            </div>
          )}
          {followUpKeyNeeded && <KeyGateBanner />}
          {followUpQuestions.length > 0 && (
            <ol className="followup-list">
              {followUpQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          )}
          {followUpLoading && (
            <button className="btn btn-ghost btn-sm mt-16" onClick={skipFollowUp}>
              跳过，直接看反馈
            </button>
          )}
        </div>
      )}

      {showComposer && (
        <div className="card">
          <div className="row-between wrap mb-8">
            <div className="segmented" role="tablist" aria-label="输入方式">
              <button
                className={inputMethod === '语音' ? 'active' : ''}
                onClick={() => handleInputMethodChange('语音')}
              >
                🎙 语音
              </button>
              <button
                className={inputMethod === '打字' ? 'active' : ''}
                onClick={() => handleInputMethodChange('打字')}
              >
                ⌨️ 打字
              </button>
            </div>

            {phase === 'answering' && timeLimit != null && (
              <div className="row">
                <span className={timerClass}>
                  {Math.floor((secondsLeft ?? 0) / 60)}:
                  {String((secondsLeft ?? 0) % 60).padStart(2, '0')}
                </span>
                <span className="muted">后自动提交</span>
              </div>
            )}
          </div>

          {speechNotice && <div className="notice notice-info">{speechNotice}</div>}

          {inputMethod === '语音' ? (
            <div style={{ textAlign: 'center', padding: '18px 0' }}>
              <button
                className={`mic-button ${listening ? 'recording' : ''}`}
                onClick={toggleListening}
                aria-label={listening ? '停止录音' : '开始录音'}
              >
                {listening ? '⏹' : '🎙'}
              </button>
              <div className="muted mt-8">
                {listening ? '正在聆听，说吧…（再点一次停止）' : '点击开始说话'}
              </div>
              {micError && (
                <div className="notice notice-error" role="alert">
                  {micError}
                  <div className="mt-8">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleInputMethodChange('打字')}>
                      改用打字输入
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && text.trim()) {
                e.preventDefault()
                submit(false)
              }
            }}
            placeholder={composerPlaceholder}
          />

          <div className="btn-row">
            {phase === 'followup' ? (
              <>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => submit(false)}
                  disabled={!text.trim()}
                >
                  答完了，看反馈
                </button>
                <button className="btn btn-ghost" onClick={skipFollowUp}>
                  跳过追问
                </button>
                <span className="kbd-hint">⌘/Ctrl + Enter 提交</span>
              </>
            ) : (
              <>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => submit(false)}
                  disabled={!text.trim()}
                >
                  {subMode === '整理总结' ? '总结完了，下一问' : '完成'}
                  {timeLimit != null ? `（剩 ${secondsLeft ?? 0} 秒）` : ''}
                </button>
                {timeLimit == null && <span className="kbd-hint">⌘/Ctrl + Enter 提交</span>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

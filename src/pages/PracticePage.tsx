/**
 * 练习页：
 * - 语音 / 打字平级可选（segmented 切换），加载时默认选中 preferredInputMethod
 * - 浏览器不支持语音识别 → 自动降级为打字并简短说明（不阻断）
 * - 即兴问答：显示抽到的题目 + 倒计时，超时自动提交（空内容也给鼓励式反馈）
 * - 整理总结：先展示 AI 生成的阅读材料（失败可重新生成），读完点"开始总结"
 * - 切换输入方式时自动更新 preferredInputMethod（隐式记忆）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { findScenario, pickQuestion, type ImpromptuScenario } from '../data/scenarios'
import { loadSettings, StorageUnavailableError } from '../lib/storage'
import { updatePreferredInputMethod } from '../lib/settings'
import { checkSpeechSupport, SpeechDictation } from '../lib/speech'
import { requestMaterial } from '../lib/api-client'
import { buildSessionDraft } from '../lib/practice-flow'
import type { InputMethod } from '../lib/types'

type Phase = 'reading' | 'answering'

export default function PracticePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const mode = searchParams.get('mode') ?? '即兴问答'
  const subMode = searchParams.get('subMode') ?? undefined
  const scenarioId = searchParams.get('scenario') ?? ''

  const scenario = useMemo(() => findScenario(scenarioId), [scenarioId])

  // ---- 输入方式：默认选中用户上次的偏好；不支持语音则降级 ----
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
    // 隐式记忆：切换后自动更新偏好，供下次默认使用
    try {
      updatePreferredInputMethod(method)
    } catch {
      /* 存储不可用时不阻断练习 */
    }
  }, [])

  // ---- 即兴问答：抽题 + 计时 ----
  const [question, setQuestion] = useState('')
  useEffect(() => {
    if (mode === '即兴问答' && scenario && 'questions' in scenario) {
      setQuestion(pickQuestion(scenario as ImpromptuScenario))
    }
  }, [mode, scenario])

  const timeLimit =
    mode === '即兴问答' && scenario && 'timeLimitSeconds' in scenario
      ? (scenario as ImpromptuScenario).timeLimitSeconds
      : undefined
  const [secondsLeft, setSecondsLeft] = useState<number | undefined>(timeLimit)

  // ---- 整理总结：材料生成 ----
  const [material, setMaterial] = useState<string | null>(null)
  const [materialLoading, setMaterialLoading] = useState(false)
  const [materialError, setMaterialError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>(subMode === '整理总结' ? 'reading' : 'answering')

  const generateMaterial = useCallback(async () => {
    if (!scenario || !('topic' in scenario)) return
    setMaterialLoading(true)
    setMaterialError(null)
    try {
      const res = await requestMaterial(scenario.topic)
      setMaterial(res.material)
    } catch (err) {
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

  // ---- 作答内容 ----
  const [text, setText] = useState('')
  const textRef = useRef('')
  textRef.current = text
  const [listening, setListening] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const dictationRef = useRef<SpeechDictation | null>(null)

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
        // 麦克风权限被拒绝等场景：自动提供"改用打字输入"的选项（提示里已含指引）
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

  // ---- 提交 ----
  const submittedRef = useRef(false)

  const submit = useCallback(
    (autoSubmitted: boolean) => {
      if (submittedRef.current) return
      submittedRef.current = true

      stopDictation()
      const content = textRef.current.trim()

      // 空内容：即兴问答超时自动提交时给鼓励式反馈，不报错
      if (!content) {
        navigate('/feedback/empty', {
          state: {
            autoSubmitted,
            mode,
            scenario: scenario?.name ?? '',
            subMode,
          },
        })
        return
      }

      const durationSeconds =
        timeLimit != null ? Math.min(timeLimit, timeLimit - (secondsLeft ?? 0)) : undefined

      try {
        const { draft } = buildSessionDraft({
          mode: mode as '即兴问答' | '结构化表达',
          ...(subMode ? { subMode: subMode as '自由生成' | '整理总结' } : {}),
          scenario: scenario?.name ?? '',
          ...(material ? { material } : {}),
          userContent: content,
          inputMethod,
          ...(durationSeconds != null && durationSeconds > 0 ? { durationSeconds } : {}),
        })
        // 把草稿与提交参数带到反馈页（反馈页负责调 AI、合并、落库）
        navigate(`/feedback/${draft.id}`, {
          state: { draft, params: { ...{ mode, subMode, scenario: scenario?.name ?? '', material, userContent: content, inputMethod, durationSeconds } } },
        })
      } catch (err) {
        if (err instanceof StorageUnavailableError) {
          // 存储不可用：本次练习照常进行，只是不落库
          navigate('/feedback/unavailable', {
            state: { storageError: true, mode, scenario: scenario?.name ?? '', subMode, userContent: content, inputMethod },
          })
        }
      }
    },
    [navigate, mode, subMode, scenario, material, inputMethod, timeLimit, secondsLeft, stopDictation],
  )

  // 倒计时：超时自动提交
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

  // 卸载时停止录音
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

  return (
    <div>
      <button className="back-link" onClick={() => navigate(-1)}>
        ← 换个场景
      </button>

      {/* 场景说明 + 引导语 */}
      <h1 className="page-title">{scenario.name}</h1>
      <p className="page-subtitle">{scenario.description}</p>

      {/* 整理总结：阅读材料区块 */}
      {subMode === '整理总结' && (
        <div className="card mb-16">
          <div className="row-between mb-8">
            <strong>📖 阅读材料</strong>
            {material && (
              <span className="muted">约 {material.length} 字 · 读完后点下方按钮开始总结</span>
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
          {material && <div className="material-block">{material}</div>}
          {material && phase === 'reading' && (
            <div className="btn-row">
              <button className="btn btn-primary btn-lg" onClick={() => setPhase('answering')}>
                阅读完成，开始总结 →
              </button>
            </div>
          )}
        </div>
      )}

      {/* 即兴问答：抽到的题目 */}
      {mode === '即兴问答' && question && (
        <div className="card mb-16">
          <div className="muted mb-8">本次题目（随机抽取）</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{question}</div>
        </div>
      )}

      {phase === 'answering' && (
        <div className="card">
          {/* 输入方式切换：语音 / 打字平级可选 */}
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

            {/* 计时器（即兴问答） */}
            {timeLimit != null && (
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

          {/* 文本区：两种方式共用（语音实时显示识别文字，可手动修改） */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              inputMethod === '语音'
                ? '识别的文字会显示在这里，也可以直接补充修改'
                : '在这里输入你的回答…'
            }
          />

          <div className="btn-row">
            <button className="btn btn-primary btn-lg" onClick={() => submit(false)} disabled={!text.trim()}>
              完成{timeLimit != null ? `（剩 ${secondsLeft ?? 0} 秒）` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 材料模拟 · 入戏页：多轮对话，结束后才出戏复盘。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiClientError, requestSimulateReview, requestSimulateTurn } from '../lib/api-client'
import { buildSessionDraft, finalizeAndSaveSession, mergeAiIntoDraft } from '../lib/practice-flow'
import { findPreviousComparableSession, toPreviousAttempt } from '../lib/compare'
import { loadSettings, StorageUnavailableError } from '../lib/storage'
import { updatePreferredInputMethod } from '../lib/settings'
import { checkSpeechSupport, SpeechDictation } from '../lib/speech'
import {
  loadSimulateLive,
  MAX_SIMULATE_USER_TURNS,
  saveSimulateLive,
  type SimulateLive,
} from '../lib/simulate-storage'
import {
  isSpeechFirstScene,
  simulateComposerPlaceholder,
  simulateInCharacterCopy,
  simulateRoleLabel,
  simulateWarmupCopy,
} from '../data/simulate-scenes'
import type { InputMethod } from '../lib/types'

type Phase = 'warmup' | 'talking' | 'ended'

export default function SimulatePlayPage() {
  const navigate = useNavigate()
  const [live, setLive] = useState<SimulateLive | null>(() => loadSimulateLive())
  const [phase, setPhase] = useState<Phase>(() => {
    const current = loadSimulateLive()
    if (!current) return 'warmup'
    if (current.done) return 'ended'
    return current.transcript.some((t) => t.role === 'user') ? 'talking' : 'warmup'
  })
  const [text, setText] = useState('')
  const textRef = useRef('')
  textRef.current = text
  const [listening, setListening] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const dictationRef = useRef<SpeechDictation | null>(null)
  const [sending, setSending] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showMaterial, setShowMaterial] = useState(false)
  const liveRef = useRef(live)
  liveRef.current = live

  const speechSupport = useMemo(() => checkSpeechSupport(), [])
  const [inputMethod, setInputMethod] = useState<InputMethod>(() => {
    const preferred = loadSettings().preferredInputMethod
    if (preferred === '语音' && !speechSupport.supported) return '打字'
    return preferred ?? '打字'
  })
  const [speechNotice, setSpeechNotice] = useState<string | null>(
    speechSupport.supported ? null : (speechSupport.reason ?? null),
  )

  const persist = useCallback((next: SimulateLive) => {
    setLive(next)
    liveRef.current = next
    try {
      saveSimulateLive(next)
    } catch {
      /* sessionStorage 不可用不阻断当场 */
    }
  }, [])

  const stopDictation = useCallback(() => {
    dictationRef.current?.abort()
    dictationRef.current = null
    setListening(false)
  }, [])

  const handleInputMethodChange = useCallback((method: InputMethod) => {
    if (method === '语音' && !checkSpeechSupport().supported) {
      setSpeechNotice('当前浏览器不支持语音识别，请使用打字输入')
      return
    }
    stopDictation()
    setInputMethod(method)
    setSpeechNotice(null)
    try {
      updatePreferredInputMethod(method)
    } catch {
      /* ignore */
    }
  }, [stopDictation])

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
      onError: (msg) => setMicError(msg),
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

  useEffect(() => () => stopDictation(), [stopDictation])

  const sendTurn = useCallback(async () => {
    const current = liveRef.current
    const content = textRef.current.trim()
    if (!current || !content || sending || phase !== 'talking' || current.done) return

    const userTurns = current.transcript.filter((t) => t.role === 'user').length
    if (userTurns >= MAX_SIMULATE_USER_TURNS) return

    stopDictation()
    setSending(true)
    setError(null)
    const nextTranscript = [...current.transcript, { role: 'user' as const, text: content }]
    persist({ ...current, transcript: nextTranscript })
    setText('')

    try {
      const result = await requestSimulateTurn({
        sceneType: current.sceneType,
        persona: current.persona,
        ...(current.brief ? { brief: current.brief } : {}),
        material: current.material,
        dimensions: current.dimensions,
        transcript: nextTranscript,
      })
      const latest = liveRef.current ?? current
      const withReply: SimulateLive = {
        ...latest,
        transcript: [...nextTranscript, { role: 'ai', text: result.reply }],
        done: result.forceEnd,
      }
      persist(withReply)
      if (result.forceEnd) setPhase('ended')
    } catch (err) {
      persist(current)
      setText(content)
      setError(err instanceof ApiClientError ? err.message : '对方没接住，请再试一次')
    } finally {
      setSending(false)
    }
  }, [persist, phase, sending, stopDictation])

  const endScene = useCallback(() => {
    const current = liveRef.current
    if (!current) return
    stopDictation()
    persist({ ...current, done: true })
    setPhase('ended')
  }, [persist, stopDictation])

  const goReview = useCallback(async () => {
    const current = liveRef.current
    if (!current || reviewing) return
    const userTurns = current.transcript.filter((t) => t.role === 'user')
    if (userTurns.length === 0) {
      navigate('/feedback/empty', { state: { mode: '材料模拟', scenario: current.title } })
      return
    }

    setReviewing(true)
    setError(null)
    try {
      const previous = findPreviousComparableSession({
        mode: '材料模拟',
        scenario: current.title,
        simulate: {
          savedMaterialId: current.savedMaterialId,
          sceneType: current.sceneType,
          brief: current.brief,
        },
      })
      const ai = await requestSimulateReview({
        sceneType: current.sceneType,
        persona: current.persona,
        ...(current.brief ? { brief: current.brief } : {}),
        material: current.material,
        dimensions: current.dimensions,
        transcript: current.transcript,
        ...(previous ? { previousAttempt: toPreviousAttempt(previous) } : {}),
      })
      const userContent = userTurns.map((t) => t.text).join('\n\n')
      const { draft } = buildSessionDraft({
        mode: '材料模拟',
        scenario: current.title,
        userContent,
        inputMethod,
        simulate: {
          sceneType: current.sceneType,
          persona: current.persona,
          brief: current.brief,
          ...(current.savedMaterialId ? { savedMaterialId: current.savedMaterialId } : {}),
          transcript: current.transcript,
          dimensions: current.dimensions.map((d) => ({ name: d.name, why: d.why })),
        },
      })
      try {
        const session = finalizeAndSaveSession(draft, ai)
        persist({ ...current, done: true })
        navigate(`/feedback/${session.id}`)
      } catch (err) {
        if (err instanceof StorageUnavailableError) {
          navigate('/feedback/unavailable', {
            state: { storageError: true, mode: '材料模拟', scenario: current.title },
          })
          return
        }
        const session = mergeAiIntoDraft(draft, ai)
        navigate(`/feedback/${session.id}`, { state: { draft: session } })
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '复盘生成失败，请点击重试')
    } finally {
      setReviewing(false)
    }
  }, [inputMethod, navigate, persist, reviewing])

  if (!live) {
    return (
      <div className="empty-state">
        <div className="icon">🤔</div>
        <p>这场还没准备好，材料可能已经关掉了。</p>
        <button className="btn btn-primary mt-16" onClick={() => navigate('/simulate')}>
          重新贴材料
        </button>
      </div>
    )
  }

  const roleLabel = simulateRoleLabel(live.sceneType)
  const warmup = simulateWarmupCopy(live.sceneType)
  const userTurns = live.transcript.filter((t) => t.role === 'user').length
  const turnsLeft = Math.max(0, MAX_SIMULATE_USER_TURNS - userTurns)
  const showComposer = phase === 'talking' && !live.done
  const sendLabel =
    sending
      ? '对方在听…'
      : isSpeechFirstScene(live.sceneType) && userTurns === 0
        ? '这段讲完了'
        : '说完了'

  return (
    <div>
      <button className="back-link" onClick={() => navigate('/simulate')}>
        ← 换材料
      </button>

      <div className="in-character-bar mb-16">
        {simulateInCharacterCopy(live.sceneType, live.persona)}
      </div>

      <h1 className="page-title">{live.title}</h1>
      <p className="page-subtitle">
        {live.sceneType}
        {live.brief ? ` · ${live.brief}` : ''}
      </p>

      <button className="btn btn-ghost btn-sm mb-16" onClick={() => setShowMaterial((v) => !v)}>
        {showMaterial ? '收起材料' : '看一眼材料'}
      </button>
      {showMaterial && <div className="material-block mb-16">{live.material}</div>}

      {phase === 'warmup' && (
        <div className="warmup-card mb-16">
          <strong>{warmup.title}</strong>
          <div className="dim-chips mt-8">
            {live.dimensions.map((d) => (
              <span key={d.name} className="dim-chip" title={d.why}>
                {d.name}
              </span>
            ))}
          </div>
          <p>{warmup.body}</p>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-lg" onClick={() => setPhase('talking')}>
              {isSpeechFirstScene(live.sceneType) ? '开始讲' : '开始开口'}
            </button>
          </div>
        </div>
      )}

      {phase !== 'warmup' && (
        <div className="sim-thread mb-16">
          {live.transcript.map((turn, i) => (
            <div key={`${turn.role}-${i}`} className={`sim-bubble ${turn.role}`}>
              <div className="sim-role">{turn.role === 'ai' ? roleLabel : '你'}</div>
              {turn.text}
            </div>
          ))}
          {sending && (
            <div className="sim-bubble ai">
              <div className="sim-role">{roleLabel}</div>
              <span className="muted">对方在想下一问…</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="notice notice-error mb-16" role="alert">
          {error}
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
            <span className="muted">还可答 {turnsLeft} 轮</span>
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
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && text.trim() && !sending) {
                e.preventDefault()
                void sendTurn()
              }
            }}
            className={
              isSpeechFirstScene(live.sceneType) && userTurns === 0 ? 'sim-speech' : undefined
            }
            placeholder={simulateComposerPlaceholder(
              live.sceneType,
              userTurns,
              inputMethod === '语音',
            )}
          />

          <div className="btn-row">
            <button
              className="btn btn-primary btn-lg"
              disabled={!text.trim() || sending}
              onClick={() => void sendTurn()}
            >
              {sendLabel}
            </button>
            {userTurns > 0 && (
              <button className="btn btn-ghost" disabled={sending} onClick={endScene}>
                结束这场，出戏
              </button>
            )}
            <span className="kbd-hint">⌘/Ctrl + Enter 发送</span>
          </div>
        </div>
      )}

      {phase === 'ended' && (
        <div className="card">
          <strong>对方已经收场了</strong>
          <p className="muted">出戏之后，只看你有没有把想法说出来、有没有落到这份材料上。</p>
          <div className="btn-row">
            <button className="btn btn-primary btn-lg" disabled={reviewing} onClick={() => void goReview()}>
              {reviewing ? '正在复盘…' : '出戏，看这场复盘'}
            </button>
            <button className="btn btn-ghost" disabled={reviewing} onClick={() => navigate('/simulate?retry=1')}>
              先不看，再来一场
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

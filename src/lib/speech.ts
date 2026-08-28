/**
 * Web Speech API 封装：语音转文字。
 * 浏览器不支持时返回 null，由调用方自动降级为打字输入（不阻断流程）。
 */

export interface SpeechRecognitionSupport {
  supported: boolean
  /** 不支持时的简短说明 */
  reason?: string
}

export function checkSpeechSupport(): SpeechRecognitionSupport {
  const w = window as unknown as Record<string, unknown>
  const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined
  if (!SR) {
    return {
      supported: false,
      reason: '当前浏览器不支持语音识别，已自动切换为打字输入',
    }
  }
  return { supported: true }
}

/** 最小化的 SpeechRecognition 类型描述（TS DOM 库尚未内置） */
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

export interface SpeechDictationCallbacks {
  /** 中间/最终识别结果更新（全量文本） */
  onText: (text: string) => void
  onError: (message: string) => void
  onEnd: () => void
}

export class SpeechDictation {
  private recognition: SpeechRecognitionLike | null = null
  private finalText = ''
  private listening = false

  constructor(private callbacks: SpeechDictationCallbacks) {}

  get isListening(): boolean {
    return this.listening
  }

  start(): boolean {
    const w = window as unknown as Record<string, unknown>
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined
    if (!SR) return false

    const recognition = new SR()
    recognition.lang = 'zh-CN'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result) continue
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          this.finalText += transcript
        } else {
          interim += transcript
        }
      }
      this.callbacks.onText(this.finalText + interim)
    }

    recognition.onerror = (event) => {
      const errorMap: Record<string, string> = {
        'not-allowed': '麦克风权限被拒绝，可以在浏览器设置中开启，或改用打字输入',
        'service-not-allowed': '语音识别服务不可用，请改用打字输入',
        'no-speech': '没有听到声音，请靠近麦克风再试',
        network: '语音识别服务网络异常，请改用打字输入',
        aborted: '',
      }
      const message = errorMap[event.error] ?? `语音识别出错（${event.error}），可改用打字输入`
      if (message) this.callbacks.onError(message)
    }

    recognition.onend = () => {
      // continuous 模式下浏览器可能自动停止，若仍在收听状态则重启
      if (this.listening) {
        try {
          recognition.start()
          return
        } catch {
          /* 重启失败则正常结束 */
        }
      }
      this.listening = false
      this.callbacks.onEnd()
    }

    this.recognition = recognition
    this.finalText = ''
    this.listening = true
    try {
      recognition.start()
      return true
    } catch {
      this.listening = false
      this.recognition = null
      return false
    }
  }

  stop(): string {
    this.listening = false
    try {
      this.recognition?.stop()
    } catch {
      /* ignore */
    }
    return this.finalText
  }

  abort(): void {
    this.listening = false
    try {
      this.recognition?.abort()
    } catch {
      /* ignore */
    }
    this.recognition = null
  }
}

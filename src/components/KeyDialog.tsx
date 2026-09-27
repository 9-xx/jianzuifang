/**
 * API Key 设置弹层：访客粘贴自己的 DeepSeek Key（BYOK）。
 * 存 localStorage，仅用于本机；后端仅当次请求使用，不落任何存储。
 */
import { useEffect, useRef, useState } from 'react'
import {
  ApiKeyInvalidError,
  loadUserApiKey,
  notifyKeyChanged,
  saveUserApiKey,
} from '../lib/user-key'
import Icon from './Icon'

export default function KeyDialog({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState(() => loadUserApiKey())
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const save = () => {
    setError(null)
    try {
      saveUserApiKey(value)
      notifyKeyChanged()
      setSaved(true)
      setTimeout(onClose, 600)
    } catch (err) {
      setError(err instanceof ApiKeyInvalidError ? err.message : '保存失败，请重试')
    }
  }

  const clear = () => {
    setValue('')
    setError(null)
    try {
      saveUserApiKey('')
    } catch {
      /* ignore */
    }
    notifyKeyChanged()
    setSaved(true)
    setTimeout(onClose, 600)
  }

  return (
    <div className="dialog-overlay" onClick={onClose} role="presentation">
      <div
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row-between">
          <h2 id="key-dialog-title" className="dialog-title">
            <Icon name="key" size={18} /> 你的 DeepSeek API Key
          </h2>
          <button className="dialog-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        {saved ? (
          <p className="dialog-ok">已保存 ✓</p>
        ) : (
          <>
            <p className="dialog-desc">
              填入你自己的 DeepSeek Key，AI 反馈就会走你的额度。Key 只保存在本机浏览器，
              每次请求时直接交给 DeepSeek 使用，本站不会存储或记录它。
            </p>
            <input
              ref={inputRef}
              type="password"
              className="dialog-input"
              placeholder="sk-..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
              autoComplete="off"
              spellCheck={false}
            />
            {error && <p className="dialog-error">{error}</p>}
            <div className="dialog-actions">
              <button className="btn btn-secondary btn-sm" onClick={clear} disabled={!value}>
                清除已存的
              </button>
              <button className="btn btn-primary btn-sm" onClick={save}>
                保存
              </button>
            </div>
            <p className="dialog-hint">
              还没有 Key？到 platform.deepseek.com 注册即可获取。没有填写 Key 的话，AI
              反馈将无法使用（本地练习和词库反馈不受影响）。
            </p>
          </>
        )}
      </div>
    </div>
  )
}

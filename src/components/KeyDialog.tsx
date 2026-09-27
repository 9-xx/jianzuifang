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
              把你自己的 Key 填在这里，AI 反馈就会走你的额度。Key 只保存在本机浏览器，
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
              还没有 Key？到 platform.deepseek.com 注册后即可免费获取。
              不填也可以，如果部署者配置了共享 Key，会自动使用。
            </p>
          </>
        )}
      </div>
    </div>
  )
}

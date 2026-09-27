/**
 * 访客自带 API Key（BYOK）——只存在浏览器 localStorage。
 *
 * - Key 不会上传到本站服务器以外的任何地方；每次调用 AI 接口时随请求头带给
 *   后端，后端仅当次使用、用完即丢、不落任何日志或存储。
 * - 没填 Key 时，后端回退使用部署者配置的环境变量（如果部署者配了）。
 */

const KEY_STORAGE = 'expression-gym:user-api-key'

/** DeepSeek Key 的基本格式，与后端校验保持一致 */
const KEY_PATTERN = /^sk-[A-Za-z0-9]{16,}$/

export class ApiKeyInvalidError extends Error {
  constructor() {
    super('Key 格式不对：应以 sk- 开头，后面跟一串字母数字')
    this.name = 'ApiKeyInvalidError'
  }
}

export function loadUserApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE)?.trim() ?? ''
  } catch {
    return ''
  }
}

/** 保存访客 Key。空字符串表示清除。格式非法抛 ApiKeyInvalidError。 */
export function saveUserApiKey(raw: string): void {
  const key = raw.trim()
  if (key === '') {
    try {
      localStorage.removeItem(KEY_STORAGE)
    } catch {
      /* ignore */
    }
    return
  }
  if (!KEY_PATTERN.test(key)) throw new ApiKeyInvalidError()
  try {
    localStorage.setItem(KEY_STORAGE, key)
  } catch {
    /* 存储不可用时仅本次会话生效 */
  }
}

/** 是否已设置本地 Key */
export function hasUserApiKey(): boolean {
  return loadUserApiKey() !== ''
}

/** Key 变化通知（同页组件订阅，弥补 storage 事件不广播同页的限制） */
const KEY_CHANGE_EVENT = 'expression-gym:key-change'

export function notifyKeyChanged(): void {
  window.dispatchEvent(new Event(KEY_CHANGE_EVENT))
}

export function onKeyChanged(listener: () => void): () => void {
  window.addEventListener(KEY_CHANGE_EVENT, listener)
  return () => window.removeEventListener(KEY_CHANGE_EVENT, listener)
}

/** 后端 503（keyRequired）响应体里的提示字段 */
export function isKeyRequiredError(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { keyRequired?: unknown }).keyRequired === true
  )
}

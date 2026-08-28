/**
 * localStorage 存储层。
 *
 * key 约定（见数据存储设计文档）：
 * - expression-gym:sessions          PracticeSession[]
 * - expression-gym:tag-status        TagStatus[]
 * - expression-gym:declared-issues   UserDeclaredIssue[]
 * - expression-gym:settings          UserSettings
 *
 * 设计要点：
 * - 读取时做基本的结构校验，损坏数据静默丢弃（本地数据，可容忍）。
 * - 存储不可用（隐私模式/已满）时抛 StorageUnavailableError，由调用方决定
 *   如何提示用户（不阻断本次练习）。
 */

const KEYS = {
  sessions: 'expression-gym:sessions',
  tagStatus: 'expression-gym:tag-status',
  declaredIssues: 'expression-gym:declared-issues',
  settings: 'expression-gym:settings',
} as const

export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('当前浏览器环境下无法保存记录')
    this.name = 'StorageUnavailableError'
    this.cause = cause
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    // 数据损坏：清掉这条 key，当作不存在
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    throw new StorageUnavailableError(err)
  }
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v)
}

// ---------- PracticeSession ----------

export function loadSessions(): PracticeSessionView[] {
  const data = readJson<unknown>(KEYS.sessions)
  return isArray(data) ? (data.filter(isRecordLike) as unknown as PracticeSessionView[]) : []
}

export function saveSessions(sessions: PracticeSessionView[]): void {
  writeJson(KEYS.sessions, sessions)
}

// ---------- TagStatus ----------

export function loadTagStatuses(): TagStatus[] {
  const data = readJson<unknown>(KEYS.tagStatus)
  return isArray(data) ? (data.filter(isRecordLike) as unknown as TagStatus[]) : []
}

export function saveTagStatuses(statuses: TagStatus[]): void {
  writeJson(KEYS.tagStatus, statuses)
}

// ---------- UserDeclaredIssue ----------

export function loadDeclaredIssues(): UserDeclaredIssue[] {
  const data = readJson<unknown>(KEYS.declaredIssues)
  return isArray(data) ? (data.filter(isRecordLike) as unknown as UserDeclaredIssue[]) : []
}

export function saveDeclaredIssues(issues: UserDeclaredIssue[]): void {
  writeJson(KEYS.declaredIssues, issues)
}

// ---------- UserSettings ----------

export function loadSettings(): UserSettings {
  const data = readJson<unknown>(KEYS.settings)
  return isRecordLike(data) ? (data as UserSettings) : {}
}

export function saveSettings(settings: UserSettings): void {
  writeJson(KEYS.settings, settings)
}

// ---------- 通用工具 ----------

function isRecordLike(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 生成本地唯一 ID（时间戳 + 随机数） */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 检测 localStorage 是否可用（隐私模式等场景） */
export function isStorageAvailable(): boolean {
  try {
    const probeKey = 'expression-gym:__probe'
    localStorage.setItem(probeKey, '1')
    localStorage.removeItem(probeKey)
    return true
  } catch {
    return false
  }
}

// 仅为了类型引用（避免 noUnusedLocals 报错），实际类型在 types.ts 中定义
import type {
  PracticeSession,
  TagStatus as TagStatusT,
  UserDeclaredIssue as UserDeclaredIssueT,
  UserSettings as UserSettingsT,
} from './types.js'

export type PracticeSessionView = PracticeSession
export type TagStatus = TagStatusT
export type UserDeclaredIssue = UserDeclaredIssueT
export type UserSettings = UserSettingsT

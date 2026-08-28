/**
 * 用户设置相关的操作（隐式记忆逻辑）：
 * - preferredInputMethod：用户切换输入方式时自动更新，练习页加载时默认选中
 * - recentModes：进入练习模式时记录，最多保留 2 条，精确到大模式层级
 * - frequentIssueThreshold：高频问题候选阈值，默认 3
 */
import { loadSettings, saveSettings } from './storage.js'
import type { InputMethod, PracticeMode, UserSettings } from './types.js'

export const DEFAULT_THRESHOLD = 3

export function getThreshold(settings: UserSettings): number {
  return settings.frequentIssueThreshold ?? DEFAULT_THRESHOLD
}

/** 更新输入方式偏好（用户在练习页手动切换时调用） */
export function updatePreferredInputMethod(method: InputMethod): UserSettings {
  const settings = loadSettings()
  const next: UserSettings = { ...settings, preferredInputMethod: method }
  saveSettings(next)
  return next
}

/** 记录一次模式访问（进入场景选择或练习时调用），保留最近 2 条 */
export function recordModeVisit(mode: PracticeMode): UserSettings {
  const settings = loadSettings()
  const others = (settings.recentModes ?? []).filter((m) => m.mode !== mode)
  const next: UserSettings = {
    ...settings,
    recentModes: [{ mode, visitedAt: new Date().toISOString() }, ...others].slice(0, 2),
  }
  saveSettings(next)
  return next
}

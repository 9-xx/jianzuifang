/**
 * 材料模拟的本地存储：
 * - 可选保存的材料（localStorage）
 * - 当场会话（sessionStorage，供入戏页和「再练一次」用；材料正文默认不写入练习记录）
 */
import { generateId } from './storage.js'
import { isSimulateSceneType, simulateDefaultTitle } from '../data/simulate-scenes.js'
import type {
  SimulateDimension,
  SimulatePersona,
  SimulateSceneType,
  SimulateTurn,
} from './types.js'

const MATERIALS_KEY = 'expression-gym:simulate-materials'
const LIVE_KEY = 'expression-gym:simulate-live'
const MAX_SAVED = 8
export const MAX_SIMULATE_USER_TURNS = 5

export interface SavedSimulateMaterial {
  id: string
  title: string
  brief: string
  material: string
  sceneType: SimulateSceneType
  savedAt: string
}

export interface SimulateLive {
  sceneType: SimulateSceneType
  persona: SimulatePersona
  brief: string
  title: string
  material: string
  savedMaterialId?: string
  dimensions: SimulateDimension[]
  transcript: SimulateTurn[]
  done: boolean
}

function readJson<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    try {
      storage.removeItem(key)
    } catch {
      /* ignore */
    }
    return null
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function loadSavedMaterials(): SavedSimulateMaterial[] {
  const data = readJson<unknown>(localStorage, MATERIALS_KEY)
  if (!Array.isArray(data)) return []
  return data.filter(isRecord) as unknown as SavedSimulateMaterial[]
}

export function saveMaterial(input: {
  title: string
  brief: string
  material: string
  sceneType: SimulateSceneType
}): SavedSimulateMaterial {
  const item: SavedSimulateMaterial = {
    id: generateId(),
    title: input.title.slice(0, 40) || '未命名材料',
    brief: input.brief.slice(0, 80),
    material: input.material,
    sceneType: input.sceneType,
    savedAt: new Date().toISOString(),
  }
  const next = [item, ...loadSavedMaterials().filter((m) => m.material !== input.material)].slice(
    0,
    MAX_SAVED,
  )
  localStorage.setItem(MATERIALS_KEY, JSON.stringify(next))
  return item
}

export function deleteSavedMaterial(id: string): void {
  const next = loadSavedMaterials().filter((m) => m.id !== id)
  localStorage.setItem(MATERIALS_KEY, JSON.stringify(next))
}

export function findSavedMaterial(id: string): SavedSimulateMaterial | undefined {
  return loadSavedMaterials().find((m) => m.id === id)
}

export function loadSimulateLive(): SimulateLive | null {
  let data: unknown
  try {
    data = readJson<unknown>(sessionStorage, LIVE_KEY)
  } catch {
    return null
  }
  if (!isRecord(data)) return null
  if (typeof data.material !== 'string' || !data.material.trim()) return null
  if (!isSimulateSceneType(data.sceneType)) return null
  if (
    data.persona !== '严格挑剔' &&
    data.persona !== '平和追问' &&
    data.persona !== '轻松聊天'
  ) {
    return null
  }
  // dimensions/transcript 结构异常时按空会话处理，避免下游 .map 崩溃
  if (!Array.isArray(data.dimensions)) return null
  if (!Array.isArray(data.transcript)) return null
  return data as unknown as SimulateLive
}

export function saveSimulateLive(live: SimulateLive): void {
  sessionStorage.setItem(LIVE_KEY, JSON.stringify(live))
}

export function clearSimulateLive(): void {
  try {
    sessionStorage.removeItem(LIVE_KEY)
  } catch {
    /* ignore */
  }
}

export function defaultTitle(brief: string, sceneType: SimulateSceneType): string {
  return simulateDefaultTitle(brief, sceneType)
}

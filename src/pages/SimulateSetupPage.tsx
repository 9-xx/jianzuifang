/**
 * 材料模拟 · 准备页：贴材料、选场景/人设、拆这场会盯的能力域。
 * 材料正文默认不写入练习记录；勾选后才进本地复用列表。
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ApiClientError, requestSimulatePrepare } from '../lib/api-client'
import { recordModeVisit } from '../lib/settings'
import {
  defaultTitle,
  deleteSavedMaterial,
  findSavedMaterial,
  loadSavedMaterials,
  loadSimulateLive,
  saveMaterial,
  saveSimulateLive,
  type SavedSimulateMaterial,
} from '../lib/simulate-storage'
import { SIMULATE_SCENE_OPTIONS, simulateSceneOption } from '../data/simulate-scenes'
import type { SimulatePersona, SimulateSceneType } from '../lib/types'

const PERSONA_OPTIONS: Array<{ id: SimulatePersona; hint: string }> = [
  { id: '严格挑剔', hint: '抓住空话和漏洞' },
  { id: '平和追问', hint: '顺着你刚说的往下问' },
  { id: '轻松聊天', hint: '像同事当面聊，但仍拉回材料' },
]

const MAX_BRIEF = 80
const MIN_MATERIAL = 40

export default function SimulateSetupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const retry = searchParams.get('retry') === '1'
  const materialId = searchParams.get('materialId') ?? ''

  const [sceneType, setSceneType] = useState<SimulateSceneType>('面试')
  const [persona, setPersona] = useState<SimulatePersona>('平和追问')
  const [brief, setBrief] = useState('')
  const [material, setMaterial] = useState('')
  const [keepMaterial, setKeepMaterial] = useState(false)
  const [saved, setSaved] = useState<SavedSimulateMaterial[]>(() => {
    try {
      return loadSavedMaterials()
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryHint, setRetryHint] = useState(false)

  useEffect(() => {
    try {
      recordModeVisit('材料模拟')
    } catch {
      /* 存储不可用不阻断 */
    }
  }, [])

  useEffect(() => {
    try {
      if (retry) {
        const live = loadSimulateLive()
        if (live?.material) {
          setSceneType(live.sceneType)
          setPersona(live.persona)
          setBrief(live.brief)
          setMaterial(live.material)
          setRetryHint(true)
          return
        }
      }
      if (materialId) {
        const found = findSavedMaterial(materialId)
        if (found) {
          setSceneType(found.sceneType)
          setBrief(found.brief)
          setMaterial(found.material)
        }
      }
    } catch {
      /* 存储不可用时让用户重新粘贴 */
    }
  }, [retry, materialId])

  const canStart = material.trim().length >= MIN_MATERIAL && !loading

  const start = async () => {
    const trimmed = material.trim()
    if (trimmed.length < MIN_MATERIAL) {
      setError(`材料至少 ${MIN_MATERIAL} 字，对方才问得起来`)
      return
    }
    setLoading(true)
    setError(null)
    const briefText = brief.trim().slice(0, MAX_BRIEF)
    try {
      const prepared = await requestSimulatePrepare({
        sceneType,
        persona,
        ...(briefText ? { brief: briefText } : {}),
        material: trimmed,
      })
      let savedMaterialId: string | undefined
      if (keepMaterial) {
        try {
          const item = saveMaterial({
            title: defaultTitle(briefText, sceneType),
            brief: briefText,
            material: trimmed,
            sceneType,
          })
          savedMaterialId = item.id
          setSaved(loadSavedMaterials())
        } catch {
          /* 保存失败不阻断开场 */
        }
      }
      saveSimulateLive({
        sceneType,
        persona,
        brief: briefText,
        title: defaultTitle(briefText, sceneType),
        material: trimmed,
        ...(savedMaterialId ? { savedMaterialId } : {}),
        dimensions: prepared.dimensions,
        transcript: [{ role: 'ai', text: prepared.opening }],
        done: false,
      })
      navigate('/simulate/play')
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '拆题失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const useSaved = (item: SavedSimulateMaterial) => {
    setSceneType(item.sceneType)
    setBrief(item.brief)
    setMaterial(item.material)
    setKeepMaterial(false)
    setError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const removeSaved = (id: string) => {
    try {
      deleteSavedMaterial(id)
      setSaved(loadSavedMaterials())
    } catch {
      /* ignore */
    }
  }

  const scene = simulateSceneOption(sceneType)

  return (
    <div>
      <button className="back-link" onClick={() => navigate('/')}>
        ← 回首页
      </button>
      <h1 className="page-title">对着这份材料开口</h1>
      <p className="page-subtitle">
        简历、JD、会议材料、一篇要讲的东西都可以。对方会入戏；结束后才出戏告诉你哪一句还停在脑子里。
      </p>

      {retryHint && (
        <div className="notice notice-info mb-16">刚才那份材料还在，改人设也可以，直接再开一场。</div>
      )}

      <div className="card">
        <div className="section-title mt-0">这是什么场合</div>
        <div className="choice-grid">
          {SIMULATE_SCENE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`choice-card ${sceneType === opt.id ? 'active' : ''}`}
              onClick={() => setSceneType(opt.id)}
            >
              <strong>{opt.id}</strong>
              <div className="hint">{opt.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-title mt-0">
          {sceneType === '会议演讲' || sceneType === '思辨演讲' ? '听你讲的人是什么样' : '对方是什么样的人'}
        </div>
        <div className="choice-grid persona-grid">
          {PERSONA_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`choice-card ${persona === opt.id ? 'active' : ''}`}
              onClick={() => setPersona(opt.id)}
            >
              <strong>{opt.id}</strong>
              <div className="hint">{opt.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-title mt-0">你想练哪一句</div>
        <input
          type="text"
          maxLength={MAX_BRIEF}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder={scene.briefPlaceholder}
        />
        <div className="muted mt-8">选填 · {brief.trim().length}/{MAX_BRIEF}</div>
      </div>

      <div className="card">
        <div className="section-title mt-0">材料正文</div>
        <textarea
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          placeholder={scene.materialPlaceholder}
          rows={10}
        />
        <div className="row-between wrap mt-8">
          <label className="check-label">
            <input
              type="checkbox"
              checked={keepMaterial}
              onChange={(e) => setKeepMaterial(e.target.checked)}
            />
            练完后留在本机，方便再练（默认不保存）
          </label>
          <span className="muted">{material.trim().length} 字</span>
        </div>
      </div>

      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}

      <div className="btn-row">
        <button className="btn btn-primary btn-lg" disabled={!canStart} onClick={() => void start()}>
          {loading ? '正在拆这场会问什么…' : '拆题，然后入戏'}
        </button>
      </div>

      {saved.length > 0 && (
        <div className="card mt-24">
          <div className="section-title mt-0">本机留过的材料</div>
          {saved.map((item) => (
            <div key={item.id} className="saved-material">
              <div>
                <strong>{item.title}</strong>
                <div className="muted">
                  {item.sceneType} · {item.material.slice(0, 48)}
                  {item.material.length > 48 ? '…' : ''}
                </div>
              </div>
              <div className="row">
                <button className="btn btn-secondary btn-sm" onClick={() => useSaved(item)}>
                  用这份
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => removeSaved(item.id)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

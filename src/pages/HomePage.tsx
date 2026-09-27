import { useMemo } from 'react'
import { useHomeMotion } from '../hooks/useHomeMotion'
import { useNavigate } from 'react-router-dom'
import { loadSettings, loadSessions } from '../lib/storage'
import { computePracticeStats, lastPracticeLabel, totalDurationLabel } from '../lib/stats'
import type { PracticeMode } from '../lib/types'
import Icon, { type IconName } from '../components/Icon'

const MODES: { name: PracticeMode; title: string; route: string; icon: IconName; tag: string; description: string; detail: string; className: string }[] = [
  { name: '即兴问答', title: '即兴问答', route: '/scenarios/即兴问答', icon: 'mic', tag: '练反应', description: '突然被问到，也能从容开口。', detail: '在职场与日常场景中，练习把当下的想法说清楚。', className: 'impromptu' },
  { name: '结构化表达', title: '结构化表达', route: '/scenarios/结构化表达', icon: 'layers', tag: '练逻辑', description: '让零散的想法，有条理地被听见。', detail: '从自由表达或材料总结开始，组织观点，讲出重点。', className: 'structured' },
  { name: '材料模拟', title: '材料模拟', route: '/simulate', icon: 'document', tag: '练实战', description: '重要的对话，提前练一遍。', detail: '带上简历、岗位描述或会议材料，在真实语境里练习。', className: 'simulate' },
]

export default function HomePage() {
  const root = useHomeMotion()
  const navigate = useNavigate()
  const recentModes = useMemo(() => loadSettings().recentModes ?? [], [])
  const stats = useMemo(() => computePracticeStats(loadSessions()), [])
  const lastLabel = lastPracticeLabel(stats)
  return (
    <div className="home-page" ref={root}>
      <section className="home-hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> 给表达一点生长的空间</div>
          <h1>把心里的想法，<br />练成嘴边的<span>好表达。</span></h1>
          <p>不必一开口就完美。每一次练习，<br className="desktop-break" />都是让想法更清楚、表达更从容的一小步。</p>
          <button className="btn btn-primary hero-cta" onClick={() => navigate('/scenarios/即兴问答')}>开始今天的练习 <Icon name="arrow" size={18} /></button>
          <div className="hero-note">无需注册 <span>·</span> 随时开口 <span>·</span> 练后获得反馈</div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="art-spark spark-one">✳</div><div className="art-spark spark-two">✳</div>
          <div className="thought-bubble">嗯…我想说的是</div>
          <div className="voice-bubble"><div className="voice-bars">{[22, 38, 56, 32, 68, 86, 52, 70, 42, 28, 44].map((height, i) => <i key={i} style={{ height }} />)}</div></div>
          <div className="idea-bubble"><Icon name="leaf" size={30} /><span>想法，正在被听见</span></div>
          <div className="art-caption">A LITTLE PRACTICE. A CLEARER YOU.</div>
        </div>
      </section>

      <section className="training-section" aria-labelledby="training-title">
        <div className="training-heading"><div><div className="eyebrow">YOUR DAILY PRACTICE</div><h2 id="training-title">今天，想怎么练？</h2></div><span>选一种方式，从开口开始</span></div>
        <div className="training-grid">
          {MODES.map((mode, index) => <button key={mode.name} className={`training-card training-${mode.className}`} onClick={() => navigate(mode.route)}>
            <div className="training-card-top"><span className="training-icon"><Icon name={mode.icon} size={27} /></span><span className="training-tag">{mode.tag}</span></div>
            <span className="training-index">0{index + 1}</span><h3>{mode.title}</h3><p className="training-description">{mode.description}</p><p className="training-detail">{mode.detail}</p>
            <div className="training-action">进入练习 <span><Icon name="arrow" size={18} /></span></div>
          </button>)}
        </div>
      </section>

      {stats.totalCount > 0 && <section className="practice-progress" aria-label="练习统计"><div><strong>每一次开口，都算数。</strong><p>{lastLabel}</p></div><div className="progress-numbers"><div><strong>{stats.totalCount}</strong><span>累计练习</span></div><div><strong>{stats.streakDays}</strong><span>连续天数</span></div><div><strong>{totalDurationLabel(stats)}</strong><span>累计开口</span></div></div></section>}
      {recentModes.length > 0 && <div className="recent-practice"><span>继续练习</span>{recentModes.map(m => <button key={m.mode} className="btn btn-secondary btn-sm" onClick={() => navigate(MODES.find(mode => mode.name === m.mode)?.route ?? '/')}><Icon name="clock" size={15} />{m.mode}<Icon name="arrow" size={14} /></button>)}</div>}

      <section className="memory-panel"><span className="memory-icon"><Icon name="leaf" size={26} /></span><div><h2>你的表达，值得被记住。</h2><p>记录反复遇到的表达习惯，让下一次练习更有方向。</p></div><button className="btn btn-ghost" onClick={() => navigate('/frequent-issues')}>查看表达记忆 <Icon name="arrow" size={18} /></button></section>
      <footer className="home-footer"><span>有氧健嘴房 · 让表达成为日常</span><span>慢慢来，每一次开口都在进步。</span></footer>
    </div>
  )
}

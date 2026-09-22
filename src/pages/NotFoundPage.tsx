/**
 * 404 页：未知路径的兜底，给鼓励性出口而不是死胡同。
 */
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="empty-state">
      <div className="icon">🧭</div>
      <p>这里没有练习，想练的话随时可以开口。</p>
      <Link to="/" className="btn btn-primary mt-16" role="button">
        回首页
      </Link>
    </div>
  )
}

/**
 * 全局渲染错误边界：
 * - 捕获子树渲染异常，展示友好提示与恢复出口（回首页），不白屏；
 * - 恢复操作不自动清数据，只导航，用户数据始终在 localStorage 里。
 * 异常路径文档要求：文案鼓励性、不指责用户。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] 渲染异常：', error, info.componentStack)
  }

  private handleReset = (): void => {
    this.setState({ hasError: false })
    window.location.assign('/')
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="empty-state">
        <div className="icon">😵</div>
        <p>页面出了点小问题，你的练习记录都还在。</p>
        <p>点下面按钮回到首页继续。</p>
        <button className="btn btn-primary mt-16" onClick={this.handleReset}>
          回首页
        </button>
      </div>
    )
  }
}

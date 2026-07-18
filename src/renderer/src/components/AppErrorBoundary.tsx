import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = { failed: false }

  public static getDerivedStateFromError(): State {
    return { failed: true }
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Renderer failed', { name: error.name, componentStack: info.componentStack })
  }

  public render(): ReactNode {
    if (!this.state.failed) return this.props.children

    return (
      <main className="fatal-state" aria-labelledby="fatal-title">
        <div className="state-panel state-panel-error">
          <p className="state-kicker">应用界面异常</p>
          <h1 id="fatal-title">当前页面无法继续显示</h1>
          <p>本地数据没有被删除。重新载入后仍失败时，请保留现场并导出诊断信息。</p>
          <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
            重新载入
          </button>
        </div>
      </main>
    )
  }
}

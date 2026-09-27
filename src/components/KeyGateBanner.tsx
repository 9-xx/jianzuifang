/**
 * 「需要 API Key」引导横幅：访客没填 Key / Key 格式不对时显示。
 * 点击按钮打开顶栏同一个 Key 设置弹窗（全局单例，经 useKeyDialog）。
 */
import { hasUserApiKey } from '../lib/user-key'
import { useKeyDialog } from '../main'
import Icon from './Icon'

export default function KeyGateBanner({ invalid }: { invalid?: boolean }) {
  const openKeyDialog = useKeyDialog()
  const hasKey = hasUserApiKey()

  return (
    <div className="key-notice" role="alert">
      <p>
        {invalid || hasKey
          ? '你填写的 API Key 格式不对：应以 sk- 开头，后面跟一串字母数字。检查后重试。'
          : 'AI 反馈需要你自己的 DeepSeek API Key（只存本机，本站不会保存）。填好即可继续。'}
      </p>
      <button className="btn btn-primary btn-sm" onClick={() => openKeyDialog()}>
        <Icon name="key" size={15} />
        {invalid || hasKey ? '检查我的 Key' : '去填 Key'}
      </button>
    </div>
  )
}

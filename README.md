# 有氧健嘴房

把脑子里的想法练到能说出口。通过结构化练习和即时反馈，帮你把思考变成可以说出来的话。

## 功能（MVP）

- **即兴问答训练**：预设场景 + 问题池随机抽题，限时作答，练「被问到时把判断说出来」
- **结构化表达训练**：自由生成（把零散想法说完整）/ 整理总结（读完材料后用自己的判断说出来，再追问细节）
- **材料模拟**：贴上简历、JD、会议材料或一篇引发思考的文字；面试/客户沟通是追问，会议演讲/思辨演讲是先把一段讲完再被打断。结束后出戏复盘（有没有把判断说出口、有没有落到这份材料上）
- **AI 复盘反馈**：先看想法完整度、观点是不是你的；填充词/模糊表达走本地词库（辅助）
- **自带 Key（BYOK）**：访客在页面右上角填自己的 DeepSeek Key（只存本机浏览器），AI 调用走自己的额度；没填/格式不对时引导填写，AI 反馈不可用但其他功能不受影响
- **成长记录**：全部存在浏览器本地，文字总结呈现进步趋势；同一题/同一份材料再练一次时，反馈会对照上次没说出口的那句
- **自主记忆**：系统检测反复没说完整的地方（累计 ≥3 次）+ 用户手动声明，双轨并行；用词习惯是辅助
- **练习统计**：首页看累计次数、连续天数（streak）、累计开口时长；历史记录可按模式筛选
- **快捷键**：打字作答时 Cmd/Ctrl + Enter 直接提交

## 技术栈

- 前端：Vite + React 19 + TypeScript + React Router
- 后端：Vercel Serverless Functions（`/api/feedback`、`/api/generate-material`、`/api/follow-up`、`/api/simulate`），无状态、不落库
- LLM：DeepSeek API（`deepseek-chat`），Key 仅在服务端使用
- 存储：浏览器 localStorage（无账号系统）

## 本地开发

```bash
npm install
cp .env.example .env   # 然后在 .env 里填入你的 DEEPSEEK_API_KEY
npm run dev            # 前端 http://localhost:5173，API 走 Vite 代理
```

## 部署（Vercel）

1. 推送到 Git 仓库后导入 Vercel（或 `vercel` CLI 直接部署）
2. 无需配置任何环境变量——本应用是纯 BYOK（自带 Key）模式：每个访客在页面右上角点「Key」填入自己的 DeepSeek Key，AI 反馈走访客自己的额度。Key 只存在访客本机浏览器，服务器不存储、不记录，仅当次请求使用。
3. 部署完成后访问即可，前端静态资源 + `/api/*` Serverless Functions 一体运行

> 访客没填 Key 或格式不对时，AI 反馈功能会引导访客去填写；本地练习、词库反馈、历史记录等全部功能不受影响。
> 如果你想给自己留一个共享 Key（体验用），也可以在 Vercel 环境变量里配 `DEEPSEEK_API_KEY`——但当前代码为纯 BYOK，不会读取它。

## 目录结构

```
├── api/                # Vercel Serverless Functions（后端，无状态）
│   ├── feedback.ts     # POST /api/feedback 语义类反馈 + 标签
│   ├── generate-material.ts  # POST /api/generate-material 整理总结阅读材料
│   ├── follow-up.ts          # POST /api/follow-up 整理总结后的短追问
│   └── simulate.ts           # POST /api/simulate 材料模拟：拆题 / 入戏追问 / 出戏复盘
└── src/
    ├── data/           # 静态配置：场景库、词库、语义标签字典（前后端共用）
    ├── lib/            # 存储层、词库匹配、记忆聚合、成长总结、练习统计、AI 客户端
    ├── pages/          # 首页 / 场景选择 / 练习 / 反馈 / 记录 / 习惯 / 材料模拟
    └── styles/         # 设计系统 CSS
```

## 数据与隐私

- 所有练习记录、高频问题状态、手动声明只存在你自己的浏览器 localStorage，不上传服务器
- 你在页面里填的 DeepSeek API Key 也只存在本机浏览器，仅随 AI 请求交给后端当次使用，不落任何日志或存储
- 唯一经过网络传输的是"本次作答文字 + 已声明问题列表（+ 整理总结 / 材料模拟当场用的材料）"，后端处理完即丢弃、不落库。材料模拟的正文默认不写入练习记录，除非你勾选留在本机。
- 清除浏览器数据 / 换设备会丢失本地记录，这是"无账号"设计的已知代价

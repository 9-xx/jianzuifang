# 有氧健嘴房

一款帮职场人 / 想提升表达流畅度的普通人，通过结构化练习和即时 AI 反馈，把"开口说话"练成肌肉记忆的 Web 端表达训练工具。

## 功能（MVP）

- **即兴问答训练**：预设场景 + 问题池随机抽题，限时作答，练"被追问时不卡壳"
- **结构化表达训练**：自由生成（从零组织想法）/ 整理总结（读 AI 生成的材料后结构化转述）两个子模式
- **AI 复盘反馈**：填充词/模糊表达走本地词库匹配（瞬时），逻辑结构/紧张点等走 AI 语义判断
- **成长记录**：全部存在浏览器本地，文字总结呈现进步趋势
- **自主记忆与高频问题提醒**：系统检测（累计 ≥3 次）+ 用户手动声明双轨并行

## 技术栈

- 前端：Vite + React 19 + TypeScript + React Router
- 后端：Vercel Serverless Functions（`/api/feedback`、`/api/generate-material`），无状态、不落库
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
2. 在 Vercel Dashboard → Settings → Environment Variables 添加 `DEEPSEEK_API_KEY`
3. 部署完成后访问即可，前端静态资源 + `/api/*` Serverless Functions 一体运行

## 目录结构

```
├── api/                # Vercel Serverless Functions（后端，无状态）
│   ├── feedback.ts     # POST /api/feedback 语义类反馈 + 标签
│   └── generate-material.ts  # POST /api/generate-material 整理总结阅读材料
└── src/
    ├── data/           # 静态配置：场景库、词库、语义标签字典（前后端共用）
    ├── lib/            # 存储层、词库匹配、记忆聚合、成长总结、AI 客户端
    ├── pages/          # 首页 / 场景选择 / 练习 / 反馈 / 记录 / 高频问题
    └── styles/         # 设计系统 CSS
```

## 数据与隐私

- 所有练习记录、高频问题状态、手动声明只存在你自己的浏览器 localStorage，不上传服务器
- 唯一经过网络传输的是"本次作答文字 + 已声明问题列表（+ 整理总结模式的阅读材料）"，后端处理完即丢弃、不落库
- 清除浏览器数据 / 换设备会丢失本地记录，这是"无账号"设计的已知代价

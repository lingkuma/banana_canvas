<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

<p align="center">
  <a href="./README.md">English</a> | <strong>简体中文</strong>
</p>

# Banana Canvas

Banana Canvas 是一个面向 AI 图片创作和视觉整理的无限画布应用。你可以在一张可缩放、可拖拽的画布上自由摆放图片、便签、文字标签、箭头、手绘草图和网页嵌入内容，把灵感、参考图、修改标注和生成结果组织在同一个工作区里。

项目内置了图片生成与图片编辑工作流：既可以通过文字生成全新图片，也可以选中画布上的图片、手绘标注、箭头或标签，让模型基于这些上下文继续修改和扩展。生成结果会进入历史面板，也可以随时添加回画布继续迭代。

## 核心功能

- 无限画布：支持平移、缩放、多选、拖拽、旋转和缩放元素。
- 工作流：连续修改，支持将输出作为输入。
- 多种画布元素：便签、图片、箭头、标签、手绘内容和 iframe 网页嵌入。
- AI 图片生成：支持文生图、基于参考图的编辑，以及带标注的局部修改说明。
- 模型与接口选择：支持 Banana / Banana Pro，以及自定义 Gemini API Key 或 OpenAI 兼容接口。
- 生成历史：查看生成任务、管理结果，并把满意的图片添加回画布。
- 创作辅助：图片上传、拖放导入、撤销/重做、回收站和单张图片下载。

## 适合场景

- AI 图片工作流编排和结果对比
- 视觉参考板、情绪板和创意草稿整理
- 对图片进行圈注、箭头说明和迭代修改
- 把生成结果、参考材料和说明文本放在同一个空间中管理

## 技术栈

- React
- TypeScript
- Vite
- Gemini / Google GenAI SDK
- Tailwind CSS CDN

## Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ad0efd5a-2437-443d-970c-9ca50a8b03d5

## 本地开发

**环境要求：** Node.js 20 或更高版本

1. 安装依赖：`pnpm install`
2. 从示例创建本地配置：`Copy-Item .env.example .env`
3. 在 `.env` 中设置 AI 渠道、Base URL、密钥和模型
4. 启动开发服务：`pnpm run dev`

## 公司内网部署

`.env` 只由服务器读取，AI 密钥和 Base URL 不会发送到浏览器，也不会被 Git 提交。

OpenAI 兼容渠道示例：

```dotenv
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=你的密钥
AI_MODEL=gpt-image-1
AI_STREAM=false
HOST=0.0.0.0
PORT=3000
```

Gemini 渠道示例：

```dotenv
AI_PROVIDER=gemini
AI_BASE_URL=
AI_API_KEY=你的 Gemini 密钥
AI_MODEL=gemini-2.5-flash-image
AI_STREAM=false
HOST=0.0.0.0
PORT=3000
```

构建并启动：

```powershell
pnpm install
pnpm run build
pnpm start
```

同一内网的其他人可访问 `http://服务器IP:3000`。修改 `.env` 后需要重启服务。当前服务不包含用户登录功能，请只部署在受信任的公司内网或放在已有的内网网关后面。

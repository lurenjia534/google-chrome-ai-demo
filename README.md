# Chrome 内置 AI API 实验台

本项目是一个使用 Next.js 15 与 React 19 构建的页面级实验台，用于快速验证 Chrome 桌面版新引入的内置 AI 能力。界面将 `LanguageDetector`、`Translator` 与 `Summarizer` 三个 Web API 以统一表单呈现，方便在本地完成文本检测、翻译及摘要等常见流程。

> ⚠️ 部分 API 目前仅在带有 Gemini Nano 的 Chrome 138+（或更高版本的 Dev/Canary）桌面浏览器中可用，且可能受企业策略或区域限制。首次调用会触发模型下载，需要用户主动点击以满足 user activation 要求。

## 功能亮点
- **环境检测面板**：实时显示三种 API 的支持状态（supported / availability / download progress），便于确认是否已成功下载离线模型。
- **语言检测**：调用 `LanguageDetector` 自动识别输入文本的主要语言，并展示置信度。
- **翻译体验**：借助 `Translator` 完成自动源语言识别与目标语言转换；当浏览器实现 `translateStreaming` 时，长文本会以流式形式逐步渲染。
- **摘要生成**：通过 `Summarizer` 生成 Markdown 或纯文本风格的摘要，支持 `type`、`format`、`length` 与 `useStreaming` 等参数切换。
- **友好的错误提示**：当 API 不可用、模型下载被策略禁止或未满足 user activation 时，UI 会返回可读信息协助排障。

## 浏览器与系统要求
- Chrome 桌面版 138 及以上版本（macOS、Windows 或 Linux）。
- 设备需满足 Google 对内置 AI 的硬件/内存要求，部分功能需要允许下载 Gemini Nano 模型。
- 若默认未开启，可在 `chrome://flags` 中查找与 On-Device AI 相关的实验性开关（例如 `#enable-on-device-translation-api`、`#enable-on-device-summarization`，具体名称可能随版本调整）。
- 通过 `chrome://on-device-internals` 可以查看模型缓存、下载状态与错误日志。

## 快速开始
1. **安装依赖**
   ```bash
   npm install
   # 或 pnpm install / yarn install / bun install
   ```
2. **启动开发服务器（Turbopack）**
   ```bash
   npm run dev
   ```
3. 在 Chrome 访问 [http://localhost:3000](http://localhost:3000)，粘贴测试文本后即可尝试检测、翻译与摘要。
4. 首次点击按钮时如果 API 状态为 `downloadable`，界面会显示下载进度条；下载完成即可离线使用。

## 使用指引
- **输入文本**：在“测试文本”文本框粘贴任意内容，可混合多种语言体验检测与翻译效果。
- **语言检测**：点击“语言检测”按钮，结果区会显示语言代码及置信度百分比。
- **翻译**：选择目标语言后点击“翻译 →”。若启用了语言检测，将自动更新检测结果并以该语言作为源语言。
- **摘要**：根据需要切换摘要类型（`key-points`、`tldr`、`teaser`、`headline`）、输出格式与长度；勾选“流式输出”可查看分段返回的摘要文本。
- **故障排查**：若状态长期停留在 `unavailable`，请检查：
  - 浏览器版本是否满足要求。
  - 设备或企业策略是否禁止模型下载。
  - 是否已在 `chrome://flags` 启用相关实验功能。
  - 通过 `chrome://on-device-internals` 查看更详细的错误原因。

## 项目结构
```
├─ src/app/layout.tsx        # 全局布局与元数据定义（中文标题、描述）
├─ src/app/page.tsx          # 主界面，包含 UI 渲染与交互逻辑
├─ src/lib/useOnDeviceAI.tsx # React hook：封装状态管理与三个内置 AI API 的调用
├─ src/app/globals.css       # Tailwind CSS v4 配置与基础样式
└─ public/                   # 预置的 SVG 资源，可按需替换
```

## 开发脚本
- `npm run dev`：使用 Turbopack 启动本地开发服务器。
- `npm run build`：生产构建。
- `npm run start`：在生产模式下启动服务器。
- `npm run lint`：使用 Biome 执行静态检查。
- `npm run format`：使用 Biome 自动格式化代码。

## 技术栈
- **Next.js 15（App Router）**：启用 `use client` 页面以访问浏览器 API。
- **React 19**：使用最新 Concurrent 特性与改进的事件系统。
- **Tailwind CSS v4**：通过 `@tailwindcss/postcss` 直接引入原子化样式。
- **Biome**：统一管理 Lint 与格式化，保持代码风格一致。

## 自定义与扩展
- 可在 `src/lib/useOnDeviceAI.tsx` 的 `langs` 列表中增删目标语言，或调整默认输入文本与摘要上下文。
- 如果浏览器后续新增更多内置模型，可在同一 hook 中按模式扩展更多按钮与状态显示。
- 若希望与服务器协同，可在 Next.js API Route 中转发结果或记录实验数据。
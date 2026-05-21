# ouchn-learn

`ouchn-learn` 是一个面向国家开放大学 (OUCHN) 平台的 Tampermonkey 用户脚本，用于课程页自动查看、视频挂机、参考资料下载、全屏资源保存，以及考试页 AI 自动答题。

当前版本已经完成大规模重构：旧的 jQuery 字符串面板被 React 19 渲染器替换，界面状态统一交给 Zustand 管理，课程自动化与 AI 答题流程通过 service 适配层连接到业务模块。AI 自动答题也从“UI 直接编排 DOM 写入”收敛为“题目提取 -> Provider 调用 -> 本地受控工具执行 -> 统计反馈”的链路，更便于维护和诊断。

## 功能特性

- **React 控制台**: 课程页、全屏学习页、考试页共用一套可拖动/折叠的 React 面板。
- **自动查看页面**: 自动扫描未完成的“查看页面”任务，进入学习活动后再返回课程页继续处理。
- **视频挂机**: 批量扫描挂机按钮，按设定间隔提交活动已读进度。
- **参考资料下载**: 自动展开课程章节，收集参考资料附件并按间隔触发下载。
- **保存学习资源**: 在全屏学习活动页展开资源树，批量保存视频和文档，文档可转换为 PDF。
- **AI 自动答题**: 支持 OpenAI/Claude 兼容 Provider、独立 Provider 配置、逐题并发、图片题降级、工具化 DOM 回填和统计反馈。
- **安全存储迁移**: AI API Key 优先保存到 Tampermonkey GM 存储，兼容旧版 localStorage 配置迁移。

## 目标页面

- `https://lms.ouchn.cn/course/**`: 课程自动查看、视频挂机、资源下载。
- `https://lms.ouchn.cn/course/**/learning-activity/full-screen#/**`: 全屏学习资源保存。
- `https://lms.ouchn.cn/exam/*/subjects*`: AI 自动答题。

## 安装

1. 安装 Tampermonkey。
2. 获取发布版用户脚本，或本地执行 `pnpm run build` 后使用 `dist/index.global.js`。
3. 在 Tampermonkey 中安装脚本后访问 OUCHN 课程页或考试页。

构建产物是带 UserScript header 的 IIFE 单文件脚本，运行在浏览器 + Tampermonkey 沙箱中。

## 技术栈

- TypeScript (ES2020)
- React 19 + React DOM
- Zustand
- jQuery (用于兼容 OUCHN 页面和既有 DOM 自动化)
- tsup (IIFE/UserScript 构建)
- jsPDF + html2canvas (文档资源 PDF 保存)
- ESLint + Prettier + Husky + lint-staged

## 架构概览

```
src/
├── index.ts                  # UserScript 入口，注入样式并挂载 React renderer
├── renderer/                 # React 面板、页面模式识别、拖拽 hook、UI 组件
├── store/                    # Zustand stores：课程、考试、面板状态
├── services/                 # UI 与业务模块之间的服务适配层
├── modules/                  # 业务自动化模块
│   ├── auto-view.ts          # 自动查看页面
│   ├── auto-hang.ts          # 视频挂机
│   ├── auto-material-download.ts
│   ├── save-resources/
│   ├── resource-download.ts
│   ├── legacy-hang.ts
│   ├── styles.ts             # scoped runtime CSS / Tailwind-like utilities
│   └── exam/                 # AI 自动答题完整链路
├── utils/                    # DOM、存储、通用工具
├── constants/                # 常量和默认 Provider 配置
└── types/                    # 公共类型
```

### Renderer / Store / Service

- `src/renderer/mount.tsx` 创建单一 React root，并通过 URL 监听和轮询识别课程页、全屏学习页、考试页。
- `src/renderer/App.tsx` 根据页面模式渲染 `CoursePanel`、`FullScreenPanel` 或 `ExamPanel`。
- `src/store/*` 只管理 UI 状态和任务状态，不直接写复杂 DOM。
- `src/services/*` 把 React/Zustand 动作转换为业务模块 callbacks，让业务模块可以继续保持浏览器脚本式执行模型。

### AI 自动答题链路

考试页入口现在由 `src/renderer/components/ExamPanel.tsx` 驱动，核心流程在 `src/services/exam-runner.ts`：

1. `question-extract.ts` 等待题目 DOM 稳定并提取 `Question[]`。
2. `ai-provider.ts` 按题逐个调用 OpenAI 或 Claude Provider，并保留并发控制。
3. `question-detect.ts` 负责题型、图片和装饰图过滤；React 面板也被排除，避免被误判为题图。
4. `tool-executor.ts` 把 AI 返回答案转换为本地 `ExamToolUse[]`。
5. `tool-registry.ts` 根据题型执行受控工具：单选、多选、填空、简答、匹配题。
6. `answer-write.ts`、`answer-match.ts`、`answer-fill.ts` 保留 OUCHN 页面兼容细节和 DOM 写入策略。
7. `ExamStats` 汇总 AI 返回数、工具成功/失败、跳过题目、图片降级等信息。

Provider 只负责推理和返回答案；真实 DOM 写入留在本地工具层，避免模型直接操作页面。

## 开发命令

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run lint:fix
pnpm run format
```

提交前 Husky 会通过 lint-staged 自动执行 Prettier、ESLint 和 TypeScript 类型检查。

## 使用说明

### 课程页控制台

进入课程页后，右侧会出现“资源下载”控制台：

1. “查看所有页面”会扫描未完成查看任务并自动进入/返回。
2. “批量下载参考资料”会展开章节并按间隔触发附件下载。
3. “一键全部挂机”会按设定间隔提交视频活动进度。

### 全屏学习资源保存

进入全屏学习活动页后，面板切换为“保存资源”模式：

1. 点击“保存所有学习资源”。
2. 脚本展开资源树并逐个保存视频或文档。
3. 视频按文件资源保存，文档通过 jsPDF + html2canvas 转为 PDF。

### AI 自动答题

进入考试答题页后，面板切换为“AI 自动答题”：

1. 在 OpenAI 或 Claude Tab 中填写模型名称、API Key、Base URL。
2. 设置答题并发数和可选自定义提示词。
3. 点击“保存配置”或直接“开始答题”。
4. 面板显示当前状态、进度和工具执行统计。

OpenAI 与 Claude 配置独立保存，切换 Provider 不会覆盖另一套输入。API Key 优先写入 GM 存储；旧版 localStorage 配置会在读取时迁移。

## 注意事项

- 本脚本仅供学习交流使用。
- 项目运行环境是浏览器 + Tampermonkey，不存在 Node.js 运行时。
- 新增 Tampermonkey API 时需要同步更新 `tsup.config.ts` 的 `@grant`。
- 新增外部请求目标时需要检查 UserScript `@connect` 策略。
- 保存资源或 AI 答题执行期间，不建议手动切换页面或刷新。

## License

MIT

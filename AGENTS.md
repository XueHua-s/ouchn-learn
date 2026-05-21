# Repository Guidelines

## First Read

- `CLAUDE.md` 是 Claude 的入口文件；开始任何 `ouchn-learn` 工作前先读它，再回到本文件。
- Claude 需要本地技能时读取 `.claude/skills.md`；Codex CLI 读取 `.agents/skills.md`。
- 本项目没有默认入口 skill，根据任务类型在 Skill Routing 中选择。

## Project Overview

**ouchn-learn** 是一个 Tampermonkey 油猴脚本项目，用于国家开放大学 (OUCHN) 平台的视频自动挂机、资源下载和 AI 自动答题。产出物是一个 IIFE 格式的 UserScript，运行在浏览器的 Tampermonkey 沙箱中。

### 技术栈

- **语言**: TypeScript (target: ES2020)
- **运行时**: 浏览器 + Tampermonkey 沙箱
- **构建**: tsup (IIFE 输出)
- **DOM**: jQuery
- **PDF 生成**: jsPDF + html2canvas
- **代码质量**: ESLint + Prettier + Husky + lint-staged

### 目标页面

- `https://lms.ouchn.cn/course/**` — 课程页面（视频挂机、资源下载）
- `https://lms.ouchn.cn/exam/*/subjects*` — 考试页面（AI 自动答题）

## Project Structure

- `src/index.ts`: 脚本主入口，IIFE 自执行。
- `src/modules/`: 功能模块。
  - `auto-exam.ts`: AI 自动答题（调用外部 API）。
  - `auto-hang.ts`: 视频自动挂机。
  - `auto-view.ts`: 自动查看页面。
  - `auto-material-download.ts`: 参考资料下载。
  - `auto-save-resources.ts`: 批量资源保存。
  - `resource-download.ts`: 资源下载核心。
  - `legacy-hang.ts`: 遗留挂机逻辑。
  - `panel.ts`: UI 操作面板。
  - `styles.ts`: CSS 样式注入。
- `src/utils/`: 工具函数。
  - `dom.ts`: DOM 操作辅助。
  - `helper.ts`: 通用辅助函数。
  - `storage.ts`: 持久化存储封装。
- `src/constants/index.ts`: 常量定义。
- `src/types/index.ts`: 类型定义。
- `tsup.config.ts`: 构建配置（含 UserScript 头部）。

## Skill Routing

- `skills/software-design-philosophy/SKILL.md`
  适用于模块设计、复杂度治理、信息隐藏、接口收敛。
- `skills/code-review-expert/SKILL.md`
  适用于 review 当前 diff，优先报告 bug、风险和测试缺口。
- `skills/frontend-design/SKILL.md`
  适用于面板 UI、交互和视觉质量提升。
- `skills/product-designer/SKILL.md`
  适用于产品设计、用户旅程、信息架构、可用性测试和设计系统规划。
- `skills/vercel-react-best-practices/SKILL.md`
  适用于 React/Next.js 性能优化、bundle 体积治理、数据请求瀑布消除和重渲染优化；仅在相关 React/Next.js 代码存在或任务明确要求时使用。
- `skills/zustand/SKILL.md`
  适用于 Zustand store、action 分层、slice 组织和状态管理模式；仅在相关 Zustand 代码存在或任务明确要求时使用。
- `skills/sdd-plan/SKILL.md`
  适用于 SDD（Specification Driven Development）规格驱动开发流程：把 `.specs/tasks/draft/` 中的草稿任务，通过 6 阶段多智能体工作流（Parallel Analysis → Architecture Synthesis → Decomposition → Parallelize → Verify → Promote）逐步细化、并行化、加质量门禁，最终晋升到 `.specs/tasks/todo/`。配合 `skills/sdd-plan/analyse-business-requirements.md` 作为业务分析阶段的子手册。

## SDD 模式触发规则（强制）

只要用户请求中出现以下任意条件，**自动加载并按 `skills/sdd-plan/SKILL.md` 的流程执行**，无需二次确认：

- 显式提及：`sdd`、`SDD`、`sdd:plan`、`/sdd:plan`、`spec-driven`、`specification driven`、`规格驱动`、`spec kit`、`OpenSpec`
- 隐式语义：要求“按 SDD 做计划”、“refine / promote draft task”、“多阶段开发计划+评审”、“LLM-as-Judge 质量门禁”、“把草稿任务推进到正式 todo”
- 上下文存在 `.specs/tasks/draft/*.md`，且用户要求继续推进/拆分/验收

执行约定：

1. 必须先读取 `skills/sdd-plan/SKILL.md` 全文，再读取 `skills/sdd-plan/analyse-business-requirements.md`。
2. 严格按照 6 阶段顺序执行，并保留每阶段的 judge 质量门禁；`--fast` / `--one-shot` 等参数只在用户明确指定时启用。
3. SDD 流程不替换 `Working Rules` 与 `Build And Verification` 章节的本地约束：TypeScript / pnpm / IIFE / Tampermonkey 沙箱、禁止 Node.js 专属 API、优先复用 `src/utils/*`、`src/constants/*` 仍然成立。
4. SDD 流程内若需要做模块设计、code review、UI 设计，按上面的 Skill Routing 串联对应 skill，而不是放弃 SDD 主流程。
5. 若 `${CLAUDE_PLUGIN_ROOT}` 不可用或 `scripts/create-scratchpad.sh` 缺失，使用本仓库的相对路径与等价 Shell 实现，不要因此中断。

## Working Rules

- 运行环境以 `package.json` 为准：包管理器只使用 `pnpm`。
- 改代码前先检查现有工具函数与封装，优先复用 `src/utils/`、`src/constants/` 中已有能力。
- 涉及持久化时，优先复用 `src/utils/storage.ts`；不要直接绕过它写 `GM_setValue` / `GM_getValue` 或 `localStorage`。
- 涉及 DOM 操作时，优先检查 `src/utils/dom.ts` 中已有工具方法。
- Tampermonkey API (`GM_xmlhttpRequest`, `GM_setValue`, `GM_getValue`, `GM_notification` 等) 需要在 `tsup.config.ts` 的 UserScript 头部中声明 `@grant`。
- 新增或修改外部请求时，注意 `@connect` 白名单需同步更新。
- 项目产出是 IIFE 单文件脚本，**不存在 Node.js 运行时**，不要使用 Node.js 专属 API（`fs`, `path`, `process` 等）。
- 对"看起来可删、但实际承载时序/兼容/幂等保护"的代码，保留或补充 `FIXED:` 中文注释，写清问题现象、修复策略和删除风险。

## Build And Verification

- 安装依赖：`pnpm install`
- 开发（watch 模式）：`pnpm run dev`
- 构建：`pnpm run build`
- 类型检查：`pnpm run typecheck`
- 代码检查：`pnpm run lint`（`pnpm run lint:fix` 自动修复）
- 格式化：`pnpm run format`

## Git And Scope

- 默认分支是 `main`。
- 产出文件在 `dist/` 目录，已被 `.gitignore` 忽略。
- 提交前会自动运行 lint-staged（Prettier + ESLint + typecheck）。

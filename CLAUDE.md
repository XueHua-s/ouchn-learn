# Claude Workspace Entry

在开始任何 `ouchn-learn` 分析、命令执行、代码修改前，先完整阅读同级 `AGENTS.md`，并将其视为当前仓库的一线执行规范。

然后按任务范围继续：

- 需要选择本地技能时，读取 `.claude/skills.md`
- 如果通用习惯与本仓库 `AGENTS.md` 冲突，以本仓库 `AGENTS.md` 为准。

## SDD 模式自动加载规则（强制）

当用户的请求中出现下列任意触发条件时，**必须**立刻把 `skills/sdd-plan/SKILL.md` 当作当前任务的主操作手册，全文读取并按其工作流执行，无需用户再次确认：

- 显式关键词：`sdd`、`SDD`、`sdd:plan`、`sdd plan`、`/sdd:plan`、`spec-driven`、`specification driven`、`规格驱动`、`spec kit`、`OpenSpec`
- 隐式语义：用户要求“按 SDD 流程做计划”、“走 spec / 规格 / 草稿到正式任务的流程”、“refine task”、“把 draft 任务推进到 todo”、“做一份多阶段评审的开发计划”、“需要 LLM-as-Judge 质量门禁”
- 工作目录中出现 `.specs/tasks/draft/*.md` 草稿文件，并且用户要求继续推进 / 评审 / 拆分该文件

加载步骤（按顺序）：

1. 读取 `skills/sdd-plan/SKILL.md`，把它视为本次任务的工作流定义。
2. 读取 `skills/sdd-plan/analyse-business-requirements.md`，作为业务分析阶段（Stage: Business Analysis）的详细指引。
3. 解析用户输入中的 `task-file` 与可选参数（`--continue`、`--target-quality`、`--max-iterations`、`--included-stages`、`--skip`、`--fast`、`--one-shot`、`--human-in-the-loop`）。如果用户没有给出 `task-file`，先要求其指定 `.specs/tasks/draft/*.md` 路径或同意自动创建。
4. 严格执行 SKILL 中描述的 6 个阶段：Parallel Analysis → Architecture Synthesis → Decomposition → Parallelize → Verify → Promote，并在每个阶段保留 LLM-as-Judge 质量门禁。
5. 阶段产物默认写入 `.specs/scratchpad/<hex-id>.md`（scratchpad）和原 `task-file`；最终阶段才把任务从 `draft/` 移动到 `todo/`。
6. SDD 流程中所有“环境约束”仍以 `AGENTS.md`、`.claude/skills.md` 为准（TypeScript / pnpm / IIFE / Tampermonkey 沙箱，禁止 Node.js API）。

兜底规则：

- 如果 `${CLAUDE_PLUGIN_ROOT}` 变量不可用，把脚本路径替换为相对本仓库的 `skills/sdd-plan/`；缺失的辅助脚本（如 `create-scratchpad.sh`）改用纯 Shell/`mkdir` 等价实现，不要因脚本缺失而停止。
- 与 `software-design-philosophy`、`code-review-expert`、`frontend-design` 等已有 skill 并不互斥：SDD 负责“计划+拆分+验收”，其它 skill 负责“具体执行”。SDD 流程内部的子任务可以继续按 Skill Routing 调用对应 skill。
- 没有命中上述触发条件时，保持原有路由策略，不要主动启用 SDD 流程。

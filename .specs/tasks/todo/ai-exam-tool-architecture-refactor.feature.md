---
title: AI 自动答题工具化架构重构
status: draft
issue_type: feature
complexity: L
depends_on: []
---

# Initial User Prompt

> 参考 `/Users/noedgeai/Downloads/claudecode_2_1_88(1)` 项目优秀的工具设计，为当前的 AI 自动答题进行重构。当前 AI 自动答题功能业务正确，但架构没有设计工具，主要让 AI 返回结构化数据，再根据结构化数据做 DOM / 油猴脚本自动化操作来答题，设计不够优秀。需要仔细分析参考项目的优秀设计，并使用 SDD 好好计划如何优化当前 AI 自动答题的架构设计。

# Description

当前 AI 自动答题功能已经能正确完成题目提取、AI 作答、答案解析和 DOM 回填，现有业务行为必须作为后续重构的回归基线。此次任务不是修复答题正确性问题，也不是重写题目识别、答案匹配或答案填写策略，而是为 AI provider 与本地 DOM/Tampermonkey 自动化之间建立更清晰的架构边界：从“AI 返回答案 JSON，脚本被动解释并写 DOM”升级为“AI 表达受控答题意图，本地工具层负责输入校验、语义映射、DOM 执行、失败反馈和统计”。

本任务的业务价值在于降低模型输出格式、provider 适配、答案语义映射和 DOM 写入之间的耦合，让现有正确功能更容易维护、扩展和诊断。最终使用者应继续获得相同的自动答题体验；实现开发者应获得可执行的工具化迁移计划；后续维护者应能在 provider、工具执行、DOM 写入和统计反馈之间做局部修改，而不破坏完整答题流程。

参考项目 `claudecode_2_1_88(1)` 的核心设计价值在于工具生命周期：工具拥有稳定名称、输入契约、校验、权限/前置条件、并发安全性、执行函数、结果映射和错误反馈。当前项目运行在浏览器 + Tampermonkey 沙箱，不能直接照搬 Node/React/TUI/权限 UI 或文件系统能力，但应迁移这些设计原则，形成适合 OUCHN 考试页面的轻量工具执行层。

成功的 SDD 计划应能回答三个问题：为什么需要工具化架构、要迁移哪些受控工具能力、如何在不降低现有答题成功率和兼容性的前提下分阶段落地。计划完成后，后续实现应能先包裹现有答案填写能力，再逐步把 provider 输出迁移为工具意图；任一阶段未通过验证时，当前正确业务流程仍应可保留。

**Scope**:
- Included:
  - 分析参考项目工具抽象、工具编排、单工具执行、错误反馈、并发安全策略，并提炼适用于浏览器 + Tampermonkey 的设计原则。
  - 设计当前 AI 自动答题的工具化架构，包括工具接口、工具注册、工具输入校验、工具结果、错误反馈和统计整合。
  - 保留现有业务行为：题目提取、图片处理、逐题并发请求、答案填写策略、匹配题多级 fallback 的正确性不降低。
  - 规划 OpenAI / Claude provider 在不破坏现有配置和调用方式的前提下，如何逐步适配工具调用或工具指令输出。
  - 明确迁移步骤、风险、验证方法、可回退边界和可并行实施边界。
  - 明确工具层错误如何进入统计、调试和后续模型重试入口。
- Excluded:
  - 不引入 Node.js-only API、文件系统运行时依赖或参考项目的 React/TUI 权限 UI。
  - 不新增官方 SDK 作为运行时依赖。
  - 不改变考试页面目标 URL、UserScript grant/connect 策略，除非实现阶段发现工具化必须新增 Tampermonkey API。
  - 不改变现有题型业务语义和已有正确填写策略。
  - 本 SDD 任务只产出实施计划，不直接实现重构代码。
  - 不把模型输出的工具意图设计成可直接操作 DOM 的能力；DOM 执行必须留在本地受控工具层。

**User Scenarios**:
1. **Primary Flow**: 使用者在考试页点击 AI 自动答题后，系统仍能完成题目提取、AI 作答和答案填写；内部从答案 JSON 驱动逐步升级为工具化执行，但用户体验和成功率不倒退。
2. **Provider Compatibility**: 使用者继续使用现有 OpenAI 或 Claude 配置；工具化设计应兼容 provider 能力差异，无法使用原生 tool calling 的模型也有可控 fallback。
3. **Error Handling**: 当模型给出无效选项、填空数量不匹配、题号不存在或 DOM 写入失败时，工具层给出可分类错误，统计中能定位问题，并为模型重试或本地降级留下明确入口。
4. **Incremental Migration**: 开发者可以先将现有答案填写能力包装为工具，再迁移 provider 输出协议；在替代路径验证通过前，现有正确流程不被删除。

**Measurable Success Signals**:
- 计划明确区分模型可表达的答题意图与本地工具可执行的 DOM 操作。
- 计划列出当前正确业务行为的保护清单，并将其纳入每个迁移阶段的成功标准。
- 计划定义 provider 原生工具调用和 JSON tool-envelope fallback 两条路径。
- 计划定义可分类工具错误、统计接入和调试反馈要求。
- 计划能被拆分为可执行步骤，而不是一次性“重构所有东西”。

## Acceptance Criteria

### Functional Requirements

- [ ] **AC1 - Business Context and Scope Defined**: 任务规格明确说明为什么要进行工具化架构重构、谁会受益、哪些内容在范围内和范围外。
  - Given: Phase 2c 业务分析完成
  - When: 审阅任务文件的 Description
  - Then: 能看到业务价值、受益者、Included/Excluded 范围、用户场景和可衡量成功信号。

- [ ] **AC2 - Reference Design Analysis Complete**: 任务规格明确记录参考项目中可迁移的工具设计点。
  - Given: SDD 计划完成
  - When: 审阅任务文件的研究/架构部分
  - Then: 至少覆盖 Tool 接口、buildTool 默认值、runTools 编排、runToolUse 校验/权限/执行/结果、StreamingToolExecutor 并发与中断策略、代表性工具实现的启发。

- [ ] **AC3 - Browser-Safe Tool Architecture Defined**: 任务规格定义适合 Tampermonkey 环境的轻量工具接口。
  - Given: 架构设计完成
  - When: 审阅 Architecture Overview
  - Then: 明确工具名称、输入类型、校验函数、执行函数、并发安全标记、结果/错误类型、统计更新方式，且不依赖 Node.js-only API。

- [ ] **AC4 - Existing Behavior Preserved**: 计划明确现有业务正确性保护边界。
  - Given: 审阅实施步骤
  - When: 检查每个阶段的成功标准
  - Then: 明确要求复用现有 `question-extract`、`answer-fill`、`answer-match`、`answer-write` 能力，不删除现有匹配题 fallback、图片降级、子题 index 编码和编辑器同步保护。

- [ ] **AC5 - Provider Migration Strategy Defined**: 计划说明 provider 如何从答案 JSON 迁移到工具意图。
  - Given: 审阅架构与实施步骤
  - When: 检查 OpenAI 与 Claude/Anthropic provider 部分
  - Then: 明确原生 tool calling 可用时的路径、不可用时的 JSON tool-envelope fallback、以及如何保持逐题并发推理。

- [ ] **AC6 - Error Feedback Model Defined**: 工具层错误设计可用于重试、统计和调试。
  - Given: 审阅工具结果契约
  - When: 检查错误类型
  - Then: 至少定义 `question_not_found`、`invalid_answer_shape`、`unknown_option_label`、`blank_count_mismatch`、`matching_pair_unresolved`、`dom_write_failed`、`unsupported_question_type` 等分类。

- [ ] **AC7 - Tool Intent Contract Covers Current Question Semantics**: 工具意图设计覆盖当前 AI 自动答题已有题型语义，并定义无法安全执行时的行为。
  - Given: 审阅工具接口和工具注册设计
  - When: 检查模型可表达的答题动作
  - Then: 能看到选择题、判断题、填空题、匹配题、简答/编辑器写入等当前语义如何映射到工具输入；不支持或无法确认的题型必须返回可统计的跳过/失败结果，而不是静默误写。

- [ ] **AC8 - Implementation Decomposition Ready**: 计划拆分为可执行步骤。
  - Given: SDD 完成并晋升到 todo
  - When: 审阅 Implementation Process
  - Then: 每个步骤包含目标、修改文件、输出、成功标准、风险和依赖；不存在“重构所有东西”这类不可执行步骤。

- [ ] **AC9 - Verification Rubrics Present**: 每个关键步骤都有 LLM-as-Judge 或本地命令验证。
  - Given: SDD 完成
  - When: 审阅 Verification Summary
  - Then: 至少覆盖类型检查、lint、构建、工具契约评审、行为回归评审、provider fallback 评审和 Tampermonkey 运行时兼容性评审。

- [ ] **AC10 - Migration Safety Defined**: 计划明确工具化迁移如何分阶段保护现有正确流程。
  - Given: 审阅架构、实施步骤和风险控制
  - When: 检查迁移顺序和回退策略
  - Then: 能看到先包装现有本地执行能力、再迁移 provider 输出协议、最后移除旧路径的顺序；每个阶段都有通过条件，未通过时保留当前正确业务流程。

### Non-Functional Requirements

- [ ] **Complexity Control**: 新增抽象必须减少 AI/provider 与 DOM 填写之间的格式泄漏，不制造大量浅模块。
- [ ] **Compatibility**: 重构计划必须保持浏览器 + Tampermonkey IIFE 产物约束，不引入 Node.js 运行时能力。
- [ ] **Incremental Delivery**: 计划必须支持分阶段落地，任一阶段失败时能保留当前正确业务功能。
- [ ] **Observability**: 工具执行结果必须能进入统计、调试和后续重试判断，不退化为不可分类的字符串错误。
- [ ] **Provider Flexibility**: 工具化设计必须支持 provider 能力差异，不能把原生 tool calling 作为唯一可行路径。

### Definition of Done

- [ ] SDD 全阶段完成，任务文件从 `.specs/tasks/draft/` 晋升到 `.specs/tasks/todo/`
- [ ] 研究、代码影响、业务分析、架构、拆分、并行化和验证内容完整
- [ ] 所有 judge 质量门禁达到或记录为达到最大迭代后继续
- [ ] 最终任务可直接交给实现流程执行

## Architecture Overview

### Solution Strategy

本重构采用“先包裹、再迁移、后收敛”的策略：先把当前正确的 `AIResponse -> fillAnswers()` 路径转换为内部工具执行路径，再逐步让 provider 直接产出工具意图。第一阶段不改变题目提取、图片处理、答案匹配和 DOM 写入策略，只在 AI provider 与 DOM 执行之间插入浏览器安全的工具层。

目标迁移流固定为：

```text
AIResponse -> ExamToolUse[] -> runExamTools -> ExamToolResult[] -> ExamStats
```

工具层只接收模型表达的答题意图，不暴露 DOM selector、Angular scope、编辑器同步、拖拽 fallback 等页面实现细节。DOM 写入仍由本地脚本受控执行，失败以 typed result 进入统计和调试输出。

### Reference Design Mapping

参考项目的价值是工具生命周期，而不是运行时栈。映射关系如下：

| Reference Design | Local Mapping | Adaptation |
|---|---|---|
| `Tool` interface | `ExamTool<Input>` | 保留 name、input schema、validate、execute、concurrency metadata；移除 React/TUI/render/permission UI。 |
| `buildTool` defaults | `buildExamTool` | `isConcurrencySafe=false`、`isReadOnly=false`、`validateInput` 默认为通过，避免每个工具重复默认值。 |
| `runTools` orchestration | `runExamTools` | provider 推理并发保留；DOM-writing tools 串行执行。 |
| `runToolUse` lifecycle | `lookup -> shape guard -> semantic validation -> execute -> typed result -> stats` | 用手写 type guard，不引入 schema 依赖。 |
| `StreamingToolExecutor` | cancellation/status model only | 不实现流式工具执行；只保留取消、中断、进度和独立失败不连坐的原则。 |
| `FileEditTool` | answer DOM tools | 类比“变更前验证”：题目存在、选项可解析、空位数量匹配、匹配 pair 可解析、编辑器可写。 |
| `SyntheticOutputTool` | JSON tool-envelope fallback | 没有原生 tool calling 时，模型返回 `{ "toolUses": [...] }`。 |

### Key Decisions and Tradeoffs

1. **现有行为优先**：第一阶段必须复用 `answer-fill.ts`、`answer-match.ts`、`answer-write.ts` 的现有能力；架构更优不能以答题成功率倒退为代价。
2. **工具意图不等于 DOM 命令**：provider 只表达 `answer_choice` / `answer_blank` 等受控意图，不能直接指定 selector、点击路径或 Angular 字段。
3. **DOM 执行串行默认**：参考项目的 fail-closed 并发默认迁移到本项目；所有写 DOM 的答题工具默认非并发安全。
4. **保留逐题 AI 并发**：`ai-provider.ts` 中 `p-limit` 的 provider 并发仍是推理层能力，和工具执行层串行写 DOM 不冲突。
5. **JSON envelope 是一等路径**：原生 tool calling 因 provider/model 差异只作为增强路径；fallback 不是临时 hack。
6. **不用新 schema 依赖**：工具输入较小且固定，首轮用手写 type guard，避免 IIFE 体积和依赖复杂度增加。
7. **默认先实现 5 个题型工具**：首轮 provider-visible 工具为 `answer_choice`、`answer_multiple_choice`、`answer_blank`、`answer_essay`、`answer_matching`，因为它们分别拥有不同的输入 shape、语义校验和错误映射。若实现时发现两个或以上工具只是在转发到同一个 switch，且没有独立校验/结果映射，则把重复部分收敛到一个内部深层 `answer_question` 执行器，同时保留 provider-visible 工具名作为适配入口。
8. **本地 index 是唯一执行权威**：模型可看到 `displayIndex`，但工具执行必须绑定本地 `Question.index`，延续当前 `parseSingleAnswer()` 不信任模型 index 的保护。
9. **统计由 executor 统一拥有**：工具可以返回 result/delta，但不应各自直接散落更新 `ExamStats`，避免 provider failure、validation failure、DOM failure 双重计数。
10. **匹配题先包装不重写**：`answer-match.ts` 的多级 fallback 是高风险资产，首轮只加输入校验和诊断结果，不改 fallback 顺序。
11. **图片链路不绕过**：工具化不改变 `question-detect.ts` 的图片清洗、canvas 降级和截图兜底；provider 仍通过现有 vision 构建路径拿图片。
12. **错误可重试性显式化**：provider 可修正的输入错误标记 `retryable=true`；页面状态或 DOM 写入失败一般不自动重试，除非后续实现明确本地重试策略。

### Browser-Safe Tool Contract

类型所有权需要清晰分层：

- `src/types/exam.ts` 继续拥有稳定领域模型：`QuestionType`、`Question`、`AnswerValue`、`AIResponse`、`ExamStats`、`SUB_INDEX_MULTIPLIER`、日志/答案有效性工具。新增统计字段也放在这里，因为 `exam-panel.ts`、provider、executor 都需要读取。
- `src/modules/exam/tool-contract.ts` 拥有工具层协议：`ExamToolName`、各工具 input 类型、`ExamToolUse`、`ExamToolResult`、`ExamToolErrorCode`、`ExamToolContext`、type guards、provider-visible tool descriptions。它是 exam 模块内部协议，不上升为全局领域类型。

建议契约草图：

```ts
type ExamToolName =
  | 'answer_choice'
  | 'answer_multiple_choice'
  | 'answer_blank'
  | 'answer_essay'
  | 'answer_matching';

type ExamToolErrorCode =
  | 'unknown_tool'
  | 'invalid_tool_input'
  | 'question_not_found'
  | 'invalid_answer_shape'
  | 'unknown_option_label'
  | 'blank_count_mismatch'
  | 'matching_pair_unresolved'
  | 'dom_write_failed'
  | 'unsupported_question_type'
  | 'provider_parse_failed'
  | 'provider_request_failed'
  | 'partial_tool_success'
  | 'tool_execution_cancelled';

interface ExamToolUse<Input = unknown> {
  id?: string;
  tool: ExamToolName;
  input: Input;
  source: 'legacy-ai-response' | 'json-envelope' | 'native-tool';
}

type ExamToolResult =
  | {
      ok: true;
      tool: ExamToolName;
      questionIndex: number;
      filledCount: number;
      verified?: boolean;
      warnings?: string[];
    }
  | {
      ok: false;
      tool: ExamToolName | 'unknown';
      questionIndex?: number;
      code: ExamToolErrorCode;
      message: string;
      retryable: boolean;
      partial?: boolean;
    };

interface ExamTool<Input> {
  name: ExamToolName;
  description: string;
  inputSchema: (input: unknown) => input is Input;
  validateInput?: (input: Input, context: ExamToolContext) => ExamToolResult | null;
  isConcurrencySafe?: (input: Input) => boolean;
  isReadOnly?: (input: Input) => boolean;
  execute: (input: Input, context: ExamToolContext) => Promise<ExamToolResult>;
}
```

Per-tool input examples and type-guard sketches:

```ts
type AnswerChoiceInput = { questionIndex: number; answer: string };
// example: { "questionIndex": 12, "answer": "C" }

type AnswerMultipleChoiceInput = { questionIndex: number; answers: string[] };
// example: { "questionIndex": 13, "answers": ["A", "C"] }

type AnswerBlankInput = { questionIndex: number; answers: string[] };
// example: { "questionIndex": 21003, "answers": ["TCP", "UDP"] }

type AnswerEssayInput = { questionIndex: number; answer: string };
// example: { "questionIndex": 15, "answer": "简答题答案文本" }

type AnswerMatchingInput = {
  questionIndex: number;
  pairs: Record<string, string> | Array<{ left: string; right: string }>;
};
// example: { "questionIndex": 16, "pairs": { "①": "A", "②": "C" } }

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function hasQuestionIndex(input: Record<string, unknown>): input is { questionIndex: number } {
  return Number.isInteger(input.questionIndex) && input.questionIndex > 0;
}

function isAnswerChoiceInput(input: unknown): input is AnswerChoiceInput {
  return isRecord(input) && hasQuestionIndex(input) && typeof input.answer === 'string' && input.answer.trim() !== '';
}

function isAnswerMultipleChoiceInput(input: unknown): input is AnswerMultipleChoiceInput {
  return (
    isRecord(input) &&
    hasQuestionIndex(input) &&
    Array.isArray(input.answers) &&
    input.answers.length > 0 &&
    input.answers.every((item) => typeof item === 'string' && item.trim() !== '')
  );
}

function isAnswerBlankInput(input: unknown): input is AnswerBlankInput {
  return isAnswerMultipleChoiceInput(input);
}

function isAnswerEssayInput(input: unknown): input is AnswerEssayInput {
  return isRecord(input) && hasQuestionIndex(input) && typeof input.answer === 'string' && input.answer.trim() !== '';
}

function isAnswerMatchingInput(input: unknown): input is AnswerMatchingInput {
  if (!isRecord(input) || !hasQuestionIndex(input)) return false;
  const pairs = input.pairs;
  if (isRecord(pairs)) return Object.keys(pairs).length > 0 && Object.values(pairs).every((v) => typeof v === 'string');
  return Array.isArray(pairs) && pairs.every((p) => isRecord(p) && typeof p.left === 'string' && typeof p.right === 'string');
}
```

Transitional signatures to use during implementation:

```ts
function parseProviderToolOutput(args: {
  rawContent: string;
  question: Question;
  fallbackAnswer?: AnswerValue;
  source: 'json-envelope' | 'native-tool' | 'legacy-ai-response';
}): { toolUses: ExamToolUse[]; failures: ExamToolResult[] };

type FillAnswerResult = {
  ok: boolean;
  questionIndex: number;
  filledCount: number;
  code?: ExamToolErrorCode;
  message?: string;
  verified?: boolean;
  fallbackSyncedCount?: number;
};

async function executeAnswerForQuestion(
  question: Question,
  answer: AnswerValue,
  context: ExamToolContext,
): Promise<FillAnswerResult>;
```

`ExamStats` should retain existing fields and add tool observability without breaking current summaries:

```ts
interface ExamStats {
  // existing fields stay unchanged
  toolCallCount: number;
  toolSucceededCount: number;
  toolFailedCount: number;
  toolFailedQuestions: number[];
  toolFailuresByCode: Record<string, number>;
  providerFailedQuestions: number[];
  providerParseFailedQuestions: number[];
  cancelledToolQuestions: number[];
}
```

### Provider Migration Strategy

1. **Compatibility bridge**: keep `callProvider(...): Promise<AIResponse>` initially, then convert its result with `aiResponseToToolUses(aiResponse, questions)` before filling.
2. **Executor insertion**: replace direct `fillAnswers(questions, aiResponse, stats)` orchestration with `runExamTools(toolUses, context)`, while old `fillAnswers` can remain as a rollback path until parity is verified.
3. **JSON envelope prompt**: update provider prompt/parser to accept and prefer:

   ```json
   {
     "toolUses": [
       { "tool": "answer_choice", "input": { "questionIndex": 1, "answer": "C" } }
     ]
   }
   ```

4. **Fallback parser**: `parseProviderToolOutput` must parse native tool calls, JSON envelope, and old `{ "answer": ... }` shape. Malformed envelopes become `provider_parse_failed`, not uncaught exceptions.
5. **Native tool calling**: only after the internal `ExamToolUse` executor is stable, map local tool descriptions to OpenAI/Claude native schemas. Native output still normalizes into the same `ExamToolUse[]`.
6. **Failure handling**: provider/network failures from `requestJson`, malformed JSON, missing tool names, and unsupported provider capabilities must produce typed failures while allowing other question results to continue.
7. **Rollback boundary**: until JSON envelope and native tool paths pass regression review, the old JSON answer parser remains usable through the bridge.

### Expected File Changes

Files to create:

| Path | Purpose |
|---|---|
| `src/modules/exam/tool-contract.ts` | Tool names, input contracts, type guards, result/error taxonomy, tool context, provider-visible tool descriptions. |
| `src/modules/exam/tool-registry.ts` | Registers browser-safe tools with validators, semantic validation, concurrency flags, and execute functions. |
| `src/modules/exam/tool-executor.ts` | Implements `runExamTools`, serial DOM execution, cancellation checks, result collection, and stats mapping. |
| `src/modules/exam/provider-tool-adapter.ts` | Converts legacy `AIResponse`, JSON envelopes, and native provider tool calls into `ExamToolUse[]`. |

Files to modify:

| Path | Expected Change |
|---|---|
| `src/types/exam.ts` | Add `ExamStats` tool observability fields while preserving existing `Question`, `AnswerValue`, `AIResponse`, and sub-question index rules. |
| `src/modules/exam/ai-provider.ts` | Add tool-aware prompt/parser path and `parseProviderToolOutput` delegation while preserving provider HTTP calls, image handling, internal-index binding, and `p-limit` concurrency. |
| `src/modules/exam/answer-fill.ts` | Export or add `executeAnswerForQuestion` / richer fill result wrapper around current per-question fill behavior. |
| `src/modules/exam/answer-match.ts` | Optionally expose classified matching diagnostics; do not rewrite fallback order in first iteration. |
| `src/modules/exam/exam-panel.ts` | Insert `ExamToolUse[]` conversion/execution between provider response and DOM fill; print categorized tool failures while preserving current status summary. |

Optional only if implementation size requires it:

| Path | Purpose |
|---|---|
| `src/modules/exam/tool-prompt.ts` | Keep provider prompts/tool schemas out of `ai-provider.ts` if prompt construction becomes large. |
| `src/modules/exam/exam-runner.ts` | Move orchestration out of UI panel if `startAutoExam()` becomes too large. |

### No-Change Boundaries

These files are regression-critical and should not be modified in the first implementation unless a later phase explicitly justifies the change:

| Path | Boundary |
|---|---|
| `src/modules/exam/question-extract.ts` | Authoritative `Question` extraction, DOM lookup, and sub-question index encoding stay unchanged. |
| `src/modules/exam/question-detect.ts` | Question type detection, image extraction, sanitization, canvas recoding, screenshot fallback, and degraded image stats behavior stay unchanged. |
| `src/modules/exam/answer-write.ts` | Angular/editor write synchronization and `writeWithVerify()` fallback semantics stay unchanged. |
| `src/modules/exam/selectors.ts` | Shared DOM selectors remain centralized; new tool modules import existing selectors/helpers instead of duplicating strings. |
| `tsup.config.ts` | No new UserScript grants or `@connect` entries expected; tool layer is local TypeScript. |
| `package.json` | No new runtime dependency expected for schema validation or provider SDK. |

### Data Flow

```text
exam-panel.startAutoExam
  -> waitForQuestionsStable / extractQuestions
  -> callProvider(config, questions, stats, progress)
       -> per-question OpenAI/Claude request, image pipeline unchanged
       -> parseProviderToolOutput OR legacy parseSingleAnswer
  -> provider-tool-adapter
       -> AIResponse compatibility bridge
       -> JSON envelope/native tool normalization
       -> ExamToolUse[]
  -> runExamTools(toolUses, context)
       -> registry lookup
       -> input type guard
       -> semantic validation against Question metadata/current DOM
       -> serial executeAnswerForQuestion / matching wrapper
       -> ExamToolResult[]
       -> ExamStats tool fields
  -> printExamStats / showStatus
```

The model sees `displayIndex` for readability but tool execution uses integer `questionIndex`. For per-question calls, adapter code must bind the returned tool use to the local `Question.index` when the response came from that question, matching the current `parseSingleAnswer(expectedIndex)` safety rule.

### Error Taxonomy

Tool and provider failures must be classified as follows:

| Code | Owner | Retryable | Scenario |
|---|---|---:|---|
| `provider_request_failed` | provider adapter | true | Network/API failure, timeout, non-2xx response. |
| `provider_parse_failed` | provider adapter | true | Malformed JSON, malformed `toolUses`, unsupported native tool payload. |
| `unknown_tool` | tool executor | true | Model requested a tool not in registry. |
| `invalid_tool_input` | tool contract/executor | true | Type guard fails, missing `questionIndex`, wrong field type. |
| `question_not_found` | executor | false | Tool references no local `Question` or current DOM lookup fails. |
| `invalid_answer_shape` | tool validation | true | Choice answer is array/object, essay answer is object, matching pairs are empty, etc. |
| `unknown_option_label` | choice tool | true | Option label/content cannot resolve against `Question.options`. |
| `blank_count_mismatch` | blank tool | true | Provided blank answers cannot map safely to `blankCount` or editor count. |
| `matching_pair_unresolved` | matching tool | true | Left/right pair cannot resolve to extracted matching items/options. |
| `dom_write_failed` | answer backend | false | Local write/click/fallback execution fails. |
| `unsupported_question_type` | tool validation | true | Tool does not match `Question.type` and no safe fallback exists. |
| `partial_tool_success` | executor/backend | false | Some blanks/options were written but not all expected targets succeeded. |
| `tool_execution_cancelled` | executor | false | User cancellation/interruption before or during execution. |

Expanded scenarios to verify in later phases:

- Provider/network failure for one question does not cancel independent questions.
- Malformed JSON envelope becomes `provider_parse_failed` and preserves raw error context in logs.
- Partial blank/matching execution increments tool failure fields without losing successful question stats.
- Cancellation before DOM write prevents mutation; cancellation after a write records partial/cancelled state.

### Concurrency Model

- Provider inference remains concurrent through `p-limit`, clamped to the existing `1..20` range.
- Tool intents may be collected concurrently, but DOM-writing tools execute serially in stable question order.
- `buildExamTool` defaults `isConcurrencySafe` to `false`; answer tools do not opt into concurrency in the first implementation.
- Future read-only tools may opt into concurrency only after input validation succeeds.
- A failure in one question should not cancel other independent questions unless the page-level state is invalid or the user cancels the run.
- `runExamTools` should accept an optional cancellation signal or equivalent local cancellation flag and check it before each DOM mutation.

### Stats and Observability

Existing user-facing counters stay intact: `aiReturnedCount`, `filledCount`, `skippedQuestions`, `fillFailedQuestions`, `unknownTypeQuestions`, `imageQuestions`, `visionModeQuestions`, and `degradedImageQuestions`.

New observability should add, at minimum:

- `toolCallCount`: number of normalized `ExamToolUse` entries.
- `toolSucceededCount`: number of successful tool executions.
- `toolFailedCount`: number of failed tool executions.
- `toolFailedQuestions`: question indexes with tool failures.
- `toolFailuresByCode`: string-keyed counts by local tool error code; `src/types/exam.ts` must not import `ExamToolErrorCode` from `tool-contract.ts`.
- `providerFailedQuestions`: provider request failures.
- `providerParseFailedQuestions`: malformed or unsupported provider output.
- `cancelledToolQuestions`: cancelled/interrupted executions.

`exam-panel.ts:printExamStats()` should continue printing existing summary first, then add a compact tool-failure table when failures exist. Logs should use `displayIndex` for readability while preserving internal integer indexes for correlation.

### Implementation Detail Placement

Architecture Overview intentionally stops at strategy, contracts, data flow, error taxonomy, concurrency, and observability. Concrete regression cases, implementation risks, mitigations, step blockers, and verification gates are tracked in `## Implementation Process` so execution details remain tied to the phases that own them.

### References

- Research scratchpad: `.specs/scratchpad/20260515202114-ai-exam-tool-architecture-research.md`
- Codebase analysis: `.specs/analysis/analysis-ai-exam-tool-architecture-refactor.md`
- Business analysis scratchpad: `.specs/scratchpad/0bb72927172f3108.md`
- Phase 3 scratchpad: `.specs/scratchpad/20260515203909-ai-exam-tool-architecture-phase3.md`
- Local skill: `.agents/skills/ai-exam-tool-architecture/SKILL.md`

## Implementation Process

### Summary Table

| # | Phase Group | Step | Goal | Size | Critical Path | High-Priority Risk |
|---|---|---|---|---|---:|---:|
| 1 | Setup | Baseline inventory and migration guardrails | Freeze current behavior baseline before source changes | S | Yes | No |
| 2 | Foundational | Stats fields and typed backend result seam | Add tool observability and richer fill results without changing orchestration | M | Yes | Yes |
| 3 | Foundational | Tool contract, schemas, descriptions, and granularity guard | Define local browser-safe tool protocol and provider-visible tools | M | Yes | Yes |
| 4 | Foundational | Tool registry and execution backends | Wrap existing fill/match/write behavior behind meaningful tools | L | Yes | Yes |
| 5 | Foundational | Tool executor with serial DOM execution and stats ownership | Run validated tools serially and classify outcomes | L | Yes | Yes |
| 6 | User Stories / migration | Legacy `AIResponse` to tool-use bridge | Convert current provider output into internal tool uses before DOM writing | M | Yes | Yes |
| 7 | User Stories / migration | Orchestration migration in exam panel with rollback boundary | Replace direct fill path with tool execution while preserving old fallback | M | Yes | Yes |
| 8 | User Stories / migration | Provider JSON-envelope prompt and parser fallback | Let providers emit first-class tool envelopes without requiring native tool calling | L | Yes | Yes |
| 9 | User Stories / migration | Optional native tool-call normalization | Normalize OpenAI/Claude native tool calls into the same executor contract | M | No | No |
| 10 | Polish | Observability, status output, and compatibility cleanup | Make categorized tool failures visible without UI/config churn | M | No | No |
| 11 | Polish | Verification pass and regression checklist | Prove behavior, runtime, and contract safety before removing old paths | M | Yes | Yes |

Totals: 11 implementation steps, 67 subtasks, 9 critical-path steps, 8 high-priority risks.

### Setup

#### Step 1 - Baseline Inventory and Migration Guardrails

**Goal**: Record the current AI exam behavior and establish rollback boundaries before touching implementation code.

**Files to create**: none.

**Files to modify**: none for implementation; optional implementation note in the task branch only if the implementer keeps a temporary checklist.

**Files to leave unchanged**: all `src/**` files, especially `src/modules/exam/question-extract.ts`, `src/modules/exam/question-detect.ts`, `src/modules/exam/answer-write.ts`, `src/modules/exam/answer-match.ts`, `tsup.config.ts`, and `package.json`.

**Dependencies / blockers**: Requires the current task file, codebase analysis, and Phase 3 architecture section. Blocked if the implementer cannot inspect the current `src/modules/exam/*` flow.

**Subtasks (5)**:
- Confirm the current flow: `exam-panel.ts -> ai-provider.ts -> fillAnswers() -> answer-fill.ts / answer-match.ts / answer-write.ts`.
- Record the no-change boundary for question extraction, image handling, editor synchronization, matching fallback order, UserScript grants, and runtime dependencies.
- Identify the rollback point: old `AIResponse` parsing and direct `fillAnswers()` stay available until tool execution parity is verified.
- Define baseline command checks for later phases: `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build`.
- Confirm the first implementation does not add runtime SDKs, schema libraries, Node APIs, new Tampermonkey grants, or provider config fields.

**Success criteria**:
- A developer can state exactly which files are regression-critical and should not be rewritten in early steps.
- The old direct fill path has a named rollback boundary.
- No source code changes are made in this setup step.

**Risk / mitigation**: Risk is scope drift into broad rewrite. Mitigate by treating current correct behavior as the regression baseline and by forbidding matching/editor/image rewrites in early steps.

**Estimated size**: S.

### Foundational

#### Step 2 - Stats Fields and Typed Backend Result Seam

**Goal**: Add the minimum observability and fill-result shape needed by tools while keeping existing user-facing stats intact.

**Files to create**: none.

**Files to modify**: `src/types/exam.ts`, `src/modules/exam/answer-fill.ts`, optionally `src/modules/exam/exam-panel.ts` only to initialize/print new fields after the seam compiles.

**Files to leave unchanged**: `src/modules/exam/ai-provider.ts` provider behavior, `src/modules/exam/answer-match.ts` fallback order, `src/modules/exam/answer-write.ts` write semantics, `src/modules/exam/question-extract.ts` indexes.

**Dependencies / blockers**: Depends on Step 1 baseline. Blocked if `ExamStats` initialization sites are not all updated together.

**Subtasks (6)**:
- Add `ExamStats` fields for `toolCallCount`, `toolSucceededCount`, `toolFailedCount`, `toolFailedQuestions`, `toolFailuresByCode`, `providerFailedQuestions`, `providerParseFailedQuestions`, and `cancelledToolQuestions`.
- Keep `toolFailuresByCode` string-keyed in `src/types/exam.ts` and do not import `ExamToolErrorCode` into shared types.
- Add a local fill result type or exported wrapper result in `answer-fill.ts` that can represent success, failed code string, message, filled count, and verification status.
- Expose `executeAnswerForQuestion(question, answer, context)` or an equivalent wrapper around existing per-question fill behavior.
- Preserve the current `fillAnswers()` signature so the old orchestration path remains callable.
- Update all stats initializers so typecheck fails if any tool observability field is missing.

**Success criteria**:
- Existing `AIResponse -> fillAnswers()` behavior is still callable.
- `src/types/exam.ts` owns shared stats only; tool-specific error-code unions are not promoted there.
- `pnpm run typecheck` passes after stats initialization is complete.

**Risk / mitigation**: High risk of stats double counting or type ownership leakage. Mitigate by keeping typed tool errors local to the future tool contract and exposing only string-keyed counters in shared `ExamStats`.

**Estimated size**: M.

#### Step 3 - Tool Contract, Schemas, Descriptions, and Granularity Guard

**Goal**: Define the browser-safe tool protocol with stable provider-visible names, handwritten guards, typed local errors, and compact prompt descriptions.

**Files to create**: `src/modules/exam/tool-contract.ts`.

**Files to modify**: none outside imports from later steps.

**Files to leave unchanged**: `src/types/exam.ts` except for the Step 2 stats fields; `package.json` because no schema dependency is introduced.

**Dependencies / blockers**: Depends on Step 2 type ownership decision. Blocked if the implementation tries to expose DOM selectors or Angular details in provider-visible tool inputs.

**Subtasks (7)**:
- Define `ExamToolName` with `answer_choice`, `answer_multiple_choice`, `answer_blank`, `answer_essay`, and `answer_matching` as the default first implementation path.
- Define local `ExamToolErrorCode` in `tool-contract.ts`, including provider, validation, DOM, partial, and cancellation codes.
- Define `ExamToolUse`, `ExamToolResult`, `ExamToolContext`, `ExamTool<Input>`, and `buildExamTool()` with `isConcurrencySafe=false` and `isReadOnly=false` defaults.
- Define input types for choice, multiple choice, blank, essay, and matching tools.
- Implement handwritten type guards using `unknown`, `Record<string, unknown>`, and explicit field checks.
- Add compact provider-visible descriptions/examples that mention semantic answer intent only, not selectors, clicks, Angular scope, drag fallback, or editor internals.
- Encode the granularity guard: if two or more tools have no unique validation or result mapping, collapse duplicated execution into an internal `answer_question` helper while preserving the five provider-visible tool names.

**Success criteria**:
- Tool inputs are validateable without runtime dependencies.
- `ExamToolErrorCode` remains module-local and does not create an import cycle with `src/types/exam.ts`.
- Provider-visible contracts cover current choice, true/false, multiple choice, blank, matching, essay, and unknown fallback semantics.

**Risk / mitigation**: High risk of shallow abstraction. Mitigate by requiring every provider-visible tool to own distinct shape validation, semantic validation, and error mapping, with the explicit internal `answer_question` collapse condition.

**Estimated size**: M.

#### Step 4 - Tool Registry and Execution Backends

**Goal**: Register real answer tools that wrap existing fill behavior and perform semantic validation before DOM writes.

**Files to create**: `src/modules/exam/tool-registry.ts`.

**Files to modify**: `src/modules/exam/answer-fill.ts`; optionally `src/modules/exam/answer-match.ts` only to expose classified diagnostics without changing fallback order.

**Files to leave unchanged**: `src/modules/exam/answer-write.ts`, `src/modules/exam/question-extract.ts`, `src/modules/exam/question-detect.ts`, `src/modules/exam/selectors.ts` unless importing existing selectors/helpers is needed.

**Dependencies / blockers**: Depends on Steps 2 and 3. Blocked if existing fill functions cannot be wrapped without changing behavior; in that case add a thin adapter in `answer-fill.ts` instead of rewriting internals.

**Subtasks (7)**:
- Register `answer_choice` for single selection and true/false questions, validating answer labels/content against `Question.options`.
- Register `answer_multiple_choice`, validating non-empty arrays and option resolution before delegating to the existing multiple-choice fill backend.
- Register `answer_blank`, validating array/string normalization against `Question.blankCount` and editor target count where available.
- Register `answer_essay`, validating string answer content and delegating to the existing editor/textarea fill behavior.
- Register `answer_matching`, validating object/array pair shapes before calling the existing matching backend.
- Map backend false/failed returns into local `ExamToolResult` codes such as `unknown_option_label`, `blank_count_mismatch`, `matching_pair_unresolved`, and `dom_write_failed`.
- Keep all answer tools non-concurrency-safe in the first implementation.

**Success criteria**:
- Each registered tool can fail before mutation when shape or semantic validation is invalid.
- Matching fallback order in `answer-match.ts` remains unchanged.
- Essay/editor synchronization behavior in `answer-write.ts` remains unchanged.

**Risk / mitigation**: High risk of matching and editor regressions. Mitigate by wrapping existing `fillMatchingQuestion()` and editor writers first, adding only pre-validation and result mapping.

**Estimated size**: L.

#### Step 5 - Tool Executor With Serial DOM Execution and Stats Ownership

**Goal**: Execute normalized tool uses through a single pipeline that owns lookup, validation, serial mutation, result collection, and tool stats updates.

**Files to create**: `src/modules/exam/tool-executor.ts`.

**Files to modify**: `src/modules/exam/tool-registry.ts` only if registry lookup shape needs adjustment; `src/modules/exam/exam-panel.ts` only after Step 7 integration.

**Files to leave unchanged**: provider request functions in `src/modules/exam/ai-provider.ts`; question extraction and image pipeline files.

**Dependencies / blockers**: Depends on Steps 3 and 4. Blocked if question lookup cannot distinguish missing `Question` metadata from missing DOM element; those must map to `question_not_found` with clear messages.

**Subtasks (7)**:
- Implement registry lookup and return `unknown_tool` for unregistered names without throwing.
- Run shape guard first, semantic `validateInput` second, then `execute` only after both pass.
- Resolve `questionIndex` against local `Question[]` and current DOM lookup before mutation.
- Sort or preserve stable question order so mutating tools run serially across the page.
- Add cancellation checks before each DOM mutation and map cancellation to `tool_execution_cancelled`.
- Update `ExamStats` tool fields in the executor only; provider adapter owns provider failure fields.
- Return `ExamToolResult[]` so `exam-panel.ts` can print categorized failures without reclassifying them.

**Success criteria**:
- Mutating DOM tools are not executed concurrently.
- Failure in one tool use does not cancel independent later tool uses unless cancellation/page invalidation is explicit.
- Tool stats are updated exactly once per normalized tool use.

**Risk / mitigation**: High risk of DOM races and double counting. Mitigate by serial execution defaults and a single stats owner in `tool-executor.ts`.

**Estimated size**: L.

### User Stories / Migration

#### Step 6 - Legacy `AIResponse` to Tool-Use Bridge

**Goal**: Preserve the current provider response shape while converting every parsed answer into internal `ExamToolUse[]` before DOM writing.

**Files to create**: `src/modules/exam/provider-tool-adapter.ts`.

**Files to modify**: `src/modules/exam/ai-provider.ts` only to export or pass enough parsed response context if needed; no prompt behavior change yet.

**Files to leave unchanged**: `src/modules/exam/exam-panel.ts` until Step 7, all DOM writing files except already-added wrappers.

**Dependencies / blockers**: Depends on Steps 3 and 5. Blocked if `AIResponse` contains answers that cannot be mapped to a current `Question.type`; map these to essay/unknown fallback or `unsupported_question_type` per existing behavior.

**Subtasks (6)**:
- Implement `aiResponseToToolUses(aiResponse, questions)` with one tool use per returned answer.
- Bind each answer to the locally known `Question.index`, preserving the current expected-index protection instead of trusting model-returned indexes.
- Map single selection and true/false to `answer_choice`.
- Map multiple selection to `answer_multiple_choice`.
- Map fill-in-blank to `answer_blank`, matching to `answer_matching`, and short-answer/unknown fallback to `answer_essay` where current behavior does so.
- Return adapter failures as typed `ExamToolResult` failures when a legacy answer cannot be safely normalized.

**Success criteria**:
- Current provider output can be executed through tools without changing prompts.
- Sub-question indexes using `SUB_INDEX_MULTIPLIER` remain local execution keys.
- Display indexes remain prompt/logging-only and are not trusted for execution.

**Risk / mitigation**: High risk of index drift. Mitigate by always binding per-question outputs to local `Question.index` and by preserving the current expected-index behavior.

**Estimated size**: M.

#### Step 7 - Orchestration Migration in Exam Panel With Rollback Boundary

**Goal**: Replace direct `fillAnswers()` orchestration with adapter + executor while retaining a clear rollback path until parity is verified.

**Files to create**: none.

**Files to modify**: `src/modules/exam/exam-panel.ts`, optionally `src/modules/exam/ai-provider.ts` only for return-shape compatibility.

**Files to leave unchanged**: `src/utils/storage.ts`, `src/constants/index.ts`, `tsup.config.ts`, and provider config UI unless later requirements explicitly add a feature flag.

**Dependencies / blockers**: Depends on Steps 5 and 6. Blocked if executor results cannot be converted back into existing `filledCount`, `fillFailedQuestions`, and `skippedQuestions` semantics.

**Subtasks (6)**:
- In `startAutoExam()`, call provider as before, convert `AIResponse` to `ExamToolUse[]`, then call `runExamTools()`.
- Preserve existing progress/status updates during extraction and provider calls.
- Preserve existing user-facing success/failure summary while adding tool result details only after core counts.
- Keep the old direct `fillAnswers()` callable behind a temporary rollback branch or easily revertible code path until Step 11 passes.
- Ensure provider failures, parse failures, validation failures, DOM failures, and skipped/unsupported questions are not counted twice.
- Verify cancellation or interruption does not claim full success after partial DOM writes.

**Success criteria**:
- Primary user flow still extracts questions, calls AI, and fills answers.
- Existing summary counters remain meaningful and comparable to the old run.
- Tool results are visible for debugging but do not create new required user configuration.

**Risk / mitigation**: High risk of breaking the working user flow. Mitigate by keeping provider calls unchanged at this stage and retaining rollback to `fillAnswers()` until verification completes.

**Estimated size**: M.

#### Step 8 - Provider JSON-Envelope Prompt and Parser Fallback

**Goal**: Make JSON tool-envelope output the first-class provider protocol while supporting legacy `{ answer }` fallback and malformed-output diagnostics.

**Files to create**: optionally `src/modules/exam/tool-prompt.ts` if prompt/tool descriptions make `ai-provider.ts` too large.

**Files to modify**: `src/modules/exam/ai-provider.ts`, `src/modules/exam/provider-tool-adapter.ts`, optionally `src/modules/exam/tool-contract.ts` for prompt examples.

**Files to leave unchanged**: provider HTTP transport helpers, image sanitization/resolution, `p-limit` concurrency clamping, storage/config normalization.

**Dependencies / blockers**: Depends on Steps 6 and 7. Blocked if provider-specific response parsing cannot preserve legacy answer JSON; legacy parsing must remain as fallback.

**Subtasks (7)**:
- Update system and per-question prompts to prefer `{ "toolUses": [...] }` with the five provider-visible answer tools.
- Keep prompt examples compact and omit DOM selectors, click paths, Angular scope, and fallback strategy names.
- Implement `parseProviderToolOutput()` for valid JSON envelopes, fenced JSON, native-like tool payload placeholders, and legacy `{ answer }` responses.
- Convert malformed envelopes into `provider_parse_failed` results with retryable `true`, not uncaught exceptions.
- Preserve provider request concurrency and image payload construction exactly as before.
- Add parser handling for unknown tool names and invalid input shapes so they reach executor classification cleanly.
- Ensure one provider failure or malformed response does not discard successful independent question results.

**Success criteria**:
- OpenAI-compatible and Claude plain-text JSON responses can both produce normalized `ExamToolUse[]`.
- Legacy answer JSON remains accepted during migration.
- Parser failures are categorized and visible in stats/logs.

**Risk / mitigation**: High risk of provider capability divergence and parse brittleness. Mitigate by keeping JSON envelope mandatory and native tool calling optional, with legacy answer fallback retained.

**Estimated size**: L.

#### Step 9 - Optional Native Tool-Call Normalization

**Goal**: Add native tool-call support only after the internal tool executor and JSON-envelope fallback are stable.

**Files to create**: none expected; optionally extend `src/modules/exam/tool-prompt.ts` if created in Step 8.

**Files to modify**: `src/modules/exam/ai-provider.ts`, `src/modules/exam/provider-tool-adapter.ts`, `src/modules/exam/tool-contract.ts` for provider schema projection helpers if needed.

**Files to leave unchanged**: `package.json`, `tsup.config.ts`, and `src/utils/storage.ts` unless an explicit later decision adds a user-facing mode toggle.

**Dependencies / blockers**: Depends on Step 8 passing. Blocked if native tool APIs require SDKs, new grants, or provider-specific runtime dependencies; in that case defer this step.

**Subtasks (5)**:
- Add local projection from `ExamTool` descriptions/guards to OpenAI/Claude native schema shapes without importing official SDKs.
- Normalize native tool-call outputs into the same `ExamToolUse[]` contract used by JSON envelope.
- Keep JSON envelope fallback active for every provider/model.
- Ensure provider selection does not require new saved config fields.
- Document any provider/model limitations in code comments or task follow-up notes.

**Success criteria**:
- Native tool-call support, if implemented, is an enhancement and not a dependency for successful auto-answering.
- All native outputs pass through the same executor and stats path.
- No runtime SDK or Node-only API is introduced.

**Risk / mitigation**: Medium risk of overfitting to provider APIs. Mitigate by treating this as optional and deferring it if it destabilizes the JSON-envelope path.

**Estimated size**: M.

### Polish

#### Step 10 - Observability, Status Output, and Compatibility Cleanup

**Goal**: Make tool execution results understandable to maintainers while preserving the existing end-user panel experience.

**Files to create**: none.

**Files to modify**: `src/modules/exam/exam-panel.ts`, optionally `src/modules/exam/tool-executor.ts` for result formatting helpers.

**Files to leave unchanged**: storage/config files unless the implementation deliberately adds a feature flag, which is not expected for the first pass.

**Dependencies / blockers**: Depends on Steps 7 and 8. Blocked if tool results do not include both internal question index and readable display context.

**Subtasks (5)**:
- Print existing exam stats first so users see familiar success/failure counts.
- Add compact categorized tool failure output keyed by code and readable display index.
- Log provider parse/request failures separately from DOM execution failures.
- Remove temporary duplicate formatting once `ExamToolResult[]` is the source of tool diagnostics.
- Confirm no new persistent state is written for tool calls or tool run history.

**Success criteria**:
- A failed run shows whether the issue was provider request, provider parse, validation, unsupported type, or DOM write.
- The panel does not require new user settings to run the toolized path.
- Existing user-facing status messages are not replaced by noisy internal traces.

**Risk / mitigation**: Medium risk of noisy output. Mitigate by keeping detailed tool results in console/log summaries and only surfacing compact status text in the panel.

**Estimated size**: M.

#### Step 11 - Verification Pass and Regression Checklist

**Goal**: Verify the migration against compile-time checks, runtime constraints, and the current behavior regression baseline before removing rollback code.

**Files to create**: none required; optional focused test helpers only if the repo already supports them.

**Files to modify**: source files only for fixes discovered during verification; do not expand scope to new features.

**Files to leave unchanged**: no-change boundaries from Step 1 unless a regression proves a tightly scoped change is necessary and documented.

**Dependencies / blockers**: Depends on Steps 2 through 8, and Step 9 only if implemented. Blocked if typecheck/lint/build cannot run in the local environment; record the blocker and do not delete rollback code.

**Subtasks (6)**:
- Run `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build`.
- Review `src/**` for accidental Node-only imports such as `fs`, `path`, or `process`.
- Regression-review matching: parsing formats and existing fallback order in `answer-match.ts` remain intact.
- Regression-review blanks, essay/editor sync, image question handling, degraded image stats, and sub-question index binding.
- Regression-review provider parsing: valid envelope, fenced JSON, legacy `{ answer }`, missing `toolUses`, unknown tool, malformed input, and provider/network failure.
- Remove or disable rollback code only after the toolized legacy bridge and JSON-envelope path pass the above checks; otherwise keep rollback boundary documented.

**Success criteria**:
- Typecheck, lint, and build pass, or any inability to run them is explicitly documented.
- No new Node-only APIs, runtime SDKs, schema dependencies, grants, or connect rules are introduced.
- Existing correct answer-writing behavior is preserved for matching, blanks, essays, images, sub-questions, and provider failures.

**Risk / mitigation**: High risk of hidden real-page regression. Mitigate by preserving old paths until command checks and targeted regression reviews pass, and by avoiding first-pass rewrites of extraction, matching fallback, image handling, and editor synchronization.

**Estimated size**: M.

### Definition of Done

- [ ] Steps 1 through 8 and Step 11 are complete; Step 9 is either complete or explicitly deferred as optional.
- [ ] `ExamToolErrorCode` is local to `src/modules/exam/tool-contract.ts`; shared `ExamStats.toolFailuresByCode` remains string-keyed.
- [ ] The first implementation exposes the five provider-visible tools: `answer_choice`, `answer_multiple_choice`, `answer_blank`, `answer_essay`, and `answer_matching`, or documents the exact internal `answer_question` consolidation condition that was triggered.
- [ ] Current `AIResponse` provider output can still drive answer filling through the legacy bridge.
- [ ] JSON tool-envelope provider output is parsed, normalized, executed, and categorized without requiring native tool calling.
- [ ] Provider inference concurrency remains separate from serial DOM-writing tool execution.
- [ ] Existing matching fallback order, blank/editor behavior, image handling, sub-question index rules, and editor sync protections are preserved.
- [ ] Tool stats and provider failure stats are categorized without double counting existing user-facing counters.
- [ ] `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` pass, or blockers are recorded with rollback code retained.
- [ ] No new Node.js-only APIs, runtime SDKs, schema libraries, UserScript grants, or provider storage fields are introduced unless a later task explicitly approves them.

## Parallelization Plan

### Phase 5 Summary

Phase 5 reorganizes the 11 implementation steps from `## Implementation Process` for safe parallel execution in a shared TypeScript userscript codebase. The plan optimizes for parallelism where write sets are independent, but serializes changes to high-conflict files such as `src/modules/exam/exam-panel.ts`, `src/modules/exam/ai-provider.ts`, `src/modules/exam/answer-fill.ts`, and `src/modules/exam/provider-tool-adapter.ts`.

**Scratchpad**: `.specs/scratchpad/20260515210750-ai-exam-tool-architecture-phase5.md`

**Steps reorganized**: 11 implementation steps, with high-risk Steps 4 and 8 explicitly sub-scheduled.

**Maximum practical parallelization depth**: 3 agents.

**Available agents**: worker, explorer, default, opus, sonnet, haiku.

### Dependency Graph

```text
Step 1 Baseline
  -> Step 2 Stats/backend seam
  -> Step 3 Tool contract

Step 2 + Step 3 converge into Step 4 sub-schedule:
  Step 3 -> Step 4A Registry skeleton
  Step 2 -> Step 4B Fill backend adapter
  Step 1 -> Step 4C Matching diagnostics
  Step 4A + Step 4B + Step 4C -> Step 4D Registered tools + semantic validation

Main critical path after registry convergence:
  Step 4D -> Step 5 Executor/stats owner
  Step 5 -> Step 6 Legacy AIResponse bridge
  Step 5 + Step 6 -> Step 7 Exam panel orchestration + rollback branch
  Step 7 -> Step 8A Envelope prompt contract
  Step 7 -> Step 8B Verification fixture placeholders
  Step 8A + Step 8B -> Step 8C Parser fallback implementation
  Step 8C -> Step 8D Provider prompt/parser integration
  Step 8D -> Step 11 Verification and rollback decision

Optional branch:
Step 8D -> Step 9 Native tool-call normalization -> Step 11

Observability branch:
Step 5 -> Step 10A Formatting helpers
Step 7 -> Step 10B Final status/panel integration -> Step 11
```

### Execution Waves

| Wave | Parallel Group | Steps / Sub-Steps | Depends On | Max Agents | Primary Output |
|---|---|---|---|---:|---|
| 0 | Baseline | Step 1 | Task and analysis files | 1 | No-change boundaries, rollback point, verification command list. |
| 1 | Foundational contracts | Step 2 + Step 3 | Step 1 | 2 | Stats/backend seam and `tool-contract.ts`. |
| 2 | Backend wrapping | Step 4A + Step 4B + Step 4C | Steps 2-3 | 3 | Registry skeleton, fill backend adapter, matching diagnostics adapter. |
| 3 | Registry convergence | Step 4D | Step 4A/4B/4C | 1 | Complete registered answer tools with semantic validation. |
| 4 | Executor and observability draft | Step 5 + Step 10A | Step 4D | 2 | `tool-executor.ts` and optional formatting helpers that avoid `exam-panel.ts`. |
| 5 | Legacy bridge | Step 6 | Step 5 result contract stable | 1 | `AIResponse` to `ExamToolUse[]` adapter. |
| 6 | Orchestration migration | Step 7 | Steps 5-6 | 1 | `exam-panel.ts` uses adapter + executor with rollback path retained. |
| 7 | Envelope preparation | Step 8A + Step 8B | Step 7 contract shape stable | 2 | Prompt contract draft and concrete fixture placeholders for Phase 6. |
| 8 | Provider envelope integration | Step 8C + Step 8D | Step 8A/8B and Step 7 | 1 | JSON-envelope parser fallback and provider prompt integration. |
| 9 | Optional/polish | Step 9 + Step 10B | Step 8D, or Step 8 deferred decision | 2 | Optional native normalization and final observability cleanup. |
| 10 | Final verification | Step 11 | Required Steps 2-8, optional Step 9 if done | 1 | Command checks, regression review, rollback removal or retention decision. |

Maximum depth is capped at 3 because Wave 2 is the only point where three independent write sets can safely proceed. Provider, executor, and panel migration work must be serialized to avoid conflicting writes and unclear ownership.

### Parallelizable Groups

#### Group A - Foundation After Baseline

- **Step 2** can run in parallel with **Step 3** because it owns `src/types/exam.ts` and `src/modules/exam/answer-fill.ts`, while Step 3 owns new `src/modules/exam/tool-contract.ts`.
- Coordination requirement: agree on string names for tool failure codes before merging; `src/types/exam.ts` must keep `toolFailuresByCode: Record<string, number>` and must not import `ExamToolErrorCode`.

#### Group B - Step 4 Sub-Schedule: Tool Registry and Execution Backends

Step 4 is high-risk and must be split during implementation planning:

| Sub-Step | Agent | Write Set | Depends On | Parallel With | Output |
|---|---|---|---|---|---|
| 4A - Registry skeleton | sonnet | `src/modules/exam/tool-registry.ts` | Step 3 | 4B, 4C | Empty/placeholder registry with lookup shape and `buildExamTool` usage. |
| 4B - Fill backend adapter | worker | `src/modules/exam/answer-fill.ts` | Step 2 | 4A, 4C | `executeAnswerForQuestion` or equivalent wrapper preserving `fillAnswers()`. |
| 4C - Matching diagnostics adapter | opus | `src/modules/exam/answer-match.ts` only if needed | Step 1 | 4A, 4B | Classified diagnostics without changing fallback order. |
| 4D - Register semantic tools | opus | `src/modules/exam/tool-registry.ts`, small imports from `answer-fill.ts` | 4A-4C | none | Five answer tools with pre-mutation validation and non-concurrency-safe defaults. |

Step 4D is serialized because it integrates all Step 4 write sets and resolves semantic validation behavior. It must not rewrite `answer-write.ts`, `question-extract.ts`, or `question-detect.ts`.

#### Group C - Executor, Bridge, And Observability Draft

- **Step 5** owns `src/modules/exam/tool-executor.ts` and may adjust registry lookup types.
- **Step 6** owns `src/modules/exam/provider-tool-adapter.ts`, starts after Step 5 result contracts are stable, and must avoid prompt changes.
- **Step 10A** may draft result formatting helpers only if it does not write `src/modules/exam/exam-panel.ts` before Step 7.
- Coordination requirement: Step 5 owns stats mutation for tool execution; Step 6 owns provider/adapter failure creation but not final tool stats counting.

#### Group D - Step 8 Sub-Schedule: Provider JSON-Envelope Prompt and Parser Fallback

Step 8 is high-risk and must be split during implementation planning:

| Sub-Step | Agent | Write Set | Depends On | Parallel With | Output |
|---|---|---|---|---|---|
| 8A - Envelope prompt contract | sonnet | `src/modules/exam/tool-contract.ts` or optional `src/modules/exam/tool-prompt.ts` | Step 7 contract shape stable | 8B | Compact provider-facing tool descriptions/examples. |
| 8B - Parser fixture placeholders | explorer | `.specs/fixtures/ai-exam-tools/*` in Phase 6, no source writes in implementation until verification phase | Step 7 contract shape stable | 8A | Concrete fixture names and expected outcomes finalized by Phase 6. |
| 8C - Parser fallback implementation | opus | `src/modules/exam/provider-tool-adapter.ts` | 8A/8B | none | Valid envelope, fenced JSON, legacy answer JSON, malformed JSON, unknown tool, invalid input handling. |
| 8D - Provider prompt integration | opus | `src/modules/exam/ai-provider.ts`, optional `tool-prompt.ts` imports | 8C | none | Provider prompts prefer envelope while preserving request concurrency, image payloads, and legacy fallback. |

Step 8C and Step 8D are serialized because both touch provider output semantics and must preserve legacy parsing. Native tool calling remains Step 9 and cannot block Step 8 acceptance.

### Write-Set Ownership

| Path / Area | Owner Step | Conflict Rule |
|---|---|---|
| `src/types/exam.ts` | Step 2 | No other step adds shared tool type unions here; only string-keyed stats fields are allowed. |
| `src/modules/exam/tool-contract.ts` | Step 3, then 8A for prompt examples | Step 8A may add provider descriptions only after Step 3 contract names stabilize. |
| `src/modules/exam/answer-fill.ts` | Step 2, then 4B | Step 4B must preserve `fillAnswers()` rollback path. |
| `src/modules/exam/answer-match.ts` | 4C only if necessary | Diagnostics-only; fallback order must not change. |
| `src/modules/exam/tool-registry.ts` | 4A then 4D | 4D is the only step that finalizes registered tools. |
| `src/modules/exam/tool-executor.ts` | Step 5 | Single owner for execution stats updates. |
| `src/modules/exam/provider-tool-adapter.ts` | Step 6 then 8C | Step 6 adds legacy bridge; Step 8C adds envelope/native-like parsing fallback. |
| `src/modules/exam/exam-panel.ts` | Step 7 then 10B | Step 7 owns orchestration switch; Step 10B only adjusts display after Step 7 lands. |
| `src/modules/exam/ai-provider.ts` | 8D, optional Step 9 | No prompt/parser changes before Step 8D; provider HTTP/image/concurrency code remains unchanged. |
| `src/utils/storage.ts`, `src/constants/index.ts`, `tsup.config.ts`, `package.json` | No planned owner | Do not modify unless later verification proves a tightly scoped need. |

### Agent Assignments

| Work Item | Assigned Agent | Reason |
|---|---|---|
| Step 1 baseline | explorer | Read-heavy inventory and rollback boundary capture. |
| Step 2 stats/backend seam | sonnet | Bounded TypeScript changes with moderate risk. |
| Step 3 tool contract | opus | Core architecture contract and error taxonomy. |
| Step 4A registry skeleton | sonnet | Bounded new module scaffolding. |
| Step 4B fill backend adapter | worker | Mechanical wrapper around existing fill behavior. |
| Step 4C matching diagnostics | opus | High-risk compatibility area. |
| Step 4D semantic tool registration | opus | High-risk integration across contract and backend. |
| Step 5 executor | opus | Central serial execution and stats ownership. |
| Step 6 legacy bridge | sonnet | Provider-neutral adapter with clear mapping rules. |
| Step 7 orchestration migration | opus | User-flow migration and rollback boundary. |
| Step 8A prompt contract | sonnet | Compact prompt/schema text from existing contract. |
| Step 8B fixtures placeholders | explorer | Verification-focused artifact discovery and naming. |
| Step 8C parser fallback | opus | High-risk parser semantics and error classification. |
| Step 8D provider integration | opus | Provider behavior must preserve concurrency and image handling. |
| Step 9 optional native normalization | default | Optional integration; defer if it risks JSON-envelope stability. |
| Step 10 observability | worker | Mostly formatting and summary output once result contract is stable. |
| Step 11 verification | opus | Final gate, regression review, rollback decision. |

Agent distribution summary: opus 8, sonnet 4, worker 2, explorer 2, default 1, haiku 0. Haiku is intentionally unused by default because the task has high regression risk and few truly trivial write sets.

### False-Dependency Notes

- Step 3 does not need Step 2 to finish as long as both agents coordinate string error code names; the shared stats type remains string-keyed.
- Step 4C matching diagnostics is optional and should not block 4A/4B unless the matching tool cannot classify failures without it.
- Step 10 formatting helpers can be drafted after Step 5, but any `exam-panel.ts` write waits for Step 7.
- Step 8A prompt examples can be drafted before parser code, but Step 8C/8D must wait until Step 7 proves executor orchestration works.
- Step 9 native tool-call normalization is not on the critical path; deferring it must not block Step 11 if JSON envelope and legacy fallback pass.
- Verification fixture placeholders are planned in Phase 5 but finalized in Phase 6; their absence during implementation planning is not a source-code blocker.

### Phase 6 Fixture Placeholders

Phase 6 must finalize concrete fixtures or equivalent inline verification cases for these scenarios:

| Placeholder | Scenario | Expected Classification |
|---|---|---|
| `.specs/fixtures/ai-exam-tools/valid-tool-envelope.json` | Valid `{ "toolUses": [...] }` for all five answer tools | Normalized `ExamToolUse[]`; no provider parse failure. |
| `.specs/fixtures/ai-exam-tools/invalid-tool-input-envelope.json` | Known tool with wrong input shape, such as `answer_blank.answers` not an array/string-normalizable value | `invalid_tool_input` or `invalid_answer_shape`, retryable. |
| `.specs/fixtures/ai-exam-tools/unknown-tool-envelope.json` | Tool name not present in registry | `unknown_tool`, retryable. |
| `.specs/fixtures/ai-exam-tools/malformed-json-response.txt` | Broken JSON, non-JSON prose, or truncated fenced JSON | `provider_parse_failed`, retryable. |
| `.specs/fixtures/ai-exam-tools/matching-pair-unresolved.json` | Matching pair cannot resolve to extracted left/right items | `matching_pair_unresolved`, retryable. |
| `.specs/fixtures/ai-exam-tools/blank-count-mismatch.json` | Provided blank answers count differs from `Question.blankCount` or safe target count | `blank_count_mismatch`, retryable. |

These are placeholders/links for Phase 6 verification design. Phase 5 does not create source tests or fixtures unless the verification phase chooses that artifact format.

### Rollback And Coordination Rules

- **Step 7 rollback mechanism**: keep the legacy `AIResponse -> fillAnswers()` path callable behind a temporary internal execution switch or a clearly isolated branch in `startAutoExam()`. This switch should not be a persisted user setting unless a later task explicitly approves it.
- **Step 7 rollback trigger**: if adapter + executor results cannot preserve existing `filledCount`, `fillFailedQuestions`, and `skippedQuestions` semantics, revert the Step 7 orchestration commit or force the temporary switch back to the direct legacy fill path while retaining Steps 2-6 for further fixes.
- **Step 8 rollback mechanism**: keep legacy `{ "answer": ... }` parsing accepted after envelope prompts are introduced. If provider envelope parsing regresses, disable envelope preference or revert the Step 8 commit without removing the Step 7 legacy bridge.
- **Step 11 rollback decision**: rollback code may be removed or disabled only after `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, parser fixture review, matching/blank/essay/image/sub-question regression review, and provider fallback review pass. If any command cannot run or any regression remains unresolved, keep rollback code and document the blocker.
- **Commit-level boundaries**: implementation should separate commits for Steps 2-6 foundational tool path, Step 7 orchestration migration, Step 8 provider envelope migration, and Step 11 rollback cleanup. This lets future implementers revert the narrow failing phase without discarding earlier no-behavior-change infrastructure.
- **Shared-code coordination**: only the assigned owner writes a file in the write-set table during a wave. Other agents may inspect and report findings, but must not edit that file until ownership transfers in the next wave.

### Sub-Agent Execution Directive

When implementing this plan later, sub-agents MUST follow these rules:

- Use only the available agents listed in this plan: worker, explorer, default, opus, sonnet, haiku.
- Each sub-agent must implement exactly its assigned step or sub-step and must not opportunistically refactor no-change boundary files.
- Before writing, each sub-agent must inspect the current file state and verify no unrelated user edits are being overwritten.
- Parallel agents may run only within the same execution wave and only when their write sets do not overlap.
- High-risk shared files (`exam-panel.ts`, `ai-provider.ts`, `answer-fill.ts`, `provider-tool-adapter.ts`) require serialized ownership.
- All DOM-writing tool behavior defaults to non-concurrency-safe; provider inference concurrency remains separate from serial DOM execution.
- Source implementation must preserve browser + Tampermonkey IIFE constraints: no Node.js-only APIs, no runtime SDK dependency, no schema library unless separately approved, no new grants/connect rules unless proven necessary.
- If an assigned step discovers a dependency mismatch, it must stop at the smallest safe boundary, record the blocker, and avoid broad rewrites.

## Verification Plan

### Phase 6 Summary

This verification plan turns the implementation steps into explicit quality gates for the AI exam tool architecture refactor. It verifies that the new tool layer improves the provider-to-DOM boundary without regressing the working OUCHN exam behavior: matching fallback order, editor fallback synchronization, image-question handling, sub-question integer indexes, provider fallback parsing, serial DOM mutation, and Tampermonkey IIFE compatibility.

**Scratchpad**: `.specs/scratchpad/20260515212609-ai-exam-tool-architecture-phase6.md`

**Verification levels**:

- **Panel**: three independent LLM-as-Judge evaluations: architecture contract, behavior regression, and browser/runtime compatibility.
- **Single**: one LLM-as-Judge evaluation for a bounded artifact.
- **Per-Item**: one evaluation per fixture or concrete case.
- **None**: no LLM evaluation; command/static-only verification. No implementation step uses None in this plan.

**Default threshold**: 4.0/5.0. A step fails if its weighted score is below threshold, if required artifacts are missing, if required local commands fail, or if a hard pass/fail condition says rollback code must be retained.

### Local Command Gates

Run these commands from the repository root at the step scopes listed below and always in Step 11:

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
rg -n "from ['\"]node:|from ['\"](fs|path|process|child_process|os)['\"]|require\(['\"](node:)?(fs|path|process|child_process|os)['\"]\)|\bprocess\." src
```

The static `rg` command passes only when it prints no matches. If local commands cannot run, record the blocker and keep the legacy rollback path enabled.

### Concrete Verification Fixtures

These fixtures may be materialized under `.specs/fixtures/ai-exam-tools/` during implementation, or used as inline parser/executor review cases if the repo does not add fixture files. Expected classifications are mandatory.

**F1 - Valid all-tools envelope** (`valid-tool-envelope.json`):

```json
{
  "toolUses": [
    { "tool": "answer_choice", "input": { "questionIndex": 1, "answer": "C" } },
    { "tool": "answer_multiple_choice", "input": { "questionIndex": 2, "answers": ["A", "D"] } },
    { "tool": "answer_blank", "input": { "questionIndex": 21003, "answers": ["TCP", "UDP"] } },
    { "tool": "answer_essay", "input": { "questionIndex": 4, "answer": "简答题答案文本" } },
    { "tool": "answer_matching", "input": { "questionIndex": 5, "pairs": [{ "left": "1", "right": "A" }, { "left": "2", "right": "B" }] } }
  ]
}
```

Expected: normalized `ExamToolUse[]`; no `provider_parse_failed`; sub-question index `21003` remains the local integer execution key.

**F2 - Invalid known-tool input** (`invalid-tool-input-envelope.json`):

```json
{ "toolUses": [{ "tool": "answer_blank", "input": { "questionIndex": 3, "answers": 42 } }] }
```

Expected: `invalid_tool_input` or `invalid_answer_shape`, retryable, no DOM mutation.

**F3 - Unknown tool payload** (`unknown-tool-envelope.json`):

```json
{ "toolUses": [{ "tool": "click_dom", "input": { "selector": "#submit", "value": "A" } }] }
```

Expected: `unknown_tool`, retryable, selector is ignored and never executed.

**F4 - Malformed JSON response** (`malformed-json-response.txt`):

```text
{"toolUses":[{"tool":"answer_choice","input":{"questionIndex":1,"answer":"A"}}
```

Expected: `provider_parse_failed`, retryable, no uncaught exception.

**F5 - Matching pair unresolved** (`matching-pair-unresolved.json`):

```json
{ "toolUses": [{ "tool": "answer_matching", "input": { "questionIndex": 5, "pairs": { "火星": "不存在选项" } } }] }
```

Expected: `matching_pair_unresolved`, retryable, existing matching fallback order remains unchanged.

**F6 - Blank-count mismatch** (`blank-count-mismatch.json`):

```json
{ "toolUses": [{ "tool": "answer_blank", "input": { "questionIndex": 6, "answers": ["only-one"] } }] }
```

Expected with `Question.blankCount = 2`: `blank_count_mismatch`, retryable, no partial blank write unless explicitly classified as `partial_tool_success`.

**F7 - Fenced JSON envelope fallback** (`fenced-json-envelope.txt`):

````text
```json
{ "toolUses": [{ "tool": "answer_choice", "input": { "questionIndex": 1, "answer": "B" } }] }
```
````

Expected: parser strips the fence and normalizes to `ExamToolUse[]`.

**F8 - Legacy answer JSON fallback** (`legacy-answer-fallback.json`):

```json
{ "index": 999, "answer": ["A", "C"] }
```

Expected in a per-question call for local question index `2`: model index `999` is ignored, local `Question.index = 2` is used, and the answer maps to `answer_multiple_choice`.

**F9 - Image-question envelope** (`image-question-envelope.json`):

```json
{ "toolUses": [{ "tool": "answer_choice", "input": { "questionIndex": 7, "answer": "D" } }] }
```

Expected with `Question.index = 7` containing sanitized images: provider image construction and `imageQuestions` / `visionModeQuestions` / `degradedImageQuestions` stats remain owned by the existing image pipeline; the tool layer does not re-fetch, re-sanitize, or bypass image data.

### Step Verification Rubrics

#### Step 1 - Baseline Inventory and Migration Guardrails

**Verification level**: Single. **Evaluations**: 1. **Threshold**: 4.0/5.0.

**Rubric**: baseline flow accuracy (0.30), no-change boundary completeness for extraction/image/matching/editor/runtime files (0.30), rollback boundary clarity for `AIResponse -> fillAnswers()` (0.25), command/static gate list captured for later steps (0.15).

**Required artifacts**: written baseline note or implementation checklist identifying current flow, no-change files, rollback point, and command gates.

**Local commands**: none required because this step must not modify source.

**Fixtures**: none.

**Pass/fail criteria**: Pass only if no `src/**` files are changed and the rollback boundary is explicit. Fail if Step 1 starts implementation or omits matching/editor/image/sub-question protections.

#### Step 2 - Stats Fields and Typed Backend Result Seam

**Verification level**: Single. **Evaluations**: 1. **Threshold**: 4.0/5.0.

**Rubric**: existing stats preserved and initialized everywhere (0.30), new tool/provider stats fields match the architecture names (0.25), `answer-fill.ts` exposes a richer backend result without removing `fillAnswers()` (0.25), shared type ownership remains string-keyed with no import from `tool-contract.ts` (0.20).

**Required artifacts**: diff for `src/types/exam.ts`, `src/modules/exam/answer-fill.ts`, and any stats initializer changes.

**Local commands**: `pnpm run typecheck`.

**Fixtures**: none.

**Pass/fail criteria**: Pass if `fillAnswers()` remains callable and all stats initializers compile. Fail if shared `src/types/exam.ts` imports module-local tool error unions or existing user-facing counters are removed.

**Dependency ambiguity check**: Step 2 may run in parallel with Step 3, but verification fails if either step introduces an import cycle or makes `src/types/exam.ts` depend on `src/modules/exam/tool-contract.ts`.

#### Step 3 - Tool Contract, Schemas, Descriptions, and Granularity Guard

**Verification level**: Panel. **Evaluations**: 3. **Threshold**: 4.0/5.0 per panel result.

**Rubric**: stable provider-visible tool names and local result/error taxonomy (0.25), handwritten `unknown`-based guards for all tool inputs (0.25), provider-visible descriptions expose answer intent without DOM selectors/Angular/fallback internals (0.25), granularity guard prevents shallow pass-through tools and preserves the internal `answer_question` consolidation option (0.25).

**Required artifacts**: `src/modules/exam/tool-contract.ts` with `ExamToolName`, `ExamToolErrorCode`, `ExamToolUse`, `ExamToolResult`, `ExamToolContext`, `ExamTool<Input>`, `buildExamTool()`, input guards, and prompt descriptions/examples.

**Local commands**: `pnpm run typecheck`; static no Node-only API check.

**Fixtures**: F1, F2, F3 shape review against the guards.

**Pass/fail criteria**: Pass if contracts cover choice, true/false, multiple choice, blank, matching, essay, and unknown fallback semantics without runtime schema dependencies. Fail if provider tools can directly specify selectors, clicks, Angular state, or arbitrary DOM operations.

**Dependency ambiguity check**: Step 3 may complete before Step 2 stats fields, but its public names and error strings must be stable enough for Step 2 to keep `toolFailuresByCode: Record<string, number>` without importing Step 3 types.

#### Step 4 - Tool Registry and Execution Backends

**Verification level**: Panel. **Evaluations**: 3. **Threshold**: 4.0/5.0 per panel result.

**Rubric**: each registered tool performs distinct shape and semantic validation before mutation (0.25), existing fill/match/write backends are wrapped rather than rewritten (0.25), matching fallback order and essay/editor fallback synchronization are preserved (0.30), backend failures map to specific `ExamToolResult` codes with retryability (0.20).

**Required artifacts**: `src/modules/exam/tool-registry.ts`, any `answer-fill.ts` backend adapter diff, and any diagnostics-only `answer-match.ts` diff.

**Local commands**: `pnpm run typecheck`; `pnpm run lint` if registry/backend code is added.

**Fixtures**: F1 valid mapping, F2 invalid input, F5 matching unresolved, F6 blank mismatch.

**Pass/fail criteria**: Pass if invalid choice/blank/matching inputs fail before DOM mutation and all answer tools default to non-concurrency-safe. Fail if `answer-match.ts` fallback order changes, `answer-write.ts` editor synchronization behavior changes, or tools silently skip semantic errors.

#### Step 5 - Tool Executor With Serial DOM Execution and Stats Ownership

**Verification level**: Panel. **Evaluations**: 3. **Threshold**: 4.0/5.0 per panel result.

**Rubric**: executor lifecycle follows lookup -> shape guard -> semantic validation -> execute -> typed result (0.25), mutating DOM tools execute serially in stable question order (0.25), tool stats are updated exactly once by `tool-executor.ts` (0.25), cancellation and independent failure isolation are explicit (0.25).

**Required artifacts**: `src/modules/exam/tool-executor.ts`, registry lookup integration, stats update logic, cancellation checks, and result collection.

**Local commands**: `pnpm run typecheck`; `pnpm run lint`; static no Node-only API check.

**Fixtures**: F1 for successful execution ordering; F3 for `unknown_tool`; F4 for adapter-owned parse failure not being counted as executor success; F6 for no unsafe partial blank mutation.

**Pass/fail criteria**: Pass if provider inference concurrency remains separate from serial DOM writes and one failed tool does not cancel independent later tools. Fail if stats are mutated in multiple owners or DOM writes can run concurrently by default.

#### Step 6 - Legacy `AIResponse` to Tool-Use Bridge

**Verification level**: Single. **Evaluations**: 1. **Threshold**: 4.0/5.0.

**Rubric**: all legacy `AnswerValue` shapes map to the correct provider-visible tools (0.30), local `Question.index` binding ignores model-returned indexes (0.25), sub-question indexes using `SUB_INDEX_MULTIPLIER` are preserved as integer keys (0.25), unsupported/unknown legacy cases become typed failures or existing essay fallback behavior (0.20).

**Required artifacts**: `src/modules/exam/provider-tool-adapter.ts` legacy bridge and any necessary `ai-provider.ts` compatibility export.

**Local commands**: `pnpm run typecheck`.

**Fixtures**: F1 sub-question index case and F8 legacy answer fallback.

**Pass/fail criteria**: Pass if current prompts can remain unchanged and legacy provider output executes through tools. Fail if `displayIndex` or model-returned `index` becomes an execution authority.

#### Step 7 - Orchestration Migration in Exam Panel With Rollback Boundary

**Verification level**: Panel. **Evaluations**: 3. **Threshold**: 4.0/5.0 per panel result.

**Rubric**: `startAutoExam()` inserts adapter + executor without changing extraction/provider call order (0.25), rollback to direct `fillAnswers()` remains callable and non-persistent (0.25), existing counters and status summaries remain comparable (0.25), partial/cancelled runs do not claim full success or double-count failures (0.25).

**Required artifacts**: `src/modules/exam/exam-panel.ts` orchestration diff, rollback branch/switch, and result-to-stats/status mapping.

**Local commands**: `pnpm run typecheck`; `pnpm run lint`; `pnpm run build`.

**Fixtures**: F1 success path, F4 parse failure path, F8 legacy fallback path.

**Pass/fail criteria**: Pass if the primary user flow still extracts questions, calls AI, fills answers, and prints familiar stats with categorized tool diagnostics appended. Fail if a new persisted config setting is required or rollback is removed before Step 11.

#### Step 8 - Provider JSON-Envelope Prompt and Parser Fallback

**Verification level**: Per-Item. **Evaluations**: 9 fixture evaluations. **Threshold**: 4.0/5.0 for every fixture; no fixture may be skipped.

**Rubric for each fixture**: parser accepts or rejects the payload according to the expected classification (0.35), normalized tool uses preserve local question binding and retryability/error code semantics (0.25), legacy fallback and JSON-envelope fallback remain both available (0.20), provider HTTP transport, image payload construction, and `p-limit` concurrency are unchanged (0.20).

**Required artifacts**: `src/modules/exam/ai-provider.ts`, `src/modules/exam/provider-tool-adapter.ts`, optional `src/modules/exam/tool-prompt.ts`, and concrete fixture files or inline fixture review records for F1-F9.

**Local commands**: `pnpm run typecheck`; `pnpm run lint`; `pnpm run build`; static no Node-only API check.

**Fixtures**: F1 through F9.

**Pass/fail criteria**: Pass if all fixtures classify exactly as expected and malformed output cannot throw uncaught errors. Fail if native tool calling becomes required, legacy `{ "answer": ... }` fallback is removed, image-question handling bypasses the existing image pipeline, or one malformed provider response discards independent successful question results.

**Dependency ambiguity check**: Step 8A prompt contracts may be drafted after Step 3 names stabilize, but Step 8 cannot pass until Step 7 proves the adapter/executor orchestration shape. Step 8C parser implementation must precede Step 8D provider prompt integration because provider prompts must not prefer an envelope the parser cannot classify.

#### Step 9 - Optional Native Tool-Call Normalization

**Verification level**: Single if implemented; treated as deferred if omitted. **Evaluations**: 1 optional. **Threshold**: 4.0/5.0.

**Rubric**: JSON-envelope fallback remains active and first-class (0.35), native outputs normalize into the same `ExamToolUse[]` and executor path (0.25), no SDK/runtime dependency/new grant/provider config field is introduced (0.25), provider/model limitations are documented without blocking existing providers (0.15).

**Required artifacts**: provider schema projection helpers or adapter diff, only if Step 9 is executed.

**Local commands**: `pnpm run typecheck`; `pnpm run lint`; `pnpm run build`; static no Node-only API check.

**Fixtures**: F1-equivalent native payload normalization plus F3 unknown native tool if implemented.

**Pass/fail criteria**: Pass if native tool calls are an enhancement. Fail if Step 9 makes auto-answering depend on native tool APIs, official SDKs, Node-only APIs, new storage fields, or new UserScript grants.

#### Step 10 - Observability, Status Output, and Compatibility Cleanup

**Verification level**: Single. **Evaluations**: 1. **Threshold**: 4.0/5.0.

**Rubric**: existing exam stats print first and remain readable (0.25), categorized tool/provider failures are compact and keyed by code plus display context (0.30), no persistent tool-run state or new user setting is introduced (0.20), final panel integration respects Step 10B dependency boundaries (0.25).

**Required artifacts**: `src/modules/exam/exam-panel.ts` status/output diff and optional `tool-executor.ts` formatting helper diff.

**Local commands**: `pnpm run typecheck`; `pnpm run lint`.

**Fixtures**: F3 unknown tool, F4 provider parse failure, F5 matching failure, F6 blank mismatch for output classification review.

**Pass/fail criteria**: Pass if maintainers can distinguish provider request, provider parse, validation, unsupported type, matching/blank, and DOM write failures without overwhelming the panel. Fail if status output replaces familiar user-facing counts with internal traces.

**Dependency ambiguity check**: Step 10A formatting helpers may be drafted after Step 5 if they avoid `exam-panel.ts`. Step 10B final panel integration must wait for Step 7, and if Step 8 is implemented it must use Step 8C/8D final provider failure codes rather than inventing duplicate labels.

#### Step 11 - Verification Pass and Regression Checklist

**Verification level**: Panel. **Evaluations**: 3. **Threshold**: 4.0/5.0 per panel result plus all hard gates pass.

**Rubric**: command gates pass or blockers are documented with rollback retained (0.25), static browser/Tampermonkey compatibility has no Node-only APIs, SDKs, schema dependencies, grants, or connect changes unless explicitly approved (0.25), regression checklist covers matching fallback order, blank/editor sync, essay fallback sync, image questions, degraded image stats, sub-question indexes, provider fallbacks, and JSON-envelope parsing (0.35), rollback removal/retention decision is justified by evidence (0.15).

**Required artifacts**: command outputs or blocker notes, static API scan result, fixture review results for F1-F9, regression checklist, and rollback removal/retention note.

**Local commands**: `pnpm run typecheck`; `pnpm run lint`; `pnpm run build`; static no Node-only API check.

**Fixtures**: F1 through F9.

**Pass/fail criteria**: Pass if required commands and all critical regressions pass. Fail, or retain rollback code, if any fixture classification fails, if any command cannot run, if matching/editor/image/sub-question behavior is uncertain, or if accidental Node-only/runtime dependency changes are found.

## Verification Summary

| Step | Verification Level | Evaluations | Threshold | Required Artifacts | Local Commands | Fixtures / Regression Focus | Pass/Fail Gate |
|---|---|---:|---:|---|---|---|---|
| 1 | Single | 1 | 4.0 | Baseline inventory and rollback checklist | None | Matching/editor/image/sub-question boundaries identified | No source changes; rollback boundary named |
| 2 | Single | 1 | 4.0 | Stats fields and backend result seam | `pnpm run typecheck` | Stats preservation; Step 2/3 import-cycle ambiguity | `fillAnswers()` remains callable; shared stats do not import tool errors |
| 3 | Panel | 3 | 4.0 | `tool-contract.ts` and provider descriptions | `pnpm run typecheck`; static API scan | F1-F3 shape review; no DOM leakage | Five tool names or documented consolidation guard; no schema/runtime dependency |
| 4 | Panel | 3 | 4.0 | Registry and backend adapters | `pnpm run typecheck`; `pnpm run lint` | F1, F2, F5, F6; matching fallback and editor sync | Invalid inputs fail before mutation; fallback order unchanged |
| 5 | Panel | 3 | 4.0 | `tool-executor.ts` and stats owner | `pnpm run typecheck`; `pnpm run lint`; static API scan | F1, F3, F4, F6; serial DOM writes | No concurrent DOM mutation; stats updated once per tool use |
| 6 | Single | 1 | 4.0 | `provider-tool-adapter.ts` legacy bridge | `pnpm run typecheck` | F1 sub-index; F8 legacy answer fallback | Local `Question.index` is execution authority |
| 7 | Panel | 3 | 4.0 | `exam-panel.ts` orchestration and rollback branch | `pnpm run typecheck`; `pnpm run lint`; `pnpm run build` | F1, F4, F8; user flow and counters | Adapter + executor path works; rollback retained until Step 11 |
| 8 | Per-Item | 9 | 4.0 | Provider prompt/parser diff and F1-F9 review records | `pnpm run typecheck`; `pnpm run lint`; `pnpm run build`; static API scan | F1-F9; JSON-envelope fallback, malformed JSON, image questions | Every fixture classifies as expected; legacy fallback remains |
| 9 | Single (optional) | 1 optional | 4.0 | Native normalization diff if implemented | `pnpm run typecheck`; `pnpm run lint`; `pnpm run build`; static API scan | Native equivalent of F1/F3 | Optional only; JSON envelope cannot depend on native tools |
| 10 | Single | 1 | 4.0 | Status/output diff and optional formatting helpers | `pnpm run typecheck`; `pnpm run lint` | F3-F6 output classification; Step 10B dependency | Existing stats remain first; no persisted tool-run state |
| 11 | Panel | 3 | 4.0 | Command outputs, static scan, fixture results, regression checklist, rollback decision | `pnpm run typecheck`; `pnpm run lint`; `pnpm run build`; static API scan | F1-F9; matching, blank/editor, image, sub-question, provider fallback regressions | Commands and regressions pass, or rollback code is retained |

### Verification Counts

| Metric | Count |
|---|---:|
| Implementation steps with verification | 11 |
| Panel steps | 5 |
| Single steps | 5 |
| Per-Item steps | 1 |
| None steps | 0 |
| Required evaluations excluding optional Step 9 | 28 |
| Total evaluations if Step 9 is implemented | 29 |
| Concrete fixtures / inline cases | 9 |

### Rollback Removal Rule

The legacy direct `AIResponse -> fillAnswers()` rollback path may be removed or disabled only after Steps 7, 8, and 11 pass their rubrics, all local command gates pass, all F1-F9 fixture classifications match expected outcomes, and regression review confirms matching fallback order, editor fallback sync, image-question handling, sub-question index binding, and JSON-envelope fallback parsing are preserved. If any condition is not met, keep rollback code and document the blocker.

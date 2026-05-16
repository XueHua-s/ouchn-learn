# Codebase Impact Analysis: AI Exam Tool Architecture Refactor

Task: `.specs/tasks/draft/ai-exam-tool-architecture-refactor.feature.md`

## Current Architecture

The AI exam flow is a linear answer-JSON pipeline:

1. `src/index.ts:initAutoExam()` initializes exam features on every page load; `isExamPage()` suppresses the resource panel on exam pages.
2. `src/modules/exam/exam-panel.ts:startAutoExam()` orchestrates the run: wait for question DOM, extract `Question[]`, call the model, fill returned answers, and print `ExamStats`.
3. `src/modules/exam/ai-provider.ts:callProvider()` calls OpenAI or Claude once per question with `p-limit`, returns `AIResponse` with `{ index, answer }` entries.
4. `src/modules/exam/answer-fill.ts:fillAnswers()` converts `AIResponse` to a `Map<Question.index, AnswerValue>` and delegates to type-specific DOM fill functions.
5. `src/modules/exam/answer-write.ts` provides the low-level DOM write primitives and AngularJS synchronization.
6. `src/modules/exam/answer-match.ts` handles matching-question answer parsing and seven fallback write strategies.

The main refactor surface is the boundary between model output and DOM execution. Today the model returns raw `AnswerValue` JSON and local code infers the desired operation from `Question.type`; a toolized refactor should make the model emit a controlled tool intent and let a local tool layer validate, map, execute, classify errors, and update stats.

## Files to MODIFY

| Path | Change Type | Functions / Types | Impact |
|------|-------------|-------------------|--------|
| `src/types/exam.ts` | Type contract expansion | `AIResponse`, `ExamStats`, new `ExamToolCall`, `ExamToolResult`, `ExamToolErrorCode`, `ToolAnswerInput` | Add the stable tool protocol and categorized errors while preserving current `Question`, `AnswerValue`, and existing stats fields for compatibility. |
| `src/modules/exam/ai-provider.ts` | Provider output adaptation | `buildSystemPrompt()`, `buildSingleQuestionPrompt()`, `parseSingleAnswer()`, `callSingleQuestion()`, `callProvider()` | Replace answer-only prompt/parser with tool-intent prompt/parser; keep `requestJson()`, `callOpenAI()`, `callClaude()`, image handling, and per-question concurrency. |
| `src/modules/exam/answer-fill.ts` | Execution backend extraction | `fillAnswers()`, `fillAnswerForQuestion()`, `fillChoiceQuestion()`, `fillMultipleChoiceQuestion()`, `fillBlankQuestion()`, `fillEssayQuestion()` | Keep existing behavior but expose a per-question execution entry usable by the tool executor; add validation/diagnostic return types instead of only boolean where needed. |
| `src/modules/exam/answer-match.ts` | Matching diagnostics | `parseMatchingAnswer()`, `fillMatchingQuestion()` | Preserve parser and fallback order; optionally return classified failure details such as `matching_pair_unresolved` instead of collapsing all failures into `false`. |
| `src/modules/exam/exam-panel.ts` | Orchestration update | `startAutoExam()`, `printExamStats()`, `showStatus()` | Insert tool execution between provider response and DOM fill; display categorized tool failures and retain existing success/failure summary. |
| `src/utils/storage.ts` | Low-risk config compatibility only if needed | `normalizeExamConfig()`, `getExamConfig()`, `saveExamConfig()` | No tool runtime state should be persisted initially. Only touch if adding a user-visible tool mode flag; otherwise leave unchanged. |
| `src/constants/index.ts` | Optional defaults only | provider defaults | No direct change expected unless a feature flag or default tool mode is introduced; avoid config churn. |

## Files to CREATE

| Path | Purpose | Notes |
|------|---------|-------|
| `src/modules/exam/tool-contract.ts` | Central tool protocol types and validators | Owns tool names, input shape validation, result/error taxonomy, and model-facing tool descriptions. Keeps format knowledge out of provider and filler modules. |
| `src/modules/exam/tool-registry.ts` | Browser-safe tool registry | Registers supported tools with stable names, input validators, mutating/concurrency metadata, and execute functions. Should stay small; avoid one shallow module per question type. |
| `src/modules/exam/tool-executor.ts` | Tool execution pipeline | Resolves `questionIndex`, enforces sequential DOM writes for mutating tools, calls existing fill backends, classifies failures, updates stats. |
| `src/modules/exam/provider-tool-adapter.ts` | Provider-neutral tool output parsing | Converts native tool calls or JSON tool envelopes into `ExamToolCall[]`; preserves fallback for providers/models without native tool calling. |

Optional if module size grows:

| Path | Purpose |
|------|---------|
| `src/modules/exam/tool-prompt.ts` | Move tool-specific prompt/tool schema construction out of `ai-provider.ts`. |
| `src/modules/exam/exam-runner.ts` | Move `startAutoExam()` workflow out of UI panel if orchestration becomes too large. |

## Files to DELETE

None. Existing modules contain live-page compatibility logic and should be reused, not replaced.

## Existing Interfaces and Invariants

### Question Identity

- `src/types/exam.ts:Question.index` is the only internal key used by `fillAnswers()` and stats arrays.
- `Question.displayIndex` is human/model-facing only.
- `src/modules/exam/question-extract.ts:buildSubQuestionIndex()` encodes sub-questions as `parentIndex * SUB_INDEX_MULTIPLIER + subIndex`.
- `src/modules/exam/ai-provider.ts:parseSingleAnswer()` currently ignores model-returned `index` and forces `expectedIndex`; tool calls must preserve this invariant by binding each per-question model response to the locally known `Question.index`.

### Extraction and Detection

- `waitForQuestionsStable()` waits for `.subject` count stability before extraction.
- `extractQuestions()` expands `.subject.analysis` into `.sub-subject` entries and truncates parent reading material to control token cost.
- `findQuestionElement()` is the authoritative lookup for top-level and nested question DOM.
- `detectQuestionType()` preserves unknown types instead of dropping them; unknown currently falls back to essay filling.

### Image Handling

- `extractQuestionImages()` gathers visible `img` and background images.
- `sanitizeImageDataUri()` only allows real JPEG/PNG by magic bytes.
- `resolveImageBase64()` degrades through canvas recoding and question screenshot; invalid images become text-only/degraded stats.
- Toolization must not bypass this pipeline or send unsanitized image data to providers.

### DOM Writing

- `answer-write.ts:writeWithVerify()` intentionally returns `true` after fallback direct write even when read-back is unreliable; do not make it strict without real-page validation.
- `fillEssayQuestion()` writes the primary editor and awaits fallback editor synchronization to hidden textarea / parallel Simditor instances.
- `answer-fill.ts` excludes subject-description editors via `isInsideSubjectDescription()`; tools must not reimplement raw selector logic.
- `selectors.ts` is the shared owner for exam DOM selectors; new modules should import selectors or existing helper functions instead of duplicating strings.

### Matching Questions

- `parseMatchingAnswer()` accepts object, array, JSON string, and textual arrow/colon formats.
- `fillMatchingQuestion()` tries OUCHN Angular model, generic Angular scope, standard drag/drop, human-like mouse drag, cloneable drag, click-to-match, and hidden inputs in order.
- This fallback stack is fragile but valuable; toolized matching should validate input before calling it, not rewrite it in the first iteration.

### Provider and Config

- `ExamConfig.provider` is currently `'openai' | 'claude'` with per-provider saved slots.
- `storage.ts:normalizeExamConfig()` mirrors the active provider slot into top-level `modelName`, `apiKey`, and `apiBaseUrl`.
- `ai-provider.ts:callOpenAI()` uses Chat Completions and handles reasoning models with `developer` role and no `temperature`.
- `ai-provider.ts:callClaude()` uses Messages API with browser direct-access header.
- `requestJson()` prefers `GM_xmlhttpRequest` and falls back to `fetch`; `tsup.config.ts` already grants `GM_xmlhttpRequest`, `unsafeWindow`, and `@connect *`.

## Integration Points

### Provider to Tool Adapter

Current: `callProvider(config, questions, stats, onProgress): Promise<AIResponse>`.

Recommended transitional shape:

```ts
callProvider(...): Promise<AIResponse | ExamToolResponse>
```

or better, keep `callProvider()` as the public provider entry but change its internal parser to return a compatibility `AIResponse` plus `toolCalls` until the executor owns all fills:

```ts
interface ExamToolResponse {
  toolCalls: ExamToolCall[];
  failures?: ProviderFailure[];
}
```

Native provider tool calling can be added later. The first implementation should support a JSON tool envelope because both OpenAI-compatible proxies and Claude browser calls can return plain text reliably.

### Tool Executor to Existing Fillers

The executor should resolve a tool call to a `Question` and call a single local fill backend. Preferred local API:

```ts
executeAnswerForQuestion(question: Question, answer: AnswerValue, context): Promise<ExamToolResult>
```

This can wrap current `fillAnswerForQuestion()` behavior while letting the tool layer validate:

- `question_not_found`
- `invalid_answer_shape`
- `unknown_option_label`
- `blank_count_mismatch`
- `matching_pair_unresolved`
- `dom_write_failed`
- `unsupported_question_type`

### Stats and UI

`ExamStats` currently counts extracted, returned, filled, skipped, failed, unknown, image, vision, and degraded image questions. Toolization should add categorized tool execution data without breaking existing summaries:

- `toolCallCount`
- `toolSucceededCount`
- `toolFailedQuestions`
- `toolFailuresByCode`

`exam-panel.ts:printExamStats()` and final status should continue showing the existing `filledCount`, `fillFailedQuestions`, and `skippedQuestions` counts so user-facing behavior does not regress.

### Storage

Do not persist tool calls or tool run state. If a setting is introduced, use `src/utils/storage.ts` and keep existing provider slot behavior. Avoid writing directly to `localStorage` outside storage utilities.

### Tampermonkey Runtime

No Node.js APIs, file system APIs, or SDK-only transports. Tool definitions must be plain TypeScript data/functions bundled into the IIFE. External requests remain through existing `requestJson()` and current `@connect *` unless the future implementation narrows it.

## Risk Assessment

Risk level: **Medium-High**.

### High Risk

1. **DOM mutation concurrency**
   - Model calls are concurrent, but DOM writes should remain sequential. A tool executor must mark answer tools as mutating and avoid parallel execution across visible page DOM unless proven safe.

2. **Question identity drift**
   - Native or envelope tool calls may include `displayIndex`, `index`, or both. The executor must bind per-question provider responses to local `Question.index` and not trust model-selected internal indices.

3. **Matching-question regressions**
   - `answer-match.ts` is 736 lines of platform-specific fallbacks. Replacing it during toolization would be high risk; the first pass should only validate and wrap it.

### Medium Risk

1. **Tool contract over-fragmentation**
   - One tool per question type would create many shallow interfaces. Prefer one deep `answer_question` tool with discriminated validation behind it, plus `skip_question`.

2. **Provider capability divergence**
   - OpenAI and Claude native tool schemas differ. JSON envelope fallback must remain first-class and covered by tests/review.

3. **Error taxonomy double counting**
   - Provider failures, validation failures, skipped questions, and DOM write failures can overlap. Define one owner for stats mutation, likely `tool-executor.ts`.

4. **Prompt/token cost**
   - Tool descriptions add prompt tokens to every per-question call. Keep tool schema compact and avoid embedding redundant selector/DOM details into prompts.

### Low Risk

1. **Panel field/config UI**
   - No new provider config is required for the first toolized design.

2. **UserScript metadata**
   - No new Tampermonkey grants are expected.

## Reuse Opportunities

### Keep As-Is

- `question-extract.ts:extractQuestions()`, `findQuestionElement()`, `waitForQuestionsStable()`.
- `question-detect.ts:detectQuestionType()`, `extractQuestionImages()`, `sanitizeImageDataUri()`, `resolveImageBase64()`.
- `answer-write.ts:fillEditable()`, `fillTextarea()`, `writeWithVerify()`, `waitForEditor()`, `triggerAngularUpdate()`.
- `selectors.ts` constants and `isInsideSubjectDescription()`.
- `storage.ts` provider slot normalization unless adding a deliberate user-facing setting.

### Adapt Behind a Tool Layer

- `ai-provider.ts:buildSystemPrompt()` and `buildSingleQuestionPrompt()` should describe available tools and expected envelope output.
- `ai-provider.ts:parseSingleAnswer()` should become or delegate to `parseToolEnvelope()` / `parseProviderToolOutput()`.
- `answer-fill.ts:fillAnswerForQuestion()` should become an exported backend that returns richer execution result metadata.
- `answer-match.ts:fillMatchingQuestion()` can remain boolean initially; later it can expose classified diagnostics.

## Suggested Tool Contract

Minimal first iteration:

```ts
type ExamToolName = 'answer_question' | 'skip_question';

interface ExamToolCall {
  id: string;
  name: ExamToolName;
  questionIndex: number;
  displayIndex: string;
  input: AnswerQuestionInput | SkipQuestionInput;
}

type AnswerQuestionInput =
  | { questionType: 'single_selection' | 'true_or_false'; answer: string }
  | { questionType: 'multiple_selection'; answer: string[] }
  | { questionType: 'fill_in_blank'; answer: string | string[] }
  | { questionType: 'short_answer' | 'unknown'; answer: string }
  | { questionType: 'matching'; answer: Record<string, string> | string[] | string };
```

The public tool schema should not expose DOM selectors, Angular internals, or implementation fallback names. Those remain hidden behind the executor.

## Verification Targets for Implementation Plan

1. `pnpm run typecheck`
2. `pnpm run lint`
3. `pnpm run build`
4. Static review that no new Node-only APIs (`fs`, `path`, `process`) are imported in `src/`.
5. Static review that new DOM selectors are centralized in `selectors.ts` or use existing helper functions.
6. Contract review that all required tool errors are represented: `question_not_found`, `invalid_answer_shape`, `unknown_option_label`, `blank_count_mismatch`, `matching_pair_unresolved`, `dom_write_failed`, `unsupported_question_type`.
7. Behavioral review that per-question provider concurrency remains `1..20`, while mutating DOM tools execute sequentially.
8. Regression review that sub-question index encoding, image degradation stats, matching fallback order, and essay fallback synchronization are unchanged.

## Summary

| Metric | Value |
|--------|-------|
| Existing exam files inspected | 8 |
| Additional integration files inspected | 5 |
| Files likely modified | 5 direct + 2 optional |
| Files likely created | 4 direct + 2 optional |
| Files likely deleted | 0 |
| Risk level | Medium-High |
| Primary integration points | `ai-provider.ts` parser/prompt, `answer-fill.ts` execution backend, `tool-executor.ts` stats/error owner, `exam-panel.ts` orchestration |

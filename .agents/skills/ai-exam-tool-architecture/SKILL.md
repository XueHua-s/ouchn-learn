---
name: ai-exam-tool-architecture
description: Design or review the OUCHN AI exam answer-tool architecture. Use when planning provider tool calling, tool-envelope fallback, DOM answer execution tools, error feedback, or refactoring AIResponse-driven answer filling into browser-safe tool execution.
---

# AI Exam Tool Architecture Skill

Use this skill when working on the OUCHN AI automatic exam-answering architecture, especially when converting provider output into controlled tools that execute DOM writes in a Tampermonkey userscript.

## Core Rule

Adopt the reference project's tool lifecycle, not its runtime stack. The browser userscript should have a small, deep tool layer:

```text
provider tool intent -> registry lookup -> input validation -> semantic validation -> serial DOM execution -> typed result/error -> stats and feedback
```

Do not port Node.js APIs, React/TUI rendering, MCP, filesystem state caches, permission dialogs, or heavy telemetry. The target runtime is browser + Tampermonkey IIFE.

## Design Principles

- Tools must hide DOM and OUCHN compatibility details from providers.
- Tool names are stable provider-visible contracts.
- Default DOM-writing tools to non-concurrency-safe.
- Validate model input shape before semantic/page validation.
- Return typed results and typed errors; do not collapse failures into generic `false`.
- Preserve current business behavior by wrapping existing fill/match/write logic first.
- Avoid shallow tools. A tool should own meaningful validation, execution, and result mapping.
- Keep provider inference concurrency separate from DOM execution concurrency.

## Browser-Safe Tool Shape

Use a compact local interface. Avoid adding a schema library unless the implementation task explicitly accepts the dependency.

```ts
type ExamToolResult =
  | { ok: true; tool: string; questionIndex: number; filledCount?: number; detail?: string }
  | { ok: false; tool: string; questionIndex?: number; code: ExamToolErrorCode; message: string; retryable: boolean };

type ExamTool<Input> = {
  name: string;
  description: string;
  inputSchema: (input: unknown) => input is Input;
  validateInput?: (input: Input, context: ExamToolContext) => ExamToolResult | null;
  isConcurrencySafe?: (input: Input) => boolean;
  isReadOnly?: (input: Input) => boolean;
  execute: (input: Input, context: ExamToolContext) => Promise<ExamToolResult>;
};
```

Add a `buildExamTool` helper with defaults:

- `isConcurrencySafe`: `false`
- `isReadOnly`: `false`
- `validateInput`: no extra semantic error

## Recommended Tools

Start with the smallest tool set that creates a real boundary:

- `answer_choice`: single selection and true/false.
- `answer_multiple_choice`: multiple selection.
- `answer_blank`: fill-in-blank.
- `answer_essay`: short answer and unknown fallback.
- `answer_matching`: matching/pairing questions.

If these would only delegate without owning validation, prefer one deeper `answer_question` tool first and split later.

## Error Codes

Use typed error codes that can drive stats, retry, and debugging:

- `unknown_tool`
- `invalid_tool_input`
- `question_not_found`
- `invalid_answer_shape`
- `unknown_option_label`
- `blank_count_mismatch`
- `matching_pair_unresolved`
- `dom_write_failed`
- `unsupported_question_type`
- `provider_parse_failed`
- `tool_execution_cancelled`

Each failure should include `retryable`. Provider-correctable input errors are retryable. Missing DOM/page-state failures usually are not retryable without re-extraction.

## Provider Migration

Do the migration incrementally:

1. Keep existing JSON answer prompts working.
2. Convert parsed `AIResponse` into internal `ExamToolUse[]` before DOM writing.
3. Add JSON tool-envelope fallback for models without native tool calling:

```json
{
  "toolUses": [
    { "tool": "answer_choice", "input": { "questionIndex": 1, "answer": "C" } }
  ]
}
```

4. Add native OpenAI/Claude tool mapping only after the internal executor contract is stable.
5. Preserve per-question provider concurrency; execute DOM-writing tools serially.

## Existing Code To Preserve

Before changing behavior, inspect and preserve these modules:

- `src/modules/exam/ai-provider.ts`: per-question provider calls, vision handling, internal-index trust.
- `src/modules/exam/answer-fill.ts`: answer filling, choice fallbacks, blank/editor logic, essay fallback sync.
- `src/modules/exam/answer-match.ts`: matching answer parsing and multi-stage DOM/Angular fallbacks.
- `src/modules/exam/answer-write.ts`: editor write and verification behavior.
- `src/modules/exam/question-extract.ts`: authoritative `Question` metadata and DOM lookup.
- `src/types/exam.ts`: `Question`, `AnswerValue`, `AIResponse`, `ExamStats`, integer sub-question index rules.

## Review Checklist

- Does the design reduce provider-to-DOM format leakage?
- Are DOM-writing tools serial by default?
- Are existing matching, blank, image, sub-question, and editor-sync protections preserved?
- Are tool errors specific enough for stats and retry?
- Is native tool calling optional, with JSON-envelope fallback?
- Does the implementation avoid Node.js-only APIs and new runtime dependencies unless explicitly accepted?
- Are tool abstractions deep enough to justify their module boundaries?

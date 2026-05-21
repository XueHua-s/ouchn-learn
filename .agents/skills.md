# Codex Skills Guide For ouchn-learn

Use this file when Codex CLI is working inside `ouchn-learn`. Do not load the entire `skills/` directory by default. Start with the smallest matching skill set.

## How To Use

- Skill entry points live at `skills/*/SKILL.md`
- Read the matching `SKILL.md` first, then load only the referenced `references/*` files you actually need
- 根据任务类型在 Skill Routing 中选择合适的技能

## Skill Routing

- `skills/software-design-philosophy/SKILL.md`
  Use for module decomposition, module boundaries, interface cleanup, and complexity reduction.
- `skills/code-review-expert/SKILL.md`
  Use for reviewing the current diff and prioritizing bugs, regressions, and missing tests.
- `skills/frontend-design/SKILL.md`
  Use for panel UI, interaction design, and visual quality work.
- `skills/product-designer/SKILL.md`
  Use for product design, user journey maps, information architecture, usability testing, and design system planning.
- `skills/vercel-react-best-practices/SKILL.md`
  Use for React/Next.js performance optimization, bundle size reduction, eliminating data-fetching waterfalls, and re-render optimization when relevant React/Next.js code exists or the task explicitly asks for it.
- `skills/zustand/SKILL.md`
  Use for Zustand store code, action layering, slice organization, and state management patterns when relevant Zustand code exists or the task explicitly asks for it.
- `skills/sdd-plan/SKILL.md`
  Use for SDD (Specification Driven Development) task refinement. Drives a 6-phase multi-agent workflow (Parallel Analysis → Architecture Synthesis → Decomposition → Parallelize → Verify → Promote) that turns a `.specs/tasks/draft/*.md` file into a fully planned task in `.specs/tasks/todo/`. Pair with `skills/sdd-plan/analyse-business-requirements.md` for the business-analysis stage.

## SDD Auto-Load Triggers (mandatory)

Auto-load `skills/sdd-plan/SKILL.md` (and its sibling `analyse-business-requirements.md`) **without further confirmation** when the user's request matches any of:

- Explicit keywords: `sdd`, `SDD`, `sdd:plan`, `/sdd:plan`, `spec-driven`, `specification driven`, `规格驱动`, `spec kit`, `OpenSpec`
- Implicit intent: "refine / promote a draft task", "multi-phase plan with quality gates", "LLM-as-Judge review", "走 SDD 流程", "把 draft 推进到 todo"
- Workspace contains `.specs/tasks/draft/*.md` and the user asks to move it forward / split / verify

When triggered, follow the 6 phases in order, keep judge gates unless the user passes `--fast` / `--one-shot`, and respect every local rule in `AGENTS.md` (pnpm, TypeScript, IIFE, Tampermonkey sandbox, no Node.js-only APIs).

## Local Conventions To Reuse

- Use `src/utils/storage.ts` for persistence (wraps GM_setValue/GM_getValue)
- Use `src/utils/dom.ts` for DOM manipulation helpers
- Use `src/utils/helper.ts` for common utility functions
- Use `src/constants/index.ts` for shared constants
- Use `src/types/index.ts` for type definitions
- Tampermonkey APIs require `@grant` declarations in `tsup.config.ts`

## Guardrails

- Do not introduce a new library or pattern before checking the relevant skill and existing local utilities.
- Do not bulk-load every file under `references/`; open only what the current task needs.
- If a skill and the current codebase differ, trust the live code structure first and adapt minimally.
- This is a browser userscript — never use Node.js-only APIs (`fs`, `path`, `process`, etc.).

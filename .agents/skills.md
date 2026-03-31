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

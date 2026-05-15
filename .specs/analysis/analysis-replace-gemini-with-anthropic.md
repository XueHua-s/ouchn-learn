# Codebase Impact Analysis: Replace Gemini with Anthropic

## Files to MODIFY

| Path | Lines | Change Type | Notes |
|------|-------|-------------|-------|
| `src/types/exam.ts` | 15 | type union | `'gemini'` → `'anthropic'` in `ExamConfig.provider` |
| `src/modules/exam/ai-provider.ts` | 91-106, 147-172, 167, 269, 271-274 | function delete + branch replace | Remove `buildGeminiVisionParts()` and `callGemini()`, add Anthropic equivalents; update dispatcher condition |
| `src/modules/exam/exam-panel.ts` | 143, 193, 214, 217-218, 222-223, 227-228, 265-267 | UI + type cast + defaults | Replace Gemini tab/fields with Anthropic; update field IDs, placeholders, default values |

## Files to CREATE

None (new functions added to existing files)

## Files to DELETE

None (only functions removed, files retained)

## Interface Changes

### ExamConfig.provider Type Union
```typescript
// Before
provider: 'openai' | 'gemini';

// After
provider: 'openai' | 'anthropic';
```

### New Function: buildAnthropicVisionContent()
```typescript
function buildAnthropicVisionContent(
  textContent: string,
  imageBase64List: string[],
): Array<{ 
  type: 'text' | 'image'; 
  text?: string; 
  source?: { type: 'base64'; media_type: string; data: string } 
}>
```

**Behavior**:
- Pushes text content as `{ type: 'text', text: textContent }`
- For each base64 image:
  - Sanitizes via `sanitizeImageDataUri(b64)`
  - Extracts MIME type from data URI prefix
  - Strips `data:...;base64,` to get raw base64 data
  - Pushes `{ type: 'image', source: { type: 'base64', media_type: '...', data: '...' } }`

### New Function: callAnthropic()
```typescript
async function callAnthropic(
  config: ExamConfig,
  systemPrompt: string,
  userContent: string | Array<{ 
    type: 'text' | 'image'; 
    text?: string; 
    source?: { type: 'base64'; media_type: string; data: string } 
  }>,
): Promise<string>
```

**Behavior**:
1. POST to `${config.apiBaseUrl.replace(/\/+$/,'')}/v1/messages`
2. Headers:
   - `x-api-key: ${config.apiKey}` （**不是** `Authorization: Bearer`；Anthropic 用专用头）
   - `anthropic-version: 2023-06-01`
   - `anthropic-dangerous-direct-browser-access: true` （浏览器直连 `api.anthropic.com` 必需；反代下无害；默认始终携带）
   - `content-type: application/json`
3. Request body:
   ```json
   {
     "model": "config.modelName",
     "max_tokens": 2048,
     "system": "systemPrompt",
     "messages": [{ "role": "user", "content": "userContent" }],
     "temperature": 0.3
   }
   ```
   - `system` 在**顶层**字段而非 `messages[0]`（与 OpenAI 不同）
   - **不要**复用 OpenAI 路径的 `REASONING_MODEL_RE` / `developer` role / 跳过 temperature —— 那是 OpenAI 推理模型专属
4. Response parsing: `data.content?.[0]?.text || ''` （取第一个 text block）
5. Error: `throw new Error(\`Anthropic ${response.status}: ${errorText.substring(0, 200)}\`)`

## Integration Points

### 1. Type System (src/types/exam.ts:15)
- **Impact**: All code referencing `ExamConfig.provider` must accept new union type
- **Files affected**: exam-panel.ts (type cast), ai-provider.ts (dispatcher condition)
- **Mitigation**: TypeScript compiler will catch type errors

### 2. API Dispatcher (src/modules/exam/ai-provider.ts:262-278)
- **Current**: `if (config.provider === 'openai') { ... } else if (config.provider === 'gemini') { ... }`
- **New**: `if (config.provider === 'openai') { ... } else if (config.provider === 'anthropic') { ... }`
- **Vision handling**: Swap `buildGeminiVisionParts()` → `buildAnthropicVisionContent()`
- **API call**: Swap `callGemini()` → `callAnthropic()`

### 3. Storage Defaults (src/utils/storage.ts:132-151)
- **Current behavior**: `getExamConfig()` defaults to `provider: 'openai'` if missing
- **Old user data**: Existing localStorage entries with `provider: 'gemini'` will load as-is
- **Recommendation**: Add **slot-preserving migration** in `getExamConfig()` —— 老 `'gemini'` 沿用第二槽位身份平移为 `'anthropic'`（不是降级回 OpenAI）：
  ```typescript
  if (raw?.provider === 'gemini') {
    return {
      provider: 'anthropic',
      modelName: 'claude-sonnet-4-5',
      apiKey: '',                              // 协议形态不同，必须重填
      apiBaseUrl: 'https://aigw.c5y.moe',
      customPrompt: typeof raw.customPrompt === 'string' ? raw.customPrompt : '',
      concurrency: Number.isFinite(raw.concurrency) && raw.concurrency >= 1 ? raw.concurrency : 3,
    };
  }
  ```
- **Do NOT** call `localStorage.setItem` here — 读一次不写回，下一次用户主动保存才落盘
- **Alternative considered**: 降级回 OpenAI 默认 / 改名后保留 apiKey —— 均不推荐：前者违背"第二槽位整体替换"语义；后者会把 Google Key 当 Anthropic Key 发出

### 4. UI Panel (src/modules/exam/exam-panel.ts:177-304)
- **Tab button** (line 193): `data-provider="gemini"` → `data-provider="anthropic"`, label "Gemini" → "Anthropic"
- **Config container** (line 214): `data-provider="gemini"` → `data-provider="anthropic"`
- **Field IDs** (lines 217, 222, 227):
  - `ai-model-name-gemini` → `ai-model-name-anthropic`
  - `ai-api-key-gemini` → `ai-api-key-anthropic`
  - `ai-base-url-gemini` → `ai-base-url-anthropic`
- **Placeholders**:
  - Model: `"gemini-pro"` → `"claude-sonnet-4-5"`
  - API Key: `"AIza..."` → `"sk-ant-..."`（**严禁**用真实测试 sk）
  - Base URL: `"https://generativelanguage.googleapis.com/v1beta"` → `"https://aigw.c5y.moe"`
- **Default values** (lines 218, 223, 228): Update condition from `'gemini'` to `'anthropic'`
- **Tab init** (lines 265-267): If stored `provider === 'anthropic'`, trigger Anthropic tab click

## Storage Migration

### Scenario 1: No Migration Code (Permissive)
- Old users with `provider: 'gemini'` in localStorage load successfully
- UI shows Anthropic tab by default (Gemini tab removed)
- If user tries to submit with old `provider: 'gemini'`, dispatcher throws "不支持的 provider: gemini"
- User must manually select Anthropic or OpenAI from UI
- **Pro**: Minimal code change
- **Con**: Users see error on first attempt

### Scenario 2: Slot-Preserving Migration (Recommended)
- 老 `'gemini'` 沿用"第二槽位"身份平移为 `'anthropic'`：
  ```typescript
  if (raw?.provider === 'gemini') {
    return {
      provider: 'anthropic',
      modelName: 'claude-sonnet-4-5',
      apiKey: '',
      apiBaseUrl: 'https://aigw.c5y.moe',
      customPrompt: typeof raw.customPrompt === 'string' ? raw.customPrompt : '',
      concurrency: Number.isFinite(raw.concurrency) && raw.concurrency >= 1 ? raw.concurrency : 3,
    };
  }
  ```
- Old Gemini users 在第二槽位无缝看到 Anthropic Tab；apiKey/apiBaseUrl 清空（协议不同必须重填）；customPrompt/concurrency 等 provider-agnostic 字段保留
- **不写回 storage** —— 读一次不持久化，用户下次主动保存才落盘
- **Pro**: 与"第二槽位整体替换"语义一致；用户体验最平滑；零误投递风险
- **Con**: 用户仍需重新输入 Anthropic 凭据（无法避免，Google Key 不可直接当 Anthropic Key）

**Recommendation**: Use Scenario 2 (slot-preserving migration).

## Risk Assessment

### High Risk
1. **Type Union Change** (exam.ts:15)
   - **Issue**: Removing `'gemini'` from union breaks TypeScript if any code uses literal `'gemini'`
   - **Mitigation**: TypeScript compiler catches at build time; grep confirms no stray literals
   - **Action**: Run `pnpm run typecheck` before merge

2. **Dispatcher Condition** (ai-provider.ts:269)
   - **Issue**: Old users with `provider: 'gemini'` hit `else` clause and get error
   - **Mitigation**: Implement slot-preserving migration (Scenario 2) to平移到 anthropic 槽位
   - **Action**: Add migration logic to `getExamConfig()`

### Medium Risk
1. **Vision Content Format** (Anthropic vs Gemini)
   - **Issue**: Anthropic uses `{ type: 'image', source: { type: 'base64', media_type, data } }` vs Gemini's `{ inlineData: { mimeType, data } }`
   - **Mitigation**: Test with sample images before deploy; verify MIME type extraction
   - **Action**: Manual test with image-containing questions

2. **API Endpoint & Auth** (Anthropic vs Gemini)
   - **Issue**: Different base URL, auth header, response structure
   - **Mitigation**: Verify baseURL (`https://api.anthropic.com` or reverse proxy) and header format
   - **Action**: Test curl request with real API key before deploy

### Low Risk
1. **UI Tab/Field IDs**: String replacements only, no logic impact
2. **Placeholder Text**: Cosmetic only, no functional impact
3. **Default Values**: Only affect new users or those who reset config

## Reuse Opportunities

### Keep As-Is
- ✅ `sanitizeImageDataUri()` (question-detect.ts) - works for all providers
- ✅ `buildSystemPrompt()` - provider-agnostic
- ✅ `buildSingleQuestionPrompt()` - provider-agnostic
- ✅ `parseSingleAnswer()` - provider-agnostic
- ✅ `callSingleQuestion()` dispatcher structure - just swap condition
- ✅ `callProvider()` - no change needed
- ✅ Error message truncation pattern (`.substring(0, 200)`)

### Adapt
- ⚠️ `buildOpenAIVisionContent()` - keep; add `buildAnthropicVisionContent()` alongside
- ⚠️ `callOpenAI()` - keep; replace `callGemini()` with `callAnthropic()`

## Verification Steps

1. **Type Safety**
   ```bash
   pnpm run typecheck
   # Should pass with no errors
   ```

2. **Linting**
   ```bash
   pnpm run lint
   # Should pass with no errors
   ```

3. **Grep Verification**
   ```bash
   grep -r 'gemini\|Gemini\|GEMINI' src/
   # Should return empty (no stray references)
   ```

4. **Build**
   ```bash
   pnpm run build
   # Should succeed, generate dist/index.js
   ```

5. **Manual Testing**
   - Load `dist/index.js` into Tampermonkey
   - Navigate to exam page
   - Verify panel renders with Anthropic tab (no Gemini tab)
   - Verify field placeholders match Anthropic format
   - Enter valid Anthropic API key and model name
   - Submit a question
   - Verify response is parsed correctly
   - Test error handling with invalid key (should show "Anthropic ..." error)

6. **Storage Migration Test**
   - Set localStorage `ai-exam-config` to `{"provider":"gemini","apiKey":"AIzaFOO","apiBaseUrl":"https://generativelanguage.googleapis.com/v1beta","customPrompt":"Hello","concurrency":5}`
   - Load page
   - Verify config auto-migrates to `provider: 'anthropic'`, apiKey '', apiBaseUrl 'https://aigw.c5y.moe', customPrompt 'Hello', concurrency 5
   - Verify UI shows Anthropic tab selected (沿用第二槽位)
   - Verify localStorage 内容未被改写（不写回）

## Summary

| Metric | Value |
|--------|-------|
| Files to modify | 3 |
| Files to create | 0 |
| Files to delete | 0 |
| Functions to delete | 2 |
| Functions to create | 2 |
| Type changes | 1 |
| UI elements to replace | 1 tab + 3 field groups |
| Conditional branches to update | 1 |
| Total lines affected | ~50 |
| Risk level | **Medium** (type change + storage migration) |
| Estimated effort | 2-3 hours (implementation + testing) |


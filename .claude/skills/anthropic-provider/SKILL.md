---
name: anthropic-provider
description: Anthropic Messages API client patterns for Tampermonkey userscripts (browser-side fetch, vision support, error mapping)
---

# Skill: anthropic-provider

## 使用场景

Tampermonkey / 浏览器侧脚本里需要直连或经反代调用 Anthropic Messages API 的场合。代码不应硬编码 baseURL —— 由用户在 UI 设置项里填写，代码只负责拼接 `/v1/messages` 路径并带必需 headers。

## API 协议速查

- **端点**: `POST {baseURL}/v1/messages`
- **必需 headers**:
  - `x-api-key: <sk-...>`
  - `anthropic-version: 2023-06-01`
  - `content-type: application/json`
  - `anthropic-dangerous-direct-browser-access: true` — 浏览器直连 `api.anthropic.com` 必需，反代无害；**默认始终携带**
- **请求体骨架**:
  ```json
  {
    "model": "claude-sonnet-4-5",
    "max_tokens": 2048,
    "system": "可选系统 prompt（顶层字段，不在 messages 数组内）",
    "messages": [
      { "role": "user", "content": "..." }
    ],
    "temperature": 0.3
  }
  ```
- **响应**:
  ```json
  {
    "id": "msg_...",
    "type": "message",
    "role": "assistant",
    "content": [{ "type": "text", "text": "..." }],
    "stop_reason": "end_turn",
    "usage": { "input_tokens": N, "output_tokens": M }
  }
  ```
  取 `data.content[0].text` 作为最终答复。
- **错误体**: `{ "type": "error", "error": { "type": "...", "message": "..." } }`，HTTP 状态码 400/401/429/500 等。

## 推荐模型

- `claude-opus-4-5` — 最强能力，价格最高
- `claude-sonnet-4-5` — **默认推荐**，速度/价格/能力平衡
- `claude-haiku-4-5` — 轻量低延迟

UI 默认值与文档示例都用 `claude-sonnet-4-5`。

## baseURL 处理

- 用户填的是 base（如 `https://aigw.c5y.moe` 或 `https://api.anthropic.com`），代码层统一拼接 `/v1/messages`
- 防御性去除末尾斜杠：
  ```js
  const url = `${baseURL.replace(/\/+$/, '')}/v1/messages`;
  ```
- placeholder 推荐 `https://aigw.c5y.moe`
- **不要在代码里 hardcode baseURL** —— 始终从用户配置读取

## CORS / 沙箱

- 现状：项目内 OpenAI Provider 使用原生 `fetch`，Anthropic Provider **保持一致用原生 fetch**
- Tampermonkey header 中 `@connect *` 已配置，无需改动
- 如遇浏览器拦截预检 / CORS 失败，回退方案：

  ```js
  function gmFetch({ url, headers, body }) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        headers,
        data: JSON.stringify(body),
        responseType: 'text',
        onload: r => resolve({ status: r.status, text: r.responseText }),
        onerror: e => reject(e),
        ontimeout: () => reject(new Error('timeout')),
      });
    });
  }
  ```

  仅当原生 fetch 报 CORS 时切到该路径。

## 错误处理与回退

- 与 OpenAI Provider 风格保持一致：

  ```js
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic ${response.status}: ${errorText.substring(0, 200)}`);
  }
  ```

- 上层调用方按现有 OpenAI 错误链路处理（toast / 日志），不需要为 Anthropic 单独写 UI。
- CORS 失败时的回退顺序：原生 `fetch` → `GM_xmlhttpRequest`。

## 视觉消息构造模板（伪代码）

```js
function buildAnthropicVisionContent(text, imageBase64List) {
  const parts = [{ type: 'text', text }];
  for (const b64 of imageBase64List) {
    const safeUri = sanitizeImageDataUri(b64);
    if (!safeUri) continue;
    const m = safeUri.match(/^data:(image\/[^;]+);base64,(.+)$/s);
    if (!m) continue;
    parts.push({
      type: 'image',
      source: { type: 'base64', media_type: m[1], data: m[2] },
    });
  }
  return parts;
}
```

注意：`source.data` 是**纯 base64**，不带 `data:image/...;base64,` 前缀。`media_type` 仅支持 `image/png | image/jpeg | image/gif | image/webp`。

## Curl 模板（脱敏）

```bash
curl -X POST "${BASE_URL}/v1/messages" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-dangerous-direct-browser-access: true" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":2048,"system":"...","messages":[{"role":"user","content":"hi"}],"temperature":0.3}'
```

## 不在本 skill 范围

- 流式 SSE 解析（未来如需开启：请求体 `stream: true`，解析 `content_block_delta` 事件）
- prompt caching 调优（未来如需开启：`messages[].content[].cache_control: { type: 'ephemeral' }`）
- 文件 / PDF 上传 API
- Tool use / function calling

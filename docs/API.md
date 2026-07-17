# AI API 实现说明

本文档记录 Banana Canvas 当前代码中的真实 AI 调用路径。实现依据为 `App.tsx`、`server/ai.mjs`、`.env.example` 和 `README.md`，不是通用的 Gemini/OpenAI API 教程。

## 1. 调用模式概览

前端提供三种 `apiProvider`：

| 模式 | 凭据位置 | 浏览器请求目标 | 实际上游实现 |
| --- | --- | --- | --- |
| `server`（默认） | 服务端 `.env` | 本站 `/api/ai/*` | 由 `AI_PROVIDER` 决定 Gemini SDK 或 OpenAI-compatible |
| `gemini-custom` | 浏览器 `localStorage` | Google GenAI SDK 直连 | `GoogleGenAI.models.generateContent()` |
| `openai-custom` | 浏览器 `localStorage` | 自定义 `Base URL` 直连 | `/chat/completions` 或 `/images/*` |

`server` 模式先请求 `GET /api/ai/config`。公开响应只包含：

```json
{
  "configured": true,
  "provider": "openai-compatible",
  "model": "gpt-image-2",
  "models": ["gpt-image-2", "gemini-3.1-flash-image"],
  "stream": false
}
```

`AI_API_KEY` 和 `AI_BASE_URL` 不会返回浏览器。服务端将 `AI_MODEL` 与 `AI_MODELS` 合并为模型白名单；请求中的 `model` 不在白名单时返回 `400`。因此，服务端模式下不能只靠前端填写任意模型名。

需要特别区分：`AI_PROVIDER` 决定协议实现，模型名不会改变服务端 provider。比如 `AI_PROVIDER=openai-compatible` 且模型名是 `gemini-3.1-flash-image` 时，仍走 OpenAI-compatible 的 `/chat/completions`，不会改走 Google SDK。

## 2. Gemini 实现

### 2.1 浏览器直连：`gemini-custom`

前端用用户提供的 key 创建：

```ts
new GoogleGenAI({ apiKey: customGeminiKey })
```

随后调用 `models.generateContent()`。当前自定义 Gemini 模式的 UI 模型为：

- `gemini-2.5-flash-image`
- `gemini-3-pro-image-preview`
- `gemini-2.0-flash`

发送给 SDK 的核心结构是：

```ts
{
  model: selectedModel,
  contents: { parts },
  config: {
    responseModalities: [Modality.IMAGE, Modality.TEXT],
    imageConfig: {
      aspectRatio,
      imageSize: imageResolution
    },
    abortSignal
  }
}
```

纯文本生成时，`parts` 是 `[{ text: promptText }]`。有源图或标注合成图时，图片被转换为 Gemini 的 inline data：

```json
{
  "inlineData": {
    "data": "<base64，不含 data URL 头>",
    "mimeType": "image/png"
  }
}
```

图片 part 在前，带尺寸要求的文字 part 在后。

### 2.2 服务端代理：`server` + `AI_PROVIDER=gemini`

浏览器请求：

```http
POST /api/ai/gemini/generate
Content-Type: application/json
```

```json
{
  "model": "gemini-2.5-flash-image",
  "contents": { "parts": [{ "text": "..." }] },
  "config": {
    "responseModalities": ["IMAGE", "TEXT"],
    "imageConfig": {
      "aspectRatio": "1:1",
      "imageSize": "1K"
    }
  }
}
```

`server/ai.mjs` 使用服务端 `AI_API_KEY` 创建 `GoogleGenAI`。如果配置了 `AI_BASE_URL`，会作为 SDK 的 `httpOptions.baseUrl`；留空则使用 Google 官方端点。代理只把前端的 `contents` 和 `config` 交给 `models.generateContent()`，然后返回：

```json
{ "candidates": [] }
```

该 Gemini 代理目前是非流式 JSON 接口；`AI_STREAM` 不参与此路由。

### 2.3 Gemini 响应提取

无论浏览器 SDK 直连还是服务端代理，前端只检查第一个候选：

```text
candidates[0].content.parts[*].inlineData.data
```

找到后组装成 `data:image/png;base64,<data>`。文字 part 不作为最终图片结果。一次生成多张图不是通过一个请求的数量参数完成，而是按 `imageCount` 并行发起 1～4 个独立请求，再收集成功结果。

## 3. GPT / OpenAI-compatible 实现

### 3.1 端点选择

OpenAI-compatible 分支先根据模型名选择 API：

| 条件 | 无源图 | 有源图 |
| --- | --- | --- |
| 模型匹配 `^gpt-image(?:-|$)` | `/images/generations` | `/images/edits` |
| 其他模型 | `/chat/completions` | `/chat/completions` |

`openai-custom` 直接请求 `<Base URL>/...`，并在浏览器添加 `Authorization: Bearer <openaiKey>`。这要求上游允许浏览器跨域请求。

`server` + `AI_PROVIDER=openai-compatible` 请求本站：

- `POST /api/ai/openai/chat/completions`
- `POST /api/ai/openai/images/generations`
- `POST /api/ai/openai/images/edits`

服务端再转发到 `<AI_BASE_URL>/chat/completions` 或 `<AI_BASE_URL>/images/...`，并添加 `.env` 中的 Bearer key。图片接口只接受 `generations` 和 `edits` 两种 operation。

### 3.2 `/images/*` 请求体

`gpt-image*` 模型走图片 API。当前实现发送 JSON，不是 multipart form-data：

```json
{
  "model": "gpt-image-2",
  "prompt": "...含尺寸提示词...",
  "images": [
    { "image_url": "data:image/png;base64,..." }
  ],
  "size": "1024x1024",
  "n": 1,
  "stream": false
}
```

只有存在画布中的源图片/绘图时才选择 `edits` 并发送 `images`。标注预览图会在已有源图时追加到这个数组。每个请求固定 `n: 1`；多图仍由前端并行多次请求实现。

### 3.3 `/chat/completions` 请求体

纯文本生成的消息是字符串：

```json
{
  "role": "user",
  "content": "Generate a completely new image ...\n\nOutput size requirement: ..."
}
```

编辑/参考图场景使用多模态 content：

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "...含尺寸提示词..." },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```

完整请求还会带 `model`、`size`、`n: 1` 和 `stream`。

如果模型名匹配 Gemini 图片模型命名规则，即名称中是 `gemini-...image...` 或 `gemini-...imagen...`，OpenAI-compatible 的 chat 请求还会带：

```json
{
  "modalities": ["image", "text"]
}
```

该分支不会自行添加 `image_config`；宽高比和分辨率通过 prompt 中的明确要求传递。

### 3.4 服务端转发与流式开关

服务端代理会展开浏览器请求体，但强制覆盖：

- `model`：必须是服务端白名单中的模型；
- `stream`：以 `.env` 的 `AI_STREAM` 为准，而不是信任浏览器值。

`AI_STREAM=true` 时，请求上游会加 `Accept: text/event-stream`。代理不解析返回内容，而是保留上游状态码、`Content-Type`、`Cache-Control`，并把响应 body 以流的方式直接 pipe 给浏览器。

`openai-custom` 模式的流式开关来自浏览器 `localStorage` 中的 `openaiStream`。

### 3.5 OpenAI-compatible 图片响应兼容

非流式响应由前端递归查找图片，当前兼容：

- `data[].b64_json`、顶层 `b64_json`；
- `url`、`image_url`；
- `inline_data`、`inlineData`；
- `images`、`image`、`content`、`text`、`parts` 等嵌套字段；
- `choices[].message`、`choices[].delta`；
- 字符串中的 Markdown 图片、`data:image/...`、HTTP(S) URL，以及指定图片字段中的裸 base64。

流式响应按 SSE 的 `data:` 行解析，忽略 `[DONE]`，并兼容 `choices[0].delta.content`、`choices[0].delta.image.data`、`b64_json`、`data[0].b64_json`、`data[0].url`，同时复用上述递归提取逻辑寻找 `message.images[]`、`delta.images[]` 等变体。

## 4. 尺寸、分辨率和比例如何写入 prompt

### 4.1 当前中转的限制

当前实际使用的中转服务不支持可靠地通过 `size` 或 Gemini `imageConfig` 等请求参数控制尺寸。因此，在当前部署中，**尺寸控制只能依赖写入 prompt 的明确文字要求**。

代码只在对应协议原本支持的分支保留结构化字段；但在当前中转上不能把这些字段视为有效保证。真正必须存在的是下面的 prompt 后缀。

### 4.2 追加时机和精确格式

前端先根据“新图生成”或“参考图编辑”形成基础提示词，然后在请求体构造前统一调用 `appendImageSizeRequirement()`，追加两个换行和这一句英文：

```text
Output size requirement: Generate the final image at {resolution} resolution with a {ratio} aspect ratio, exactly {width}x{height} pixels.
```

例如选择 `2K`、`16:9` 时：

```text
Output size requirement: Generate the final image at 2K resolution with a 16:9 aspect ratio, exactly 2048x1152 pixels.
```

这个后缀会进入所有当前生成分支：

- Gemini 纯文本生成；
- Gemini 带源图/标注编辑；
- OpenAI-compatible `/chat/completions` 纯文本或多模态消息；
- `gpt-image*` 的 `/images/generations` 与 `/images/edits`。

### 4.3 prompt 使用的像素映射

`resolution + aspectRatio` 的 prompt 映射固定如下：

| 分辨率 | `1:1` | `3:4` | `4:3` | `9:16` | `16:9` |
| --- | --- | --- | --- | --- | --- |
| `1K` | `1024x1024` | `768x1024` | `1024x768` | `720x1280` | `1280x720` |
| `2K` | `2048x2048` | `1536x2048` | `2048x1536` | `1152x2048` | `2048x1152` |
| `4K` | `2880x2880` | `2448x3264` | `3264x2448` | `2160x3840` | `3840x2160` |

所有 provider 的 prompt 都使用这张表，包括 Gemini 和经 OpenAI-compatible 协议调用的 Gemini 图片模型。

### 4.4 同时发送的兼容参数

为忠实说明当前代码，除了 prompt 外，request body 里仍存在以下兼容参数：

- Google GenAI SDK / Gemini 服务端代理：`imageConfig.aspectRatio`、`imageConfig.imageSize`；
- OpenAI-compatible 所有分支：`size`。

`size` 的计算有模型差异：

- 名称以 `gpt` 开头的模型使用上面的完整像素映射；
- 非 `gpt` 模型为兼容常见图片 API，只发送 `1024x1024`、`1024x1536`（竖图）或 `1536x1024`（横图），不随 `1K/2K/4K` 放大。

所以，当前中转上的最终判断应是：结构化参数可能被忽略，prompt 中的分辨率、比例和精确像素才是唯一可靠的尺寸指令。

## 5. 服务端配置和常见错误

`.env` 的相关字段：

```dotenv
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=
AI_MODEL=gpt-image-2
AI_MODELS=gpt-image-2,gemini-3.1-flash-image,gemini-3-pro-image
AI_STREAM=false
AI_MAX_REQUEST_SIZE=100mb
```

服务端主要错误语义：

- provider 与所调用路由不一致：`409`；
- 未设置 `AI_API_KEY`：`503`；
- OpenAI-compatible 未设置 `AI_BASE_URL`：`503`；
- 模型不在 `AI_MODEL`/`AI_MODELS` 白名单：`400`；
- 服务端连接上游失败：`502`；
- 上游已返回 HTTP 响应时，OpenAI-compatible 代理保留上游状态码和 body。

服务端默认 JSON 请求上限为 `100mb`，可通过 `AI_MAX_REQUEST_SIZE` 调整。由于请求会携带 data URL/base64 图片，大图或多张参考图时需要关注这个限制。

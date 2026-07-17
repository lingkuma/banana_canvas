import express from 'express';
import { Readable } from 'node:stream';
import { GoogleGenAI } from '@google/genai';

const normalizeProvider = (value) => {
  const provider = String(value || 'gemini').trim().toLowerCase();
  if (provider === 'openai' || provider === 'openai-compatible') {
    return 'openai-compatible';
  }
  if (provider === 'gemini' || provider === 'google') {
    return 'gemini';
  }
  throw new Error('Unsupported AI_PROVIDER: ' + value);
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const normalizeBaseUrl = (value) => {
  const baseUrl = String(value || '').trim().replace(/\/+$/, '');
  if (!baseUrl) return '';
  const parsed = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('AI_BASE_URL must use http or https.');
  }
  return baseUrl;
};

const parseModelList = (value) => String(value || '')
  .split(/[\r\n,]+/)
  .map((model) => model.trim())
  .filter(Boolean);

const isGeminiImageModel = (model) => /(?:^|\/)gemini-.*(?:image|imagen)(?:[-.:]|$)/i.test(
  String(model || '').trim()
);

export const readAiConfig = (env = process.env) => {
  const provider = normalizeProvider(env.AI_PROVIDER);
  const apiKey = String(env.AI_API_KEY || '').trim();
  const baseUrl = normalizeBaseUrl(env.AI_BASE_URL);
  const model = String(
    env.AI_MODEL || (provider === 'gemini' ? 'gemini-2.5-flash-image' : 'gpt-image-2')
  ).trim();
  const models = [...new Set([model, ...parseModelList(env.AI_MODELS)])];

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    models,
    stream: parseBoolean(env.AI_STREAM),
    requestSize: String(env.AI_MAX_REQUEST_SIZE || '100mb'),
  };
};

const publicConfig = (config) => ({
  configured: Boolean(config.apiKey),
  provider: config.provider,
  model: config.model,
  models: config.models,
  stream: config.stream,
});

const requireApiKey = (config, res) => {
  if (config.apiKey) return true;
  res.status(503).json({ error: 'The server AI_API_KEY is not configured.' });
  return false;
};

const resolveRequestModel = (config, requestedModel, res) => {
  const model = String(requestedModel || config.model).trim();
  if (config.models.includes(model)) return model;
  res.status(400).json({
    error: `Unsupported model: ${model}. Choose one of the models configured in AI_MODELS.`,
  });
  return null;
};

export const createAiRouter = (env = process.env) => {
  // Use an Express application so the middleware also works when mounted
  // directly in Vite's Connect stack, whose response is not Express-enhanced.
  const router = express();
  let config;

  try {
    config = readAiConfig(env);
  } catch (error) {
    config = { error: error instanceof Error ? error.message : String(error) };
  }

  router.use(express.json({ limit: config.requestSize || '100mb' }));

  router.get('/api/ai/config', (_req, res) => {
    if (config.error) {
      return res.status(500).json({ configured: false, error: config.error });
    }
    res.json(publicConfig(config));
  });

  router.post('/api/ai/openai/chat/completions', async (req, res) => {
    if (config.error) return res.status(500).json({ error: config.error });
    if (config.provider !== 'openai-compatible') {
      return res.status(409).json({ error: 'The server AI_PROVIDER is not openai-compatible.' });
    }
    if (!requireApiKey(config, res)) return;
    if (!config.baseUrl) {
      return res.status(503).json({
        error: 'AI_BASE_URL is required for an OpenAI-compatible channel.',
      });
    }
    const requestModel = resolveRequestModel(config, req.body?.model, res);
    if (!requestModel) return;

    try {
      const requestBody = isGeminiImageModel(requestModel)
        ? {
            model: requestModel,
            messages: req.body?.messages,
          }
        : {
            ...req.body,
            model: requestModel,
            stream: config.stream,
          };
      const upstream = await fetch(config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + config.apiKey,
          ...(!isGeminiImageModel(requestModel) && config.stream
            ? { 'Accept': 'text/event-stream' }
            : {}),
        },
        body: JSON.stringify(requestBody),
      });

      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      const cacheControl = upstream.headers.get('cache-control');
      if (cacheControl) res.setHeader('Cache-Control', cacheControl);

      if (!upstream.body) return res.end();
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'The AI provider request failed.',
      });
    }
  });

  router.post('/api/ai/openai/images/:operation', async (req, res) => {
    if (config.error) return res.status(500).json({ error: config.error });
    if (config.provider !== 'openai-compatible') {
      return res.status(409).json({ error: 'The server AI_PROVIDER is not openai-compatible.' });
    }
    if (!requireApiKey(config, res)) return;
    if (!config.baseUrl) {
      return res.status(503).json({
        error: 'AI_BASE_URL is required for an OpenAI-compatible channel.',
      });
    }
    const requestModel = resolveRequestModel(config, req.body?.model, res);
    if (!requestModel) return;

    const operation = req.params.operation;
    if (operation !== 'generations' && operation !== 'edits') {
      return res.status(404).json({ error: 'Unsupported OpenAI image operation.' });
    }

    try {
      const upstream = await fetch(config.baseUrl + '/images/' + operation, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + config.apiKey,
          ...(config.stream ? { 'Accept': 'text/event-stream' } : {}),
        },
        body: JSON.stringify({
          ...req.body,
          model: requestModel,
          stream: config.stream,
        }),
      });

      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      const cacheControl = upstream.headers.get('cache-control');
      if (cacheControl) res.setHeader('Cache-Control', cacheControl);

      if (!upstream.body) return res.end();
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'The AI provider request failed.',
      });
    }
  });

  router.post('/api/ai/gemini/generate', async (req, res) => {
    if (config.error) return res.status(500).json({ error: config.error });
    if (config.provider !== 'gemini') {
      return res.status(409).json({ error: 'The server AI_PROVIDER is not gemini.' });
    }
    if (!requireApiKey(config, res)) return;
    const requestModel = resolveRequestModel(config, req.body?.model, res);
    if (!requestModel) return;

    try {
      const ai = new GoogleGenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { httpOptions: { baseUrl: config.baseUrl } } : {}),
      });
      const response = await ai.models.generateContent({
        model: requestModel,
        contents: req.body?.contents,
        config: req.body?.config,
      });
      res.json({ candidates: response.candidates });
    } catch (error) {
      const status = Number(error?.status || error?.code);
      res.status(status >= 400 && status < 600 ? status : 502).json({
        error: error instanceof Error ? error.message : 'The Gemini request failed.',
      });
    }
  });

  return router;
};

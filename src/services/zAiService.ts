import type { AISettings } from '../types';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

export function getGLMModels(): Array<{ id: string; name: string; description: string; size: string }> {
  return [
    { id: 'glm-4.7-flash', name: 'GLM 4.7 Flash', description: 'Schnell und guenstig', size: 'small' },
    { id: 'glm-4.7', name: 'GLM 4.7', description: 'Qualitaet (langsamer)', size: 'medium' },
  ];
}

function getDefaultEndpoint() {
  return (
    (import.meta as any).env?.VITE_ZAI_ENDPOINT ||
    'https://api.z.ai/api/coding/paas/v4'
  );
}

function getApiKey(settings?: AISettings) {
  return (
    settings?.apiKey?.trim() ||
    ((import.meta as any).env?.VITE_ZAI_API_KEY as string | undefined)?.trim() ||
    ''
  );
}

function buildChatCompletionsUrl(endpoint?: string) {
  const base = (endpoint || getDefaultEndpoint()).trim().replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

function unwrapContent(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content.trim();
  return content
    .map((part) => (part?.type === 'text' || !part?.type ? part?.text || '' : ''))
    .join('\n')
    .trim();
}

async function postChatCompletions(opts: {
  settings?: AISettings;
  messages: ChatMessage[];
  maxTokens?: number;
}): Promise<ChatCompletionResponse> {
  const apiKey = getApiKey(opts.settings);
  if (!apiKey) {
    throw new Error('z.AI API-Key fehlt.');
  }

  const url = buildChatCompletionsUrl(opts.settings?.endpoint);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.settings?.model || 'glm-4.7-flash',
      messages: opts.messages,
      temperature: typeof opts.settings?.temperature === 'number' ? opts.settings.temperature : 0.3,
      max_tokens: opts.maxTokens || 1200,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`z.AI Fehler ${res.status}: ${text || res.statusText}`);
  }

  return (await res.json()) as ChatCompletionResponse;
}

export async function testZAiConnection(settings?: AISettings): Promise<boolean> {
  try {
    const resp = await postChatCompletions({
      settings,
      messages: [{ role: 'user', content: 'Antworte exakt mit: ok' }],
      maxTokens: 20,
    });
    const content = unwrapContent(resp.choices?.[0]?.message?.content).toLowerCase();
    return content.includes('ok');
  } catch {
    return false;
  }
}

export async function generateZAiReply(opts: {
  settings: AISettings;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<string> {
  const resp = await postChatCompletions({
    settings: opts.settings,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      { role: 'user', content: opts.userPrompt },
    ],
    maxTokens: opts.maxTokens || 1600,
  });

  const content = unwrapContent(resp.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error('z.AI hat keine Antwort geliefert.');
  }
  return content;
}

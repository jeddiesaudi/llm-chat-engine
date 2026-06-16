import { useState, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming: boolean;
  error?: string;
}

export interface ChatConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
}

export interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  error: string | null;
}

export interface ChatActions {
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  clearMessages: () => void;
  retryLast: () => Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 2048;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStreamingChat(config: ChatConfig): ChatState & ChatActions {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Abort controller lets us cancel in-flight stream cleanly
  const abortControllerRef = useRef<AbortController | null>(null);

  // Track last user message for retry
  const lastUserMessageRef = useRef<string>('');

  // ── Core streaming function ──────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;
      if (!config.apiKey) {
        setError('API key is required');
        return;
      }

      lastUserMessageRef.current = content;
      setError(null);

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
        isStreaming: false,
      };

      // Placeholder for assistant response — we'll fill it as tokens stream in
      const assistantMessageId = crypto.randomUUID();
      const assistantPlaceholder: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      setMessages(prev => [...prev, userMessage, assistantPlaceholder]);
      setIsStreaming(true);

      abortControllerRef.current = new AbortController();

      try {
        // Build conversation history for context window
        // (Note: we use functional state update above, so we need prev messages here)
        const historyMessages = await new Promise<Message[]>(resolve => {
          setMessages(prev => {
            resolve(prev.filter(m => !m.isStreaming && m.id !== assistantMessageId));
            return prev;
          });
        });

        const apiMessages = [...historyMessages, userMessage].map(m => ({
          role: m.role,
          content: m.content,
        }));

        const response = await fetch(
          `${config.baseURL ?? DEFAULT_BASE_URL}/v1/messages`,
          {
            method: 'POST',
            headers: buildHeaders(config.apiKey, config.baseURL),
            body: JSON.stringify({
              model: config.model ?? DEFAULT_MODEL,
              max_tokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
              stream: true,
              ...(config.systemPrompt && { system: config.systemPrompt }),
              messages: apiMessages,
            }),
            signal: abortControllerRef.current.signal,
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new APIError(
            errorData.error?.message ?? `API error: ${response.status}`,
            response.status
          );
        }

        if (!response.body) throw new Error('No response body received');

        // ── SSE stream parsing ──────────────────────────────────────────────
        await parseSSEStream(response.body, {
          onToken: (token: string) => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, content: m.content + token }
                  : m
              )
            );
          },
          onDone: () => {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, isStreaming: false }
                  : m
              )
            );
          },
        });
      } catch (err) {
        if (isAbortError(err)) {
          // User stopped generation — mark message as complete, not errored
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessageId
                ? { ...m, isStreaming: false, content: m.content || '*(generation stopped)*' }
                : m
            )
          );
        } else {
          const message = err instanceof Error ? err.message : 'Unknown error occurred';
          setError(message);
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessageId
                ? { ...m, isStreaming: false, error: message, content: '' }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isStreaming, config]
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    if (isStreaming) stopStreaming();
    setMessages([]);
    setError(null);
  }, [isStreaming, stopStreaming]);

  const retryLast = useCallback(async () => {
    if (!lastUserMessageRef.current) return;
    // Remove last assistant message if it errored
    setMessages(prev => {
      const last = prev[prev.length - 1];
      return last?.error ? prev.slice(0, -2) : prev.slice(0, -1);
    });
    await sendMessage(lastUserMessageRef.current);
  }, [sendMessage]);

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    stopStreaming,
    clearMessages,
    retryLast,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildHeaders(apiKey: string, baseURL?: string): Record<string, string> {
  const isAnthropic = !baseURL || baseURL.includes('anthropic.com');

  if (isAnthropic) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  // OpenAI-compatible
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

interface StreamHandlers {
  onToken: (token: string) => void;
  onDone: () => void;
}

async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamHandlers
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete last line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          handlers.onDone();
          return;
        }

        try {
          const parsed = JSON.parse(data);

          // Anthropic SSE format
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            handlers.onToken(parsed.delta.text);
          }

          // OpenAI SSE format
          if (parsed.choices?.[0]?.delta?.content) {
            handlers.onToken(parsed.choices[0].delta.content);
          }
        } catch {
          // Malformed JSON in stream — skip silently
        }
      }
    }
  } finally {
    reader.releaseLock();
    handlers.onDone();
  }
}

class APIError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'APIError';
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
}

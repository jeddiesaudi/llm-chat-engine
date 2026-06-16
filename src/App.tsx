import { useState, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useStreamingChat } from './hooks/useStreamingChat';

const STORAGE_KEY = 'llm_chat_api_key';
const DEFAULT_SYSTEM = 'You are a helpful, concise assistant. Be direct and clear.';

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [inputKey, setInputKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(!apiKey);
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, isStreaming, error, sendMessage, stopStreaming, clearMessages } =
    useStreamingChat({
      apiKey,
      systemPrompt: DEFAULT_SYSTEM,
    });

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [inputText]);

  const handleSend = async () => {
    if (!inputText.trim() || isStreaming) return;
    const msg = inputText;
    setInputText('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveKey = () => {
    localStorage.setItem(STORAGE_KEY, inputKey);
    setApiKey(inputKey);
    setShowKeyInput(false);
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-screen bg-gray-950 flex flex-col text-white overflow-hidden">

      {/* Header */}
      <header className="border-b border-gray-800 px-5 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-indigo-600 rounded-md flex items-center justify-center text-xs font-bold">⚡</div>
          <span className="font-semibold text-base">LLM Chat Engine</span>
          <span className="hidden sm:block text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
            streaming · sse · typescript
          </span>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setShowKeyInput(s => !s)}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <span>{apiKey ? '🔑' : '🔒'}</span>
            <span className="text-gray-300">{apiKey ? 'API Key Set' : 'Set API Key'}</span>
          </button>
        </div>
      </header>

      {/* API Key Input */}
      {showKeyInput && (
        <div className="border-b border-gray-800 bg-gray-900 px-5 py-4">
          <p className="text-xs text-gray-400 mb-2">
            Enter your Anthropic API key. Stored locally in your browser only.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={inputKey}
              onChange={e => setInputKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
              placeholder="sk-ant-..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <button
              onClick={handleSaveKey}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Get your key at console.anthropic.com → API Keys
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-5xl mb-4">⚡</div>
            <h2 className="text-lg font-semibold text-gray-300 mb-2">Ready to stream</h2>
            <p className="text-sm text-gray-500 max-w-xs">
              Messages appear token-by-token as the model generates them. Real streaming — no fake loading spinners.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            {/* Avatar */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
              ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-gray-700'}`}>
              {msg.role === 'user' ? 'U' : 'AI'}
            </div>

            {/* Bubble */}
            <div className={`group relative max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
                  ${msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                    : 'bg-gray-800 text-gray-200 rounded-tl-sm'
                  }
                  ${msg.error ? 'border border-red-500/30 bg-red-950/30' : ''}
                `}
              >
                {msg.error ? (
                  <span className="text-red-400">Error: {msg.error}</span>
                ) : (
                  <>
                    {msg.content}
                    {msg.isStreaming && (
                      <span className="inline-block w-0.5 h-4 bg-indigo-400 animate-pulse ml-0.5 align-text-bottom" />
                    )}
                  </>
                )}
              </div>

              {/* Copy button — appears on hover */}
              {!msg.isStreaming && !msg.error && msg.content && (
                <button
                  onClick={() => handleCopy(msg.id, msg.content)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-500 hover:text-gray-300 px-1"
                >
                  {copiedId === msg.id ? '✓ Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Error banner */}
        {error && (
          <div className="bg-red-950/50 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 px-4 py-4 shrink-0">
        <div className="flex gap-3 items-end">
          <div className="flex-1 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 focus-within:border-indigo-500 transition-colors">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message... (Enter to send, Shift+Enter for newline)"
              rows={1}
              disabled={isStreaming && false}
              className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none"
              style={{ maxHeight: '160px' }}
            />
          </div>

          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="w-10 h-10 bg-red-600 hover:bg-red-500 rounded-xl flex items-center justify-center shrink-0 transition-colors"
              title="Stop generation"
            >
              <div className="w-3 h-3 bg-white rounded-sm" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || !apiKey}
              className="w-10 h-10 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl flex items-center justify-center shrink-0 transition-colors"
              title="Send message (Enter)"
            >
              <svg className="w-4 h-4 text-white rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex justify-between items-center mt-2 px-1">
          <p className="text-xs text-gray-600">
            {messages.length > 0 ? `${messages.filter(m => m.role === 'user').length} messages in context` : 'No messages yet'}
          </p>
          <p className="text-xs text-gray-600">
            {isStreaming ? '⏳ Streaming...' : '↵ Send · ⇧↵ Newline'}
          </p>
        </div>
      </div>
    </div>
  );
}

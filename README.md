# LLM Chat Engine

A streaming chat interface built the way it should be — real token-by-token streaming, clean TypeScript, no SDK black boxes.

**[Live Demo →](https://llm-chat-engine-ten.vercel.app/)**

![Demo](demo.gif)

---

## Why I built this

Every LLM tutorial does the same thing: call the API, wait for the full response, display it. That's not how production apps work.

Real apps stream. Users shouldn't stare at a loading spinner for 10 seconds while a model generates 500 words. They should see words appear as they're written — like watching someone type in real time.

This project is about building that correctly. Not with a high-level SDK that hides what's happening, but with raw `fetch` and Server-Sent Events so every part of the pipeline is visible and controllable.

---

## Try it

```bash
git clone https://github.com/jeddiesaudi/llm-chat-engine
cd llm-chat-engine
npm install
npm run dev
```

Open `http://localhost:5173`, click **Set API Key**, enter your Anthropic key, and send a message. Watch the response appear word by word.

The stop button works mid-generation. The conversation history is maintained across turns. Error states don't break the UI.

---

## How the streaming works

Most people think streaming is complicated. The core of it is actually just three things:

**1. Tell the API you want a stream**

```js
body: JSON.stringify({ stream: true, ... })
```

**2. Read the response as chunks**

```js
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // value is a Uint8Array chunk
}
```

**3. Parse the SSE format and extract the text**

```
data: {"type":"content_block_delta","delta":{"text":"Hello"}}
data: {"type":"content_block_delta","delta":{"text":" world"}}
data: [DONE]
```

Each chunk gets decoded, split on newlines, and if the line starts with `data: `, we parse the JSON and pull out the text delta. That text gets appended to the message in state, which triggers a React re-render, which shows the new character on screen.

Total latency from first token to visible text: one render cycle, about 16ms.

---

## Architecture

```
src/
├── hooks/
│   └── useStreamingChat.ts   — all LLM logic lives here
└── App.tsx                   — UI only, knows nothing about streaming
```

The hook is the key design decision. `useStreamingChat` handles everything: building the request, reading the stream, updating message state, managing the abort controller, handling errors. The component just calls `sendMessage(text)` and renders whatever comes back.

This separation means you can swap the entire LLM backend — Anthropic to OpenAI to a local model — by changing a few lines in the hook. The UI doesn't care.

---

## What's handled that tutorials skip

**Abort / stop generation** — an `AbortController` is created per request. Clicking stop calls `abort()`, the stream closes cleanly, and the partial message is preserved rather than discarded.

**Conversation history** — every `sendMessage` call includes the full prior conversation in the API request. The model has context across turns.

**Error recovery** — network errors, API errors, and malformed stream chunks are all caught and surfaced in the UI without breaking state. You can keep chatting after an error.

**Both Anthropic and OpenAI formats** — the SSE parser handles both response formats. Switching providers is a one-line config change.

---

## Stack

| What                  | Why                                                         |
| --------------------- | ----------------------------------------------------------- |
| React 18 + TypeScript | Strict types on async state prevents entire classes of bugs |
| Vite                  | Fast dev cycle, clean ESM output                            |
| Tailwind CSS          | Utility-first, no context switching                         |
| Raw fetch (no SDK)    | The pipeline is fully visible and auditable                 |

No external state management. No LLM SDK. The streaming implementation is about 80 lines of code you can read in 5 minutes.

---

## Tradeoffs worth knowing

**API key in the browser** — the key is stored in localStorage and sent directly to the Anthropic API. This is fine for a personal tool or demo, but a production app should proxy requests through a backend so the key stays server-side.

**No persistence** — conversations live in React state. Refresh the page and they're gone. Adding persistence would mean either localStorage (simple, works) or a backend database (proper, scalable).

**Context window limit** — the full conversation history is sent on every request. Long conversations will eventually hit the model's context limit and need truncation logic.

---

## What I'd add next

- [ ] Backend proxy to keep the API key server-side
- [ ] Conversation persistence with localStorage
- [ ] Markdown rendering for code blocks and lists
- [ ] System prompt customization from the UI
- [ ] Export conversation as text or JSON

---

## License

MIT

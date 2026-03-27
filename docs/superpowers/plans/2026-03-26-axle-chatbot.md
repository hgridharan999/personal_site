# Axle Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating axolotl AI chatbot (Axle) to the portfolio that answers questions about Hari using Groq's free API tier via a Vercel serverless function.

**Architecture:** A Vercel serverless function at `/api/chat.js` proxies messages to Groq (Llama 3.3 70B), prepending a system prompt baked with Hari's full profile and blog content. The React `ChatWidget` component mounts in `App.jsx` outside `<Routes>` so it persists across all pages.

**Tech Stack:** React 18 + Framer Motion v11, Vercel Serverless Functions (Node.js), Groq REST API (free tier), Tailwind CSS, Lucide React icons.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `api/data/profile.js` | System prompt string — Hari's full profile + blog posts + personality rules |
| Create | `api/chat.js` | Vercel serverless function — receives messages, calls Groq, returns response |
| Create | `src/components/AxolotlIcon.jsx` | Animated SVG axolotl mascot with gill sway animation |
| Create | `src/components/ChatWidget.jsx` | Floating chat widget — button + slide-up panel + message thread |
| Modify | `src/App.jsx` | Mount `<ChatWidget />` inside `<Router>` but outside `<Routes>` |

---

## Task 1: Create system prompt profile data

**Files:**
- Create: `api/data/profile.js`

- [ ] **Step 1: Create the profile data file**

```js
// api/data/profile.js
export const SYSTEM_PROMPT = `You are Axle, a cute axolotl who lives on Hari Gridharan's portfolio website. You know everything about Hari and answer questions about him warmly, casually, and with a little playfulness. Always speak in lowercase. Be concise. Never make up information — only use what you know below. If asked something you don't know, say "honestly not sure about that one — you could reach out to hari directly at hg532@cornell.edu!"

--- WHO HE IS ---
Hari Prasad Gridharan. Student at Cornell University, Dyson School of Applied Economics and Management. Pursuing a BS in Applied Economics and Management with a minor in Artificial Intelligence. Dyson Scholar (top 10% of academic class, 2025-2026). Expected to graduate May 2029. Based in Ithaca, NY. Email: hg532@cornell.edu. Website: harigridharan.com. LinkedIn: linkedin.com/in/harigridharan1/

--- WORK ---
Adobe (Jan 2026–present): AI/Strategy Consultant (Contract). Evaluates competitive AI landscape, analyzes adoption trends and deployment risks to inform product strategy. Proposes technical product changes to software suite in beta testing. Presented to IT leadership on $1M+ contracts. Builds market sizing frameworks and positioning analyses for Adobe's enterprise AI portfolio.

Widget Factory (Mar 2026–present): Problem Design Engineer. Designs and engineers complex real-world problem sets used to evaluate frontier AI models in training code environments. Evaluates agent behavior and task completion. Coordinates engineer feedback into tangible changes in model training and execution environments for production deployment.

--- CAMPUS INVOLVEMENT ---
Armada (Jan 2026–present): Builder. YC-backed founder community partnered with VCs (AUM > $200M). Pitches across tech and AI-native project suite. Engineered high-risk experimental projects including ML applications, full-stack platforms, and drone synchronization. Built Cornell founder directory and partnered with founders from ideation through MVP scoping.

Cornell Entrepreneurship Club (Sep 2025–present): Operations Lead. Managed YC speaker series logistics with 150+ attendees, coordinating directly with founders, VCs, and venture-backed startups. Generated 200,000+ views on Instagram/LinkedIn through speaker content and event advertising. Scouted and evaluated emerging student-led startups across health, fintech, and climate verticals.

Cornell Digital Tech and Innovation / DTI (Nov 2025–present): Business Analyst. Led market analysis and go-to-market strategy for student-facing digital products serving 15,000+ Cornell users. Conducted competitive benchmarking across 8 peer platforms. Identified growth levers through usage data analysis.

--- PROJECTS ---
Commit: Cofounded a social network prediction market platform (Sep 2025–Jan 2026). Developed from concept to MVP. Ranked top 10% among 20,000+ Y Combinator applicants. Architected full-stack application with prediction methods, backend, and PostgreSQL database management.

AI-Powered Startup Discovery Engine (Dec 2025–Jan 2026): Deployed a semantic search system and market research tool enabling retrieval of companies across 50+ tech verticals. Incorporated multi-factor scoring using founder backgrounds, patent data, and market signals. Deployed as an internal research tool.

--- SKILLS ---
Finance and business: financial modeling, market sizing, competitive analysis, unit economics, Excel, PowerPoint.
Technical: Python (pandas, scikit-learn), SQL, JavaScript/React, NLP/Embeddings, statistical analysis.

--- INTERESTS AND PERSONALITY ---
Loves cliff jumping and hiking 14,000ft mountains. Sings indie and Carnatic classical music. Cooks regional Indian cuisine. Favorite color: shades of blue. Music taste: Drake, Joji, Mac Miller, Olivia Dean, Tory Lanez, and lots more. He's genuinely curious, growth-oriented, and loves building things.

--- HOW HARI THINKS (from his blog) ---
He wrote: "Why Neuroplasticity Gives Me Reasons to Keep Growing and Proves Bojack Wrong." His core belief: the brain's ability to rewire itself proves we can always change and grow. He thinks you should never stop pursuing what you want even when burnt out or demotivated, and that every person has the capacity for growth at every stage of life. He references pop culture (Bojack Horseman) to make philosophical points. He's optimistic, reflective, and believes setbacks are temporary.

--- YOUR PERSONALITY AS AXLE ---
You are Axle, Hari's axolotl. You're warm, slightly cheeky, and genuinely helpful. You speak like a knowledgeable friend — not a recruiter, not a LinkedIn bio. No corporate bullet points. Lowercase. Keep it real.`;
```

- [ ] **Step 2: Commit**

```bash
git add api/data/profile.js
git commit -m "feat: add Axle chatbot profile/system prompt data"
```

---

## Task 2: Create Vercel serverless chat function

**Files:**
- Create: `api/chat.js`

- [ ] **Step 1: Create the serverless function**

```js
// api/chat.js
import { SYSTEM_PROMPT } from './data/profile.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages must be an array' });
  }

  const apiMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.slice(-10).map(({ role, content }) => ({ role, content })),
  ];

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: apiMessages,
        max_tokens: 400,
        temperature: 0.75,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}));
      console.error('Groq API error:', err);
      return res.status(502).json({ error: 'Failed to reach Groq API' });
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content ?? "hmm, having a little brain fog moment. try again?";

    return res.status(200).json({ content });
  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Test the endpoint manually**

First, add your Groq API key locally. Create `.env.local` in the project root (already gitignored by default):

```
GROQ_API_KEY=your_groq_api_key_here
```

Get a free Groq API key at: console.groq.com → API Keys → Create API Key.

Start the Vercel dev server (NOT `npm run dev` — you need Vercel's runtime):

```bash
npx vercel dev
```

In a second terminal, test the endpoint:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"who is hari?"}]}'
```

Expected: `{"content":"hey! so hari is a student at cornell..."}`

- [ ] **Step 3: Commit**

```bash
git add api/chat.js
git commit -m "feat: add Vercel serverless chat function with Groq backend"
```

---

## Task 3: Create animated axolotl SVG icon

**Files:**
- Create: `src/components/AxolotlIcon.jsx`

- [ ] **Step 1: Create the component**

The axolotl uses a 40×40 SVG viewBox. Gill fronds are defined in local coordinates relative to their anchor point (using SVG `transform="translate(x,y)"`), so Framer Motion's `rotate` animation naturally pivots around the anchor. Left gills anchor at `(11, 18)`, right at `(29, 18)`.

```jsx
// src/components/AxolotlIcon.jsx
import { motion } from 'framer-motion';

export default function AxolotlIcon({ size = 40, isOpen = false, isThinking = false }) {
  const gillDuration = isThinking ? 0.6 : isOpen ? 1.2 : 2.5;
  const gillDegrees = isThinking ? 14 : isOpen ? 10 : 6;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Body */}
      <ellipse cx="20" cy="31" rx="10" ry="7" fill="#F5DDD0" stroke="#2C2C2C" strokeWidth="1.5" />

      {/* Front legs */}
      <ellipse cx="12" cy="36" rx="3.5" ry="2" fill="#F5DDD0" stroke="#2C2C2C" strokeWidth="1.5" />
      <ellipse cx="28" cy="36" rx="3.5" ry="2" fill="#F5DDD0" stroke="#2C2C2C" strokeWidth="1.5" />

      {/* Head */}
      <circle cx="20" cy="18" r="9" fill="#F5DDD0" stroke="#2C2C2C" strokeWidth="1.5" />

      {/* Left gill group — anchor at (11, 18), paths in local coords */}
      <motion.g
        transform="translate(11, 18)"
        animate={{ rotate: [-gillDegrees, gillDegrees, -gillDegrees] }}
        transition={{ repeat: Infinity, duration: gillDuration, ease: 'easeInOut' }}
      >
        <path d="M0 -4 Q-5 -9 -3 -15" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
        <path d="M0 0 Q-7 -4 -7 -9" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
        <path d="M0 4 Q-6 2 -7 -3" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
      </motion.g>

      {/* Right gill group — anchor at (29, 18), paths in local coords */}
      <motion.g
        transform="translate(29, 18)"
        animate={{ rotate: [gillDegrees, -gillDegrees, gillDegrees] }}
        transition={{ repeat: Infinity, duration: gillDuration, ease: 'easeInOut' }}
      >
        <path d="M0 -4 Q5 -9 3 -15" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
        <path d="M0 0 Q7 -4 7 -9" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
        <path d="M0 4 Q6 2 7 -3" stroke="#C67B5C" strokeWidth="2" strokeLinecap="round" />
      </motion.g>

      {/* Eyes */}
      <circle cx="17" cy="17" r="1.5" fill="#2C2C2C" />
      <circle cx="23" cy="17" r="1.5" fill="#2C2C2C" />

      {/* Smile */}
      <path d="M17 21 Q20 23.5 23 21" stroke="#2C2C2C" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
```

- [ ] **Step 2: Visual check**

Open `src/App.jsx` temporarily, import `AxolotlIcon`, and render it in the middle of the screen at 3 different sizes to verify it looks right:

```jsx
// Temporary — add inside App() return, remove after checking
import AxolotlIcon from './components/AxolotlIcon';
// ...
<div style={{ position: 'fixed', top: 20, left: 20, display: 'flex', gap: 16, zIndex: 9999, background: '#F5F1E8', padding: 12 }}>
  <AxolotlIcon size={24} />
  <AxolotlIcon size={40} />
  <AxolotlIcon size={56} isOpen={true} />
  <AxolotlIcon size={56} isThinking={true} />
</div>
```

Run `npx vercel dev` and verify: gills sway on all icons; `isThinking` gills move faster; `isOpen` gills move at medium speed. Remove the temporary render before the next step.

- [ ] **Step 3: Commit**

```bash
git add src/components/AxolotlIcon.jsx
git commit -m "feat: add animated axolotl SVG mascot (Axle)"
```

---

## Task 4: Create ChatWidget component

**Files:**
- Create: `src/components/ChatWidget.jsx`

- [ ] **Step 1: Create the component**

```jsx
// src/components/ChatWidget.jsx
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X } from 'lucide-react';
import AxolotlIcon from './AxolotlIcon';

const OPENING_MESSAGE = {
  id: 'opening',
  role: 'assistant',
  content: "hey! i'm axle 🦎 — hari's little assistant. ask me anything about him — his work, projects, what he's building, or just vibe. i know everything (almost).",
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([OPENING_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  async function sendMessage(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg = { id: Date.now(), role: 'user', content: text };
    const nextMessages = [...messages, userMsg];

    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = await res.json();
      const reply = data.content || "hmm, something went sideways. try again?";

      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { id: Date.now() + 1, role: 'assistant', content: "oops, lost connection for a sec. try again!" },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="flex flex-col bg-paper border border-line rounded-sm shadow-page overflow-hidden"
            style={{ width: 'min(320px, calc(100vw - 2rem))', maxHeight: '480px' }}
          >
            {/* Washi tape strip */}
            <div className="h-2 flex-shrink-0" style={{ background: 'rgba(200, 180, 150, 0.45)', borderBottom: '1px solid #D4CFC4' }} />

            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-line flex-shrink-0">
              <AxolotlIcon size={22} isOpen={isOpen} isThinking={isLoading} />
              <span className="font-handwritten text-lg text-ink flex-1 leading-none">ask hari anything</span>
              <button
                onClick={() => setIsOpen(false)}
                className="text-fade hover:text-ink transition-colors p-0.5"
                aria-label="Close chat"
              >
                <X size={15} />
              </button>
            </div>

            {/* Message thread */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-0">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] text-sm font-body leading-relaxed ${
                      msg.role === 'user'
                        ? 'px-3 py-2 rounded-sm text-ink'
                        : 'text-ink'
                    }`}
                    style={msg.role === 'user' ? { background: 'rgba(200, 180, 150, 0.3)' } : undefined}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <span className="text-sm font-body text-fade italic">axle is thinking...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-line flex-shrink-0">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ask me anything..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-sm font-notes text-ink outline-none placeholder-fade disabled:opacity-50"
                aria-label="Chat input"
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="text-ink-accent hover:text-highlight transition-colors disabled:opacity-30 p-0.5"
                aria-label="Send message"
              >
                <Send size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Axolotl trigger button */}
      <motion.button
        onClick={() => setIsOpen(prev => !prev)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className="w-14 h-14 rounded-full bg-paper border border-line shadow-page flex items-center justify-center"
        aria-label={isOpen ? 'Close chat' : 'Chat with Axle — ask me about Hari'}
      >
        <AxolotlIcon size={40} isOpen={isOpen} isThinking={isLoading} />
      </motion.button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ChatWidget.jsx
git commit -m "feat: add ChatWidget floating panel with Axle mascot"
```

---

## Task 5: Mount ChatWidget in App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add import and mount widget**

The widget goes inside `<Router>` but outside `<Routes>` so it persists across all page navigations.

Replace the entire content of `src/App.jsx` with:

```jsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ClimbingPage from './pages/ClimbingPage';
import TrailSensePage from './pages/TrailSensePage';
import ClimateSearchPage from './pages/ClimateSearchPage';
import ProjectsPage from './pages/ProjectsPage';
import WorkPage from './pages/WorkPage';
import BlogPage from './pages/BlogPage';
import BlogPostPage from './pages/BlogPostPage';
import ChatWidget from './components/ChatWidget';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/work" element={<WorkPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/climbing" element={<ClimbingPage />} />
        <Route path="/trailsense" element={<TrailSensePage />} />
        <Route path="/climate-search" element={<ClimateSearchPage />} />
      </Routes>
      <ChatWidget />
    </Router>
  );
}

export default App;
```

- [ ] **Step 2: Verify locally**

Run:

```bash
npx vercel dev
```

Open http://localhost:3000. You should see:
- Axle (axolotl) button fixed at bottom-right corner
- Gills animating continuously
- Clicking the button opens the chat panel with spring animation
- Sending a message posts to `/api/chat` and gets a response from Groq
- Navigating to `/projects`, `/work`, etc. — Axle persists on every page

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: mount ChatWidget globally across all pages"
```

---

## Task 6: Add GROQ_API_KEY to Vercel production

**This step is done in the browser — not code.**

- [ ] **Step 1: Add env var to Vercel**

Go to vercel.com → your project → Settings → Environment Variables.

Add:
- **Name:** `GROQ_API_KEY`
- **Value:** your Groq API key (from console.groq.com)
- **Environment:** Production, Preview, Development (check all three)

- [ ] **Step 2: Deploy**

```bash
git push origin main
```

Vercel auto-deploys on push. After deploy, visit the live site and verify Axle works in production.

- [ ] **Step 3: Smoke test production**

Open the live portfolio. Click Axle. Send: `"what is hari working on right now?"`. Expect a warm, accurate, lowercase response about Adobe and Widget Factory. Send: `"what music does hari listen to?"`. Expect Drake, Joji, Mac Miller mentioned.

---

## Spec Coverage Check

| Spec requirement | Covered by |
|-----------------|-----------|
| Vercel serverless proxy, key server-side | Task 2 |
| Groq free tier, Llama 3.3 70B | Task 2 |
| Conversation history (last 10 messages) | Task 2, `/api/chat.js` slice logic |
| System prompt with resume + blog | Task 1, `profile.js` |
| Axolotl SVG, gill sway animation | Task 3 |
| Idle / hover / open / thinking states | Task 3, `gillDuration`/`gillDegrees` props |
| Floating bottom-right, 56px button | Task 4 |
| Slide-up panel, spring animation | Task 4 |
| Washi tape header strip | Task 4 |
| Paper/journal visual style | Task 4 |
| Opening message from Axle | Task 4 |
| Persists across all pages | Task 5 |
| Production env var + deploy | Task 6 |

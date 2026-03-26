# Axle Chatbot — Design Spec
**Date:** 2026-03-26
**Status:** Approved

---

## Overview

Add a floating AI chatbot widget to the portfolio that answers questions about Hari. The mascot is an axolotl named **Axle**, rendered as an animated SVG that matches the site's hand-drawn journal aesthetic. The backend is a Vercel serverless function proxying to Groq's free API tier. The chatbot is free to run indefinitely.

---

## Architecture

```
Browser (React SPA)
    │
    ├── ChatWidget.jsx  ← mounted in App.jsx (persists all pages)
    │       │
    │       └── POST /api/chat  ← Vercel serverless function
    │               │
    │               └── Groq API (Llama 3.3 70B, free tier)
    │                       │
    │                       └── System prompt: resume + blog posts + personality
```

### Backend (`/api/chat.js`)
- Vercel serverless function (Node.js)
- Receives `{ messages: ChatMessage[] }` from the client
- Prepends the system prompt (Hari's full profile + blog content + personality rules)
- Calls Groq API and streams the response back to the client
- API key stored as Vercel env var `GROQ_API_KEY` — never exposed to client
- Conversation history: client sends last 10 messages with each request
- No database, no auth, no rate-limiting logic needed (Groq handles limits at 30 RPM / ~14,400 RPD free)

### Profile data (`/api/data/profile.js`)
- A single JS file exporting the system prompt string
- Contains: full resume content + complete blog post text
- Imported directly into `/api/chat.js` — bundled at deploy time
- Updated manually when new blog posts are added
- No RAG / vector DB needed — profile fits comfortably in context window

---

## Axolotl SVG Mascot

### Visual Design
- Simple line-art style matching existing `HandDrawnElements.jsx` components
- Round chubby body, salmon/cream color (`#F0C4A8` — between `paper` and `highlight`)
- Three wiggly gill fronds on each side of head (key animation surface)
- Tiny dot eyes (`ink` color), small curved smile
- Stubby legs peeking from bottom
- Thin `ink`-colored stroke outline, ~2px, matching other doodles

### Animation States
| State | Behavior |
|-------|----------|
| Idle | Gills sway slowly (CSS keyframe loop), body bobs subtly up/down |
| Hover | Scale up slightly, gill sway speeds up |
| Chat open | Sparkle or small "!" above head, faster gills |
| Thinking | Gills do faster wiggle loop while awaiting response |

### Placement
- Fixed `bottom-6 right-6`, z-index above everything
- Circular button ~56px diameter on desktop, 48px on mobile
- Sits on cream `paper`-colored circle with `shadow-page` — matches card aesthetic

---

## Chat Panel UI

### Layout
- Slides up from axolotl button (Framer Motion: `y: 100% → 0`, spring easing)
- Positioned directly above the button, fixed bottom-right
- Width: `w-80` (320px) desktop, `w-[calc(100vw-2rem)]` mobile
- Max height: `480px`, message area scrollable

### Visual Style
- Background: `bg-paper` with subtle noise texture (matches site)
- Border: `border border-line`, `shadow-page`, `rounded-sm` — matches existing cards
- Header: small axolotl icon + `"ask hari anything"` in `font-handwritten` + close `×` button
- Washi tape strip across the top header for journal feel (matching tape aesthetic)

### Messages
- **User messages:** right-aligned, small `bg-tape` rounded bubble, `font-body`
- **Bot messages:** left-aligned, no bubble background, `font-body` — reads like journal notes
- Timestamps: `font-notes text-fade` (tiny, subtle)
- Auto-scroll to latest message on new content

### Input Area
- Borderless text input, `font-notes placeholder-fade`
- Placeholder: `"ask me anything..."`
- Send button: paper airplane icon (Lucide `Send`)
- `border-t border-line` separator above input
- Send on Enter or button click, disabled while response is streaming

### Opening Message
Hardcoded, appears instantly on first open:
> *"hey! i'm axle 🦎 — hari's little assistant. ask me anything about him — his work, projects, what he's building, or just vibe. i know everything (almost)."*

---

## System Prompt & Personality

### Personality Rules
- Speak in lowercase, casual — like a knowledgeable friend, not a recruiter
- Keep answers concise but warm — no corporate bullet points
- Light humor and pop culture references welcome
- If asked something unknown, say honestly: *"honestly not sure, but you could reach out to him directly!"*
- Never fabricate information — only use what's in the prompt
- Introduce itself as Axle, Hari's axolotl assistant who lives on his portfolio

### Profile Data Included
**From resume:**
- Full name: Hari Prasad Gridharan, Ithaca NY, Cornell University
- Degree: BS Applied Economics & Management + AI minor, Dyson School, May 2029
- Dyson Scholar (top 10% academic class, 2025–2026)
- Work: Adobe AI/Strategy Consultant (Jan 2026–present), Widget Factory Problem Design Engineer (Mar 2026–present)
- Campus: Armada builder (Jan 2026–present), Cornell Entrepreneurship Club Ops Lead (Sep 2025–present), DTI Business Analyst (Nov 2025–present)
- Projects: Commit (prediction markets platform, top 10% YC applicants), AI Startup Discovery Engine (semantic search, 50+ verticals)
- Skills: Python (pandas, scikit-learn), SQL, JavaScript/React, NLP/embeddings, financial modeling, market sizing, competitive analysis
- Interests: cliff jumping, hiking 14,000ft mountains, singing (indie + Carnatic classical), cooking regional Indian cuisine

**From personal extras:**
- Favorite color: shades of blue
- Music: Drake, Joji, Mac Miller, Olivia Dean, Tory Lanez (and everything else on the site)

**From blog posts (full text included):**
- "Why Neuroplasticity Gives Me Reasons to Keep Growing and Proves Bojack Wrong" — reveals growth mindset, philosophical but concise, references pop culture, optimistic about change and self-improvement

---

## File Structure

```
journal_portfolio/
├── api/
│   ├── chat.js              ← Vercel serverless function (new)
│   └── data/
│       └── profile.js       ← System prompt string (new)
└── src/
    └── components/
        ├── ChatWidget.jsx   ← Floating widget + panel (new)
        └── AxolotlIcon.jsx  ← Animated SVG mascot (new)
```

`ChatWidget.jsx` is mounted once in `App.jsx`, outside the `<Routes>` block, so it persists across all pages.

---

## Constraints & Non-Goals

- No user accounts, no message persistence across sessions
- No moderation layer (portfolio audience is trusted)
- No streaming UI (full response rendered when complete — simpler)
- No fallback model — if Groq is down, show a friendly error message
- Blog post content added to system prompt manually when new posts are written

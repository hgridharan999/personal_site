// src/components/ChatWidget.jsx
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X } from 'lucide-react';
import AxolotlIcon from './AxolotlIcon';

const OPENING_MESSAGE = {
  id: 'opening',
  role: 'assistant',
  content: "hey! i'm gizmo 🐐 — hari's little assistant. ask me anything about him — his work, projects, what he's building, or just vibe. i know everything (almost).",
};

// Fixed particle positions so they don't shift on re-render
const SPARKLE_OFFSETS = [
  { x: -20, baseDelay: 0 },
  { x: 12,  baseDelay: 0.8 },
  { x: 4,   baseDelay: 1.6 },
];

function SparkleParticles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {SPARKLE_OFFSETS.map((p, i) => (
        <motion.span
          key={i}
          className="absolute select-none"
          style={{
            color: '#C67B5C',
            fontSize: '10px',
            fontWeight: 'bold',
            left: `calc(50% + ${p.x}px)`,
            bottom: '70%',
          }}
          animate={{ y: [0, -32, -32], opacity: [0, 0.85, 0], scale: [0.5, 1.2, 0.7] }}
          transition={{
            duration: 1.6,
            delay: p.baseDelay,
            repeat: Infinity,
            repeatDelay: 4.5,
            ease: 'easeOut',
          }}
        >
          ✦
        </motion.span>
      ))}
    </div>
  );
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([OPENING_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [idleBouncing, setIdleBouncing] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const messagesEndRef = useRef(null);
  const msgId = useRef(2);
  const hasShownTooltip = useRef(false);
  const idleTimer = useRef(null);
  const tooltipTimer = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Tooltip: show once after 2s on first load
  useEffect(() => {
    tooltipTimer.current = setTimeout(() => {
      if (!hasShownTooltip.current) {
        setShowTooltip(true);
        hasShownTooltip.current = true;
      }
    }, 2000);
    return () => clearTimeout(tooltipTimer.current);
  }, []);

  // Idle bounce: 5s after closing
  useEffect(() => {
    clearTimeout(idleTimer.current);
    if (!isOpen) {
      idleTimer.current = setTimeout(() => setIdleBouncing(true), 5000);
    } else {
      setIdleBouncing(false);
      setShowTooltip(false);
    }
    return () => clearTimeout(idleTimer.current);
  }, [isOpen]);

  function handleButtonHover() {
    clearTimeout(idleTimer.current);
    setIdleBouncing(false);
    setShowTooltip(false);
  }

  function handleOpen() {
    setIsOpen(prev => !prev);
    setIdleBouncing(false);
    setShowTooltip(false);
    hasShownTooltip.current = true;
  }

  async function sendMessage(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg = { id: msgId.current++, role: 'user', content: text };
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

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      const reply = data.content || "hmm, something went sideways. try again?";

      setMessages(prev => [...prev, { id: msgId.current++, role: 'assistant', content: reply }]);
    } catch {
      setMessages(prev => [
        ...prev,
        { id: msgId.current++, role: 'assistant', content: "oops, lost connection for a sec. try again!" },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-panel"
            role="dialog"
            aria-label="Chat with Gizmo"
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
              <AxolotlIcon size={24} isOpen={isOpen} isThinking={isLoading} />
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
                      msg.role === 'user' ? 'px-3 py-2 rounded-sm text-ink' : 'text-ink'
                    }`}
                    style={msg.role === 'user' ? { background: 'rgba(200, 180, 150, 0.3)' } : undefined}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <span className="text-sm font-body text-fade italic">gizmo is thinking...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <form onSubmit={sendMessage} className="flex items-center gap-2 px-4 py-3 border-t border-line flex-shrink-0">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="ask me anything..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-sm font-notes text-ink outline-none placeholder-fade disabled:opacity-50"
                aria-label="Chat input"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="text-ink-accent hover:text-highlight transition-colors disabled:opacity-30 p-0.5"
                aria-label="Send message"
              >
                <Send size={15} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trigger button + ambient effects */}
      <div className="relative flex items-center justify-center">
        {/* Speech bubble tooltip */}
        <AnimatePresence>
          {showTooltip && !isOpen && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="absolute right-full mr-3 bottom-3 whitespace-nowrap bg-paper border border-line rounded-sm px-2.5 py-1.5 text-xs font-handwritten text-ink shadow-page"
            >
              ask me anything ✦
              {/* Arrow pointing right */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-paper border-r border-t border-line rotate-45"
                style={{ right: '-6px' }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ambient glow rings — only when closed */}
        {!isOpen && (
          <>
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: '64px',
                height: '64px',
                background: 'radial-gradient(circle, rgba(198,123,92,0.35) 0%, transparent 70%)',
              }}
              animate={{ scale: [1, 1.75, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                width: '64px',
                height: '64px',
                background: 'radial-gradient(circle, rgba(198,123,92,0.2) 0%, transparent 70%)',
              }}
              animate={{ scale: [1, 1.75, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, delay: 1.5, ease: 'easeInOut' }}
            />
          </>
        )}

        {/* Sparkle particles — only when closed */}
        {!isOpen && <SparkleParticles />}

        {/* Main button */}
        <motion.button
          onClick={handleOpen}
          onMouseEnter={handleButtonHover}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          animate={{ y: idleBouncing ? [0, -9, 0, -5, 0] : 0 }}
          transition={idleBouncing ? { duration: 0.65, ease: 'easeOut' } : { duration: 0.2 }}
          onAnimationComplete={() => setIdleBouncing(false)}
          className="relative w-16 h-16 rounded-full bg-white border border-line shadow-page flex items-center justify-center"
          aria-label={isOpen ? 'Close chat' : 'Chat with Gizmo — ask me about Hari'}
        >
          <AxolotlIcon size={44} isOpen={isOpen} isThinking={isLoading} />
        </motion.button>
      </div>
    </div>
  );
}

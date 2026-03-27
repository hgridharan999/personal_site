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
  const msgId = useRef(2); // 0 used by OPENING_MESSAGE id logic, start at 2

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-panel"
            role="dialog"
            aria-label="Chat with Axle"
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

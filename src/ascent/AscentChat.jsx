import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X } from 'lucide-react';

const AMBER = '#E8C089';
const BONE = '#EDE7DA';
const LINE = 'rgba(237,231,218,0.14)';
const MONO = "'Space Mono', ui-monospace, monospace";
const DISPLAY = "'Archivo', system-ui, sans-serif";

const OPENING = {
  id: 'opening',
  role: 'assistant',
  content: "I'm Hari's AI — trained on his work, projects, and climbs. Ask me anything.",
};

// small avatar — face crop of the portrait from the old home page
function Avatar({ size, fill }) {
  const style = {
    borderRadius: '50%', backgroundColor: '#0B0A0A',
    backgroundImage: 'url(/profile.jpg)', backgroundSize: '360%', backgroundPosition: '19% 37%',
    ...(fill ? { position: 'absolute', inset: 0 } : { width: size, height: size, flexShrink: 0, border: `1px solid ${LINE}` }),
  };
  return <div aria-hidden="true" style={style} />;
}

export default function AscentChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([OPENING]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hover, setHover] = useState(false);
  const endRef = useRef(null);
  const idRef = useRef(2);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isOpen]);

  async function send(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    const next = [...messages, { id: idRef.current++, role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      setMessages((p) => [...p, { id: idRef.current++, role: 'assistant', content: data.content || 'Something went sideways — try again?' }]);
    } catch {
      setMessages((p) => [...p, { id: idRef.current++, role: 'assistant', content: 'Lost connection for a second — try again.' }]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, fontFamily: DISPLAY }}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="panel"
            role="dialog"
            aria-label="Ask Hari's AI"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            style={{ width: 'min(360px, calc(100vw - 32px))', maxHeight: '70vh', display: 'flex', flexDirection: 'column', background: '#131211', border: `1px solid ${LINE}`, color: BONE, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,0.55)' }}
          >
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${LINE}`, flexShrink: 0 }}>
              <Avatar size={30} />
              <div style={{ flex: 1, lineHeight: 1.15 }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: AMBER }}>Ask Hari</div>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(237,231,218,0.4)', marginTop: 2 }}>AI · trained on his work</div>
              </div>
              <button onClick={() => setIsOpen(false)} aria-label="Close" style={{ background: 'none', border: 0, color: 'rgba(237,231,218,0.5)', cursor: 'pointer', padding: 2 }}>
                <X size={16} />
              </button>
            </div>

            {/* thread */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '86%', fontSize: 14, lineHeight: 1.5, fontFamily: DISPLAY,
                    ...(m.role === 'user'
                      ? { background: 'rgba(232,192,137,0.14)', border: `1px solid rgba(232,192,137,0.28)`, color: BONE, padding: '8px 11px' }
                      : { color: 'rgba(237,231,218,0.82)' }),
                  }}>
                    {m.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: AMBER }}>thinking…</div>
              )}
              <div ref={endRef} />
            </div>

            {/* input */}
            <form onSubmit={send} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: `1px solid ${LINE}`, flexShrink: 0 }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="ask me anything…"
                disabled={isLoading}
                aria-label="Message"
                style={{ flex: 1, background: 'transparent', border: 0, outline: 'none', color: BONE, fontFamily: DISPLAY, fontSize: 14 }}
              />
              <button type="submit" disabled={isLoading || !input.trim()} aria-label="Send" style={{ background: 'none', border: 0, color: AMBER, cursor: 'pointer', padding: 2, opacity: input.trim() && !isLoading ? 1 : 0.3 }}>
                <Send size={16} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* trigger */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <AnimatePresence>
          {hover && !isOpen && (
            <motion.div
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.25 }}
              style={{ position: 'absolute', right: '100%', marginRight: 12, whiteSpace: 'nowrap', background: '#131211', border: `1px solid ${LINE}`, color: BONE, fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '7px 10px' }}
            >
              Ask me anything
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setIsOpen((o) => !o)}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          aria-label={isOpen ? 'Close chat' : "Ask Hari's AI"}
          style={{ position: 'relative', width: 56, height: 56, borderRadius: '50%', border: `1px solid rgba(232,192,137,0.5)`, background: '#0B0A0A', overflow: 'hidden', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {isOpen ? <X size={20} color={BONE} style={{ position: 'relative', zIndex: 1 }} /> : <Avatar fill />}
        </button>
      </div>
    </div>
  );
}

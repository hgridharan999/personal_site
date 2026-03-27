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

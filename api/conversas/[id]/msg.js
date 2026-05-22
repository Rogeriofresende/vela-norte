// Vela — stub sem persistência (Decision 0089: zero retention)
export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Decision 0089: nunca logar conteúdo da conversa no servidor
  const { msg } = req.body || {};
  if (!msg || typeof msg !== 'string') {
    return res.status(400).json({ error: 'msg obrigatório' });
  }
  // Echo stub — substituir por chamada LLM futura
  return res.status(200).json({ reply: `[echo] ${msg.slice(0, 200)}` });
}

const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getChatReply({ systemPrompt, history, userMessage }) {
  const messages = [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userMessage }];

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
  });

  const reply = completion.choices[0].message.content;
  const tokensUsed = completion.usage ? completion.usage.total_tokens : 0;

  return { reply, tokensUsed };
}

module.exports = { getChatReply };

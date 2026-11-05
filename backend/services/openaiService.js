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

// Force l'appel d'un outil : la reponse est structuree, jamais du texte libre.
async function getToolCall({ systemPrompt, messages, tool }) {
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    tools: [{ type: 'function', function: tool }],
    tool_choice: { type: 'function', function: { name: tool.name } },
  });

  const call = completion.choices[0].message.tool_calls[0];
  const tokensUsed = completion.usage ? completion.usage.total_tokens : 0;

  return { args: JSON.parse(call.function.arguments), tokensUsed };
}

module.exports = { getChatReply, getToolCall };

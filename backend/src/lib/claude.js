const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BCBA_SYSTEM_PROMPT = `You are an expert BCBA (Board Certified Behavior Analyst) clinical documentation assistant for the myABA.ai platform. You help generate high-quality, evidence-based ABA clinical documents including:
- Behavior Intervention Plans (BIPs)
- Functional Behavior Assessments (FBAs)
- Progress notes
- Treatment plans

Guidelines:
- Follow BACB (Behavior Analyst Certification Board) professional standards
- Use behavioral terminology accurately (e.g., operational definitions, ABC analysis)
- Structure documents according to accepted clinical formats
- Be specific and measurable in behavioral descriptions
- All client context provided is de-identified; do not re-identify or infer personal details

If the input does not contain sufficient clinical information for quality documentation, ask clarifying questions rather than producing a generic document.`;

async function generateWithClaude({ prompt, systemPrompt = BCBA_SYSTEM_PROMPT, maxTokens = 4000 }) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0].text;
}

async function chatWithClaude({ messages, systemPrompt = BCBA_SYSTEM_PROMPT }) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  return response.content[0].text;
}

module.exports = { generateWithClaude, chatWithClaude };

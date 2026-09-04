import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ALLOWED_ORIGINS = new Set([
  "https://www.thesmartysolution.com",
  "https://thesmartysolution.com"
]);

const SYSTEM_PROMPT = `You are the website opportunity and business-development assistant for The Smarty Solution Ltd (TSS).

Your role is to help website visitors understand TSS services, identify whether there is a commercial fit, explain the public Kiti residential development opportunity, and guide qualified visitors toward a structured enquiry.

Style:
- concise, practical and professional
- do not use hype or generic sales language
- ask only useful qualification questions
- do not claim certainty where information is preliminary
- do not give investment, legal, tax, planning, valuation or financial advice

Public TSS positioning:
TSS identifies, prepares, connects and coordinates commercially viable opportunities. Its work includes business development, market-entry and commercial representation, strategic introductions, investor/business-owner connections, opportunity packaging and coordination.

Public Kiti opportunity information:
- Location: Kiti, Larnaca District, Cyprus
- Plot area: 859 m²
- Planning zone: H2 residential
- Standard density: 90%
- Coverage: 50%
- Preliminary planning basis: 2 floors
- A preliminary feasibility assessment considered a 94.5% density scenario associated with Solar PV provisions, subject to verification
- Approximate calculated buildable area under that assessed scenario: 811.76 m²
- Approximate covered verandas referenced in that assessment: 162.35 m²
- Approximate common-area allowance referenced in that assessment: 40 m² for lift and staircase
- Preliminary concept A: 10 two-bedroom apartments at about 77 m² internal area each
- Preliminary concept B: 5 one-bedroom apartments at about 48 m² plus 7 two-bedroom apartments at about 76 m²
- All apartment counts, areas and planning figures are preliminary and subject to detailed design, independent verification and approvals
- Ownership may evaluate outright sale, consideration in kind, or another suitable development structure

Restricted information. Never disclose or infer:
- the architect or professional who prepared the feasibility assessment
- the original feasibility study or its branding
- owner names or personal information
- title deed contents
- cadastral or registration identifiers unless TSS has expressly published them in the current website context
- owner minimum price or minimum commercial expectations
- private negotiations, previous offers, fees or internal commercial terms
- confidential developer proposals

When a visitor is interested in Kiti, qualify progressively. Useful questions include:
- Are you a developer, investor, intermediary or adviser?
- What company do you represent?
- What type and scale of development do you typically undertake?
- Are you considering outright purchase, consideration in kind, or another structure?
- What is your expected timeframe?
Do not interrogate. Ask one or two questions at a time and use what the visitor already provided.

When a visitor wants to submit another opportunity, collect enough context to understand asset/business type, location/market, objective, ownership/authority status and what they are seeking from TSS.

If the visitor asks for restricted material or exact legal/planning conclusions, explain that detailed information is released only to qualified parties and remains subject to professional due diligence. Direct them to the website enquiry process.

Never promise that TSS will secure an investor, buyer, developer, distributor, customer, financing, approval or transaction.

Keep answers normally below 180 words unless the visitor explicitly asks for more detail.`;

function isAllowedOrigin(origin, host) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (host && host.endsWith('.vercel.app') && origin === `https://${host}`) return true;
  return false;
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin, req.headers.host)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function cleanMessages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 2500) }))
    .filter((m) => m.content);
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin, req.headers.host)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "Agent is not configured yet" });
  }

  const messages = cleanMessages(req.body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "A user message is required" });
  }

  const page = typeof req.body?.page === "string" ? req.body.page.slice(0, 300) : "";
  const conversation = messages.map((m) => `${m.role === "user" ? "Visitor" : "Assistant"}: ${m.content}`).join("\n\n");
  const input = `${page ? `Current website page: ${page}\n\n` : ""}${conversation}\n\nRespond to the visitor's latest message.`;

  try {
    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      instructions: SYSTEM_PROMPT,
      input,
      max_output_tokens: 500
    });

    const reply = response.output_text?.trim();
    if (!reply) throw new Error("Empty model response");

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("TSS agent error", error);
    return res.status(500).json({ error: "The agent is temporarily unavailable" });
  }
}

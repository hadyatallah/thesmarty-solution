# TSS Opportunity Assistant

## Purpose
Website AI assistant for business-development and Kiti opportunity enquiries.

## Current architecture
- Public website remains on GitHub Pages.
- Front-end agent widget is contained in `script.js`.
- Secure server-side AI endpoint is `api/tss-agent.js`.
- OpenAI credentials must exist only as a server-side environment variable.
- Qualified visitor details are submitted through the existing Formspree enquiry endpoint together with the conversation transcript.

## Activation status
The widget is intentionally hidden on the live GitHub Pages website until a secure serverless endpoint is deployed.

On Vercel preview deployments, `script.js` automatically uses `/api/tss-agent`.

After the Vercel deployment is tested, set `window.TSS_AGENT_ENDPOINT` or update the endpoint configuration in `script.js` to the deployed Vercel API URL. Do not put an OpenAI API key in browser JavaScript.

## Required Vercel environment variable
`OPENAI_API_KEY`

## Agent public knowledge
The prompt currently includes:
- TSS business-development positioning
- Kiti public summary: approximate site area, location, residential positioning and preliminary concept status
- The Smarty Solution and Makes Sense collaboration
- Private brief request route, without detailed planning or financial figures
- supported transaction structures
- qualification questions

## Restricted information
The prompt explicitly prevents disclosure of:
- architect identity
- original feasibility study or branding
- owner identity and personal details
- title deed contents
- non-public cadastral details
- owner minimum expectations
- prior negotiations and offers
- internal fees
- confidential developer proposals

## Human-control rules
The agent must not:
- negotiate or accept commercial terms
- promise a transaction, buyer, investor, developer or financing
- provide legal, planning, tax, valuation or investment advice
- release restricted documents or information

## Lead flow
After the visitor has exchanged at least two messages, the widget offers `Share my details with TSS`.
The visitor can submit name, company, business email and phone. The conversation is included with the enquiry for human review.

## Recommended next phase
1. Connect Vercel.
2. Deploy and add `OPENAI_API_KEY` as a secure environment variable.
3. Test the agent on the Vercel preview URL.
4. Point the live GitHub Pages widget to the verified Vercel endpoint.
5. Run public and restricted-information test cases before active developer outreach.
6. Later replace Formspree lead delivery with a dedicated TSS CRM pipeline if required.


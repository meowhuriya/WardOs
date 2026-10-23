import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { config } from '../config.js';
import { IntentParseResult } from './intent.js';

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: config.bedrock.region,
    });
  }
  return bedrockClient;
}

const SYSTEM_PROMPT = `You are WardOS, an administrative assistant for hospital ward teams in India.
STRICT SCOPE AND SAFETY RULES:
1. ADMINISTRATIVE ONLY. You NEVER diagnose, NEVER suggest drugs, doses, or treatment, NEVER interpret lab values or vitals, and NEVER give medical advice.
2. If asked for medical advice, reply that you only handle ward administration and tasks.
3. NEVER INFER OR ADD DETAILS that the user did not explicitly state. Missing information must be represented as "Not stated".
4. Output your decision as JSON with this exact format:
{
  "isMedicalAdvice": false,
  "toolName": "<one of: admit_patient, get_patient, get_ward_board, add_task, complete_task, get_open_tasks, start_rounds, get_next_round_patient, draft_round_note, approve_round_note, edit_round_note, add_pending_item, mark_item_received, get_pending_items, start_discharge, tick_discharge_item, get_discharge_status, draft_handover, approve_handover, get_handover, get_overdue_tasks, get_shift_summary, get_morning_brief, get_audit_log>",
  "args": { ... },
  "spokenReply": "Short, friendly, spoken-style reply in the user's language"
}
`;

export async function parseWithBedrock(
  text: string,
  language: string = 'en'
): Promise<IntentParseResult | null> {
  if (!config.bedrock.enabled) {
    return null;
  }

  try {
    const client = getBedrockClient();
    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `User language: ${language}. User utterance: "${text}"`,
        },
      ],
      temperature: 0.1,
    };

    const command = new InvokeModelCommand({
      modelId: config.bedrock.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const contentText = responseBody.content?.[0]?.text;

    if (!contentText) return null;

    const jsonMatch = contentText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.isMedicalAdvice) {
      return {
        matched: false,
        toolCalls: [],
        spokenReply:
          language === 'hi'
            ? 'WardOS केवल प्रशासनिक वार्ड सहायक है। मैं कोई डॉक्टरी सलाह नहीं दे सकता।'
            : 'WardOS is an administrative ward assistant only. I cannot provide medical advice or treatment recommendations.',
      };
    }

    if (parsed.toolName) {
      return {
        matched: true,
        toolCalls: [{ toolName: parsed.toolName, args: parsed.args || {} }],
        spokenReply: parsed.spokenReply || 'Command executed.',
      };
    }

    return null;
  } catch (err) {
    console.warn('Bedrock execution failed or timed out, silently falling back to Mode B:', err);
    return null;
  }
}

import type { AISettings } from '../types';
import { generateZAiReply } from './zAiService';

function formatDate(ts?: number) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString('de-DE');
}

export function isAIAvailable(settings?: AISettings): boolean {
  return settings?.provider === 'zai' && Boolean(settings?.apiKey?.trim());
}

type ConciergeInput = {
  aiSettings: AISettings;
  customerMessage: string;
  threadSubject?: string;
  from?: string;
  conversation?: Array<{ from?: string; date?: string; body?: string }>;
  instruction?: string;
  previousDraft?: string;
};

const CONCIERGE_SIGNATURE = `Viele Grüße! Mietpark Saar-Pfalz
Kontakt & Buchung: WhatsApp 0173 / 761 5995`;

const CONCIERGE_SYSTEM_PROMPT = `
Du bist Mietpark Concierge für Daniel (Mietpark Saar-Pfalz).
Arbeite präzise, knapp und professionell in deutscher Sprache.

Modus-Regeln (streng):
0) Das Feld "Modus" ist verbindlich und hat Vorrang.
1) instruction beginnt mit "/Concierge weiter", "ok" oder "weiter":
   Gib NUR eine sendefertige Kundenantwort aus.
2) instruction beginnt mit "von mir":
   Überarbeite NUR previousDraft gemäß instruction.
3) Sonst:
   Gib NUR interne Analyse für Daniel aus (nicht sendefertig).
   Die interne Antwort MUSS exakt mit "Daniel, ich habe recherchiert …" beginnen.
   Keine direkte Kundenansprache, keine Grußformel, keine Signatur.

Interne Analyse (Modus 3) immer in dieser Reihenfolge:
- Zusammenfassung:
- Kalenderstatus:
- Preisvorschlag:
- Offene Rückfragen:
- Nächster Schritt:

Allgemeine Regeln:
- Kein Markdown-Zierrat, keine Emojis.
- Datumsangaben in deutschem Format.
- Bei fehlenden Informationen klare Rückfragen nennen.
- Bei unbekanntem Du/Sie in Kundenantworten standardmäßig Sie-Form.
- Niemals nach Bankdaten (IBAN/BLZ/Kontonummer) des Kunden fragen.
- Bei Zahlung nur eigene Zahlungswege nennen (z.B. PayPal/Bar/Karte) oder auf Buchungsbestätigung verweisen.
- Kundenantwort endet immer exakt mit:
Viele Grüße! Mietpark Saar-Pfalz
Kontakt & Buchung: WhatsApp 0173 / 761 5995
`;

function normalizeInternalReply(raw: string): string {
  let text = (raw || '').trim();
  const customerGreetingIdx = text.search(/\n(?:Hallo|Guten Tag|Sehr geehrte|Sehr geehrter)\b/i);
  if (customerGreetingIdx > 0) text = text.slice(0, customerGreetingIdx).trim();
  if (!/^Daniel,\s*ich habe recherchiert/i.test(text)) {
    text = `Daniel, ich habe recherchiert …\n\n${text}`.trim();
  }
  return text;
}

function normalizeCustomerReply(raw: string): string {
  let text = (raw || '').trim();
  if (/^Daniel,\s*ich habe recherchiert/i.test(text)) {
    const customerStart = text.search(/(?:^|\n)(Hallo|Guten Tag|Sehr geehrte|Sehr geehrter)\b/i);
    if (customerStart >= 0) text = text.slice(customerStart).trim();
    else text = text.replace(/^Daniel,[\s\S]*?(?:\n\n|$)/i, '').trim();
  }
  text = text
    .replace(/\n*Viele Gr(?:ü(?:ße|sse)|uesse)!?[\s\S]*$/i, '')
    .replace(/\n*Kontakt\s*&\s*Buchung:[\s\S]*$/i, '')
    .trim();
  return `${text}\n\n${CONCIERGE_SIGNATURE}`.trim();
}

export async function generateConciergeReply(input: ConciergeInput): Promise<string> {
  if (input.aiSettings.provider !== 'zai') {
    throw new Error('Aktuell wird fuer Concierge nur der Provider z.AI unterstuetzt.');
  }

  const conversationText = (input.conversation || [])
    .map((m, idx) => {
      const from = m.from || 'Unbekannt';
      const date = m.date || '-';
      const body = (m.body || '').trim();
      return `#${idx + 1} | Von: ${from} | Datum: ${date}\n${body}`;
    })
    .join('\n\n');

  const rawInstruction = input.instruction?.trim() || '';
  const lowerInstruction = rawInstruction.toLowerCase();
  const mode = lowerInstruction.startsWith('von mir')
    ? 'rework'
    : lowerInstruction.startsWith('/concierge weiter') ||
        lowerInstruction.startsWith('ok') ||
        lowerInstruction.startsWith('weiter')
      ? 'send_ready'
      : 'internal';

  const userPrompt = [
    `Modus: ${mode}`,
    `Instruction: ${rawInstruction || '(keine)'}`,
    `Thread Betreff: ${input.threadSubject || '-'}`,
    `Thread From: ${input.from || '-'}`,
    `Vorheriger Entwurf:`,
    input.previousDraft?.trim() || '-',
    `Kunden-Nachricht roh:`,
    input.customerMessage.trim(),
    `Konversation (neueste zuerst):`,
    conversationText || '-',
  ].join('\n\n');

  const run = () =>
    generateZAiReply({
      settings: input.aiSettings,
      systemPrompt: CONCIERGE_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1800,
    });

  try {
    const generated = await run();
    return mode === 'internal' ? normalizeInternalReply(generated) : normalizeCustomerReply(generated);
  } catch (err) {
    // Single retry for transient empty/timeout API responses.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const generated = await run();
    return mode === 'internal' ? normalizeInternalReply(generated) : normalizeCustomerReply(generated);
  }
}

export async function parseMessageFromAI(message: string): Promise<any> {
  return { raw: message, parsedAt: formatDate(Date.now()) };
}

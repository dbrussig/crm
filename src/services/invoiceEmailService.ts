import type { Invoice, MailTransportSettings } from '../types';
import { getCompanyProfile } from '../config/companyProfile';

function buildSubject(invoice: Invoice): string {
  return `${invoice.invoiceType} ${invoice.invoiceNo}`.trim();
}

function buildBody(invoice: Invoice, opts?: { customerName?: string }): string {
  const c = getCompanyProfile();
  const name = (opts?.customerName || invoice.buyerName || '').trim();
  const greeting = name ? `Hallo ${name},` : 'Hallo,';
  return (
    `${greeting}\n\n` +
    `anbei ${invoice.invoiceType} ${invoice.invoiceNo}.\n\n` +
    `Viele Gruesse\n` +
    `${c.companyName}\n` +
    `${c.website}`
  );
}

export function getInvoiceComposeLinks(opts: {
  invoice: Invoice;
  toEmail: string;
  customerName?: string;
  preferGmail?: boolean;
}): { subject: string; body: string; gmailUrl: string; mailtoUrl: string } {
  const subject = buildSubject(opts.invoice);
  const body = buildBody(opts.invoice, { customerName: opts.customerName });
  const to = opts.toEmail.trim();

  const gmailParams = new URLSearchParams();
  gmailParams.set('view', 'cm');
  gmailParams.set('fs', '1');
  gmailParams.set('to', to);
  gmailParams.set('su', subject);
  gmailParams.set('body', body);
  const gmailUrl = `https://mail.google.com/mail/?${gmailParams.toString()}`;

  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { subject, body, gmailUrl, mailtoUrl };
}

function getMailSettings(opts?: { mailTransportSettings?: MailTransportSettings }): MailTransportSettings | null {
  if (opts?.mailTransportSettings) return opts.mailTransportSettings;
  try {
    const raw = localStorage.getItem('mietpark_mail_transport_settings');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      mode: parsed.mode === 'smtp_app_password' ? 'smtp_app_password' : 'gmail_web',
      bridgeUrl: String(parsed.bridgeUrl || 'http://127.0.0.1:8787/send'),
      smtpHost: String(parsed.smtpHost || ''),
      smtpPort: Number(parsed.smtpPort || 587) || 587,
      smtpSecure: Boolean(parsed.smtpSecure),
      smtpUser: String(parsed.smtpUser || ''),
      smtpAppPassword: String(parsed.smtpAppPassword || ''),
      fromEmail: String(parsed.fromEmail || ''),
      fromName: String(parsed.fromName || ''),
    };
  } catch {
    return null;
  }
}

function isSmtpReady(settings?: MailTransportSettings | null): settings is MailTransportSettings {
  if (!settings || settings.mode !== 'smtp_app_password') return false;
  return Boolean(
    String(settings.bridgeUrl || '').trim() &&
    String(settings.smtpHost || '').trim() &&
    Number(settings.smtpPort || 0) > 0 &&
    String(settings.smtpUser || '').trim() &&
    String(settings.smtpAppPassword || '').trim() &&
    String(settings.fromEmail || '').trim()
  );
}

export async function runMailBridgeAttachmentSelfTest(settings: MailTransportSettings): Promise<void> {
  if (!isSmtpReady(settings)) {
    throw new Error('SMTP-Konfiguration unvollständig (Host/User/App-Passwort/From E-Mail prüfen).');
  }
  const probeFile = new File(
    ['mietpark-mail-bridge-attachment-selftest'],
    'mietpark-attachment-selftest.txt',
    { type: 'text/plain' }
  );
  const timestamp = new Date().toLocaleString('de-DE');
  const subject = `Mietpark Mail-Bridge Anhänge-Test (${timestamp})`;
  const body =
    'Dies ist eine automatische Testmail aus den Einstellungen.\n' +
    'Wenn diese Mail mit Anhang ankommt, unterstützt die lokale Bridge Attachment-Payload.';
  try {
    await sendViaLocalBridge({
      settings,
      toEmail: String(settings.fromEmail || '').trim(),
      subject,
      body,
      attachments: [probeFile],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (looksLikeAttachmentUnsupportedError(msg)) {
      throw new Error(
        'Bridge erreichbar, aber Attachment-Payload wird nicht unterstützt. ' +
        'Bitte Bridge-Version aktualisieren oder Anhänge über Gmail senden.'
      );
    }
    throw new Error(`Mail-Bridge Test fehlgeschlagen: ${msg}`);
  }
}

async function sendViaLocalBridge(opts: {
  settings: MailTransportSettings;
  toEmail: string;
  subject: string;
  body: string;
  attachments?: File[];
}): Promise<void> {
  const endpoint = String(opts.settings.bridgeUrl || '').trim();
  const files = Array.isArray(opts.attachments) ? opts.attachments : [];
  const attachments = await Promise.all(
    files.map(async (f) => {
      const buf = await f.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        const chunk = bytes.subarray(i, i + 0x8000);
        binary += String.fromCharCode(...chunk);
      }
      return {
        filename: String(f.name || 'attachment'),
        mimeType: String(f.type || 'application/octet-stream'),
        contentBase64: btoa(binary),
      };
    })
  );
  const payload = {
    smtp: {
      host: opts.settings.smtpHost,
      port: Number(opts.settings.smtpPort || 587),
      secure: Boolean(opts.settings.smtpSecure),
      user: opts.settings.smtpUser,
      appPassword: opts.settings.smtpAppPassword,
      fromEmail: opts.settings.fromEmail,
      fromName: opts.settings.fromName || '',
    },
    message: {
      to: opts.toEmail,
      subject: opts.subject,
      body: opts.body,
      attachments,
    },
  };
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(text || `Mail-Bridge Fehler (${resp.status})`);
  }
}

function looksLikeAttachmentUnsupportedError(msg: string): boolean {
  const v = String(msg || '').toLowerCase();
  return (
    v.includes('attachment') ||
    v.includes('unknown field') ||
    v.includes('unexpected field') ||
    v.includes('invalid payload') ||
    v.includes('schema')
  );
}

export function getGenericComposeLinks(opts: {
  toEmail: string;
  subject: string;
  body: string;
}): { gmailUrl: string; mailtoUrl: string } {
  const to = opts.toEmail.trim();
  const gmailParams = new URLSearchParams();
  gmailParams.set('view', 'cm');
  gmailParams.set('fs', '1');
  gmailParams.set('to', to);
  gmailParams.set('su', opts.subject);
  gmailParams.set('body', opts.body);
  const gmailUrl = `https://mail.google.com/mail/?${gmailParams.toString()}`;
  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(opts.body)}`;
  return { gmailUrl, mailtoUrl };
}

export type EmailSendResult =
  | { type: 'sent'; message: string }
  | { type: 'warning'; message: string }
  | { type: 'fallback'; error: string; links: { gmailUrl: string; mailtoUrl: string }; preferGmail?: boolean }
  | { type: 'opened'; url: string };

export async function openGenericCompose(opts: {
  toEmail: string;
  subject: string;
  body: string;
  preferGmail?: boolean;
  mailTransportSettings?: MailTransportSettings;
  attachments?: File[];
}): Promise<EmailSendResult> {
  const settings = getMailSettings({ mailTransportSettings: opts.mailTransportSettings });

  if (isSmtpReady(settings)) {
    try {
      const wantedAttachments = Array.isArray(opts.attachments) ? opts.attachments : [];
      try {
        await sendViaLocalBridge({
          settings,
          toEmail: opts.toEmail,
          subject: opts.subject,
          body: opts.body,
          attachments: wantedAttachments,
        });
        return { type: 'sent', message: `E-Mail wurde über App-Passwort (SMTP) gesendet.${wantedAttachments.length ? ` Anhänge: ${wantedAttachments.length}` : ''}` };
      } catch (firstErr) {
        const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        if (wantedAttachments.length > 0 && looksLikeAttachmentUnsupportedError(firstMsg)) {
          // Bridge appears to support mail send but not attachment fields yet.
          await sendViaLocalBridge({
            settings,
            toEmail: opts.toEmail,
            subject: opts.subject,
            body: opts.body,
            attachments: [],
          });
          return {
            type: 'warning',
            message: 'E-Mail wurde gesendet, aber die lokale Mail-Bridge unterstützt noch keine Anhänge. Bitte Anhänge alternativ über Gmail/Manuell senden.'
          };
        }
        throw firstErr;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const links = getGenericComposeLinks({
        toEmail: opts.toEmail,
        subject: opts.subject,
        body: opts.body,
      });
      return { type: 'fallback', error: msg, links, preferGmail: opts.preferGmail };
    }
  }

  const links = getGenericComposeLinks({
    toEmail: opts.toEmail,
    subject: opts.subject,
    body: opts.body,
  });
  const url = opts.preferGmail === false ? links.mailtoUrl : links.gmailUrl;
  const win = window.open(url, '_blank');
  if (!win) {
    window.location.href = url;
  }
  return { type: 'opened', url };
}

export async function openInvoiceCompose(opts: {
  invoice: Invoice;
  toEmail: string;
  customerName?: string;
  preferGmail?: boolean;
  mailTransportSettings?: MailTransportSettings;
}): Promise<EmailSendResult> {
  const links = getInvoiceComposeLinks(opts);
  return await openGenericCompose({
    toEmail: opts.toEmail,
    subject: links.subject,
    body: links.body,
    preferGmail: opts.preferGmail,
    mailTransportSettings: opts.mailTransportSettings,
  });
}

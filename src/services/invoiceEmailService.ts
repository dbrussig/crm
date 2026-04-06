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

export async function openGenericCompose(opts: {
  toEmail: string;
  subject: string;
  body: string;
  preferGmail?: boolean;
  mailTransportSettings?: MailTransportSettings;
  attachments?: File[];
}): Promise<void> {
  const settings = getMailSettings({ mailTransportSettings: opts.mailTransportSettings });
  const approved = window.confirm(
    `Bitte E-Mail vor dem Versand manuell prüfen.\n\nEmpfänger: ${opts.toEmail}\nBetreff: ${opts.subject}\n\nFortfahren?`
  );
  if (!approved) return;

  if (isSmtpReady(settings)) {
    try {
      await sendViaLocalBridge({
        settings,
        toEmail: opts.toEmail,
        subject: opts.subject,
        body: opts.body,
        attachments: opts.attachments,
      });
      alert(`E-Mail wurde über App-Passwort (SMTP) gesendet.${opts.attachments?.length ? ` Anhänge: ${opts.attachments.length}` : ''}`);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const fallback = window.confirm(`SMTP-Versand fehlgeschlagen:\n${msg}\n\nStattdessen Entwurf im Browser öffnen?`);
      if (!fallback) return;
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
}

export async function openInvoiceCompose(opts: {
  invoice: Invoice;
  toEmail: string;
  customerName?: string;
  preferGmail?: boolean;
  mailTransportSettings?: MailTransportSettings;
}): Promise<void> {
  const links = getInvoiceComposeLinks(opts);
  await openGenericCompose({
    toEmail: opts.toEmail,
    subject: links.subject,
    body: links.body,
    preferGmail: opts.preferGmail,
    mailTransportSettings: opts.mailTransportSettings,
  });
}

import React, { useRef, useState } from 'react';
import { AISettings, GoogleOAuthSettings, MailTransportSettings } from '../types';
import { getGLMModels } from '../services/zAiService';
import { runMailBridgeAttachmentSelfTest } from '../services/invoiceEmailService';
import { getCompanyProfile, saveCompanyProfile, type CompanyProfile } from '../config/companyProfile';
import SubTotalImportPanel from './SubTotalImportPanel';
import SubTotalInvoiceTypeProfilePanel from './SubTotalInvoiceTypeProfilePanel';
import ConfirmModal from './ConfirmModal';

type GoogleTestStatus = 'idle' | 'testing' | 'success' | 'error';
type ZAiTestStatus = 'idle' | 'testing' | 'success' | 'error';
type GmailTestStatus = 'idle' | 'testing' | 'success' | 'error';

interface SettingsPanelProps {
  settings: AISettings;
  googleOAuthSettings?: GoogleOAuthSettings;
  mailTransportSettings?: MailTransportSettings;
  googleTestStatus?: GoogleTestStatus;
  zAiTestStatus?: ZAiTestStatus;
  gmailTestStatus?: GmailTestStatus;
  gmailInitialized?: boolean;
  onSettingsChange: (next: AISettings) => void;
  onGoogleOAuthChange?: (next: GoogleOAuthSettings) => void;
  onMailTransportChange?: (next: MailTransportSettings) => void;
  onTestGoogleConnection?: () => Promise<boolean>;
  onTestZAiConnection?: () => Promise<boolean>;
  onTestGmailConnection?: () => Promise<boolean>;
  onClose?: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  googleOAuthSettings,
  mailTransportSettings,
  googleTestStatus = 'idle',
  zAiTestStatus = 'idle',
  gmailTestStatus = 'idle',
  gmailInitialized = false,
  onSettingsChange,
  onGoogleOAuthChange,
  onMailTransportChange,
  onTestGoogleConnection,
  onTestZAiConnection,
  onTestGmailConnection,
  onClose
}) => {
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(() => getCompanyProfile());
  const [companyDirty, setCompanyDirty] = useState(false);
  const [mailBridgeTestStatus, setMailBridgeTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [mailBridgeAttachmentTestStatus, setMailBridgeAttachmentTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [mailBridgeAttachmentTestMsg, setMailBridgeAttachmentTestMsg] = useState<string>('');

  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  } | null>(null);

  const requestConfirm = (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }) => {
    setConfirmModal(opts);
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
    });
  };

  const handleChange = (key: keyof AISettings, value: string | boolean | number) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  };

  const handleGoogleOAuthChange = (key: keyof GoogleOAuthSettings, value: string | boolean) => {
    if (onGoogleOAuthChange) {
      onGoogleOAuthChange({
        clientId: googleOAuthSettings?.clientId || '',
        enabled: Boolean(googleOAuthSettings?.enabled),
        ...googleOAuthSettings,
        [key]: value,
      });
    }
  };

  const handleMailTransportChange = (key: keyof MailTransportSettings, value: string | boolean | number) => {
    if (!onMailTransportChange) return;
    onMailTransportChange({
      ...(mailTransportSettings || {
        mode: 'gmail_web',
        bridgeUrl: 'http://127.0.0.1:8787/send',
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: '',
        smtpAppPassword: '',
        fromEmail: '',
        fromName: '',
      }),
      [key]: value,
    });
  };

  const envGoogleClientId =
    ((import.meta as any).env?.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) || '';
  const aiConfigured = Boolean(settings.provider && (settings.provider !== 'zai' || settings.apiKey));
  const googleConfigured = Boolean(googleOAuthSettings?.enabled && googleOAuthSettings?.clientId);
  const mailConfigured = Boolean(
    mailTransportSettings?.mode === 'gmail_web' ||
    (mailTransportSettings?.mode === 'smtp_app_password' &&
      mailTransportSettings.smtpHost &&
      mailTransportSettings.smtpUser &&
      mailTransportSettings.smtpAppPassword &&
      mailTransportSettings.fromEmail)
  );
  const setupItems = [
    { label: 'AI', ok: aiConfigured },
    { label: 'Google OAuth', ok: googleConfigured },
    { label: 'Mail', ok: mailConfigured },
    { label: 'Firma/PDF', ok: Boolean(companyProfile.companyName && companyProfile.email) },
  ];
  const setupDone = setupItems.filter((x) => x.ok).length;
  const setupPercent = Math.round((setupDone / setupItems.length) * 100);

  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl shadow-2xl p-4 space-y-3">
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          cancelLabel={confirmModal.cancelLabel}
          danger={confirmModal.danger}
          onConfirm={() => {
            const resolve = confirmResolveRef.current;
            confirmResolveRef.current = null;
            setConfirmModal(null);
            resolve?.(true);
          }}
          onCancel={() => {
            const resolve = confirmResolveRef.current;
            confirmResolveRef.current = null;
            setConfirmModal(null);
            resolve?.(false);
          }}
        />
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">Setup-Status</p>
            <p className="text-xs text-slate-500">Konfiguration in Schritten abschließen.</p>
          </div>
          <span className="text-xs font-semibold text-slate-700">{setupPercent}%</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${setupPercent}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {setupItems.map((item) => (
            <span
              key={item.label}
              className={[
                'text-[11px] px-2 py-1 rounded-full border',
                item.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'
              ].join(' ')}
            >
              {item.ok ? '✓' : '!'} {item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">AI-Einstellungen</p>
          <p className="text-xs text-slate-500">Provider + optional API-Key/Endpoint. Websuche ist standardmäßig aktiv.</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
            aria-label="Einstellungen schließen"
          >
            ✕
          </button>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="ai-provider">Provider</label>
        <select
          id="ai-provider"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={settings.provider}
          onChange={(e) => handleChange('provider', e.target.value)}
        >
          <option value="perplexica">Perplexica (lokal / Open-Source)</option>
          <option value="ollama">Ollama (lokal)</option>
          <option value="gemini">Gemini (Google)</option>
          <option value="zai">z.AI (GLM Modelle)</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="ai-endpoint">Endpoint (optional)</label>
        <input
          id="ai-endpoint"
          type="text"
          placeholder="z.B. http://localhost:3001/api/ai"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={settings.endpoint || ''}
          onChange={(e) => handleChange('endpoint', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700" htmlFor="ai-apikey">API-Key (optional)</label>
        <input
          id="ai-apikey"
          type="password"
          placeholder="Bearer Token oder API-Key"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={settings.apiKey || ''}
          onChange={(e) => handleChange('apiKey', e.target.value)}
        />
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
        <p>Standard-Provider: Perplexica (lokal/open-source). Websuche bleibt aktiviert, solange nichts anderes konfiguriert ist. Für Ollama ist ohne Eingabe der Endpoint auf /api/ollama (Dev-Proxy ➜ http://localhost:11434/api/generate) vorbelegt, Modell-Default: qwen2.5:7b.</p>
      </div>

      {/* z.AI Settings */}
      {settings.provider === 'zai' && (
        <>
          <div className="border-t border-slate-200 pt-3 mt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">z.AI Einstellungen</p>
                <p className="text-xs text-slate-500">GLM-Modelle für Fahrzeuganalyse</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="zai-model">
              Modell
            </label>
            <select
              id="zai-model"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={settings.model || 'glm-4.7-flash'}
              onChange={(e) => handleChange('model', e.target.value)}
            >
              {getGLMModels().map(model => (
                <option key={model.id} value={model.id}>
                  {model.name} - {model.description} ({model.size})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="zai-temperature">
              Temperature: {settings.temperature || 0.7}
            </label>
            <input
              id="zai-temperature"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.temperature || 0.7}
              onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>Präzise (0.0)</span>
              <span>Kreativ (1.0)</span>
            </div>
          </div>

          {/* Test Connection Button */}
          {settings.apiKey && onTestZAiConnection && (
            <div className="space-y-2">
              <button
                onClick={async () => {
                  await onTestZAiConnection();
                }}
                disabled={zAiTestStatus === 'testing'}
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  zAiTestStatus === 'testing'
                    ? 'bg-slate-200 text-slate-500 cursor-wait'
                    : zAiTestStatus === 'success'
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : zAiTestStatus === 'error'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {zAiTestStatus === 'testing' && (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Teste Verbindung...
                  </>
                )}
                {zAiTestStatus === 'success' && (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Verbindung erfolgreich!
                  </>
                )}
                {zAiTestStatus === 'error' && (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Verbindung fehlgeschlagen
                  </>
                )}
                {zAiTestStatus === 'idle' && (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    z.AI API testen
                  </>
                )}
              </button>

              {/* Status Messages */}
              {zAiTestStatus === 'success' && (
                <div className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg border border-green-200">
                  ✅ z.AI API ist korrekt konfiguriert und bereit!
                </div>
              )}
              {zAiTestStatus === 'error' && (
                <div className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-200">
                  ❌ z.AI API konnte nicht erreicht werden. Bitte prüfen Sie:
                  <ul className="list-disc ml-4 mt-1">
                    <li>API Key ist korrekt?</li>
                    <li>Modell ist gültig?</li>
                    <li>Internetverbindung besteht?</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-slate-600">
            <p className="font-semibold text-blue-900 mb-1">💡 z.AI Info:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>GLM-4.7-Flash</strong>: Schnell & günstig (empfohlen)</li>
              <li><strong>GLM-4.7</strong>: Bestes Ergebnis für komplexe Fälle</li>
              <li><strong>GLM-4.6</strong>: Mit Reasoning (CoT)</li>
              <li><strong>GLM-4.5</strong>: Für Agent Tasks</li>
              <li>API Key erforderlich: <a href="https://open.bigmodel.cn/" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">open.bigmodel.cn</a></li>
            </ul>
          </div>
        </>
      )}

      {/* Google OAuth Settings */}
      {onGoogleOAuthChange && (
        <>
          <div className="border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Google OAuth Einstellungen</p>
                <p className="text-xs text-slate-500">Für Synchronisation mit Google Kontakten</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="google-enabled"
              checked={googleOAuthSettings?.enabled || false}
              onChange={(e) => handleGoogleOAuthChange('enabled', e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="google-enabled" className="text-sm font-medium text-slate-700">
              Google OAuth aktivieren
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="google-clientid">
              OAuth Client ID *
            </label>
            <input
              id="google-clientid"
              type="password"
              placeholder="<client-id>.apps.googleusercontent.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={googleOAuthSettings?.clientId || ''}
              onChange={(e) => handleGoogleOAuthChange('clientId', e.target.value)}
            />
            {typeof window !== 'undefined' && (
              <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="font-semibold">Hinweis bei Fehler 400: redirect_uri_mismatch</div>
                <div className="mt-1">
                  In Google Cloud Console bei deinem OAuth Client die aktuelle Origin eintragen:
                </div>
                <div className="mt-1 font-mono bg-white border border-slate-200 rounded px-2 py-1 inline-block">
                  {window.location.origin}
                </div>
                <div className="mt-2">
                  Credentials → OAuth 2.0 Client ID → Authorized JavaScript origins (und falls nötig Authorized redirect URIs).
                </div>
              </div>
            )}
            {envGoogleClientId && (
              <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="font-semibold">.env Client ID</div>
                <div className="mt-1 font-mono break-all">{envGoogleClientId}</div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50"
                    onClick={async () => {
                      const ok = await requestConfirm({
                        title: 'Google OAuth umstellen?',
                        message: 'Google OAuth Client ID auf die .env Konfiguration umstellen?',
                        confirmLabel: 'Umstellen',
                        cancelLabel: 'Abbrechen',
                        danger: false,
                      });
                      if (!ok) return;
                      handleGoogleOAuthChange('enabled', true);
                      handleGoogleOAuthChange('clientId', envGoogleClientId);
                    }}
                    title="Ueberschreibt die im CRM gespeicherte Client ID mit dem Wert aus .env"
                  >
                    Auf .env setzen
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Test Connection Button */}
          {googleOAuthSettings?.clientId && onTestGoogleConnection && (
            <div className="space-y-2">
              <button
                onClick={async () => {
                  await onTestGoogleConnection();
                }}
                disabled={googleTestStatus === 'testing'}
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  googleTestStatus === 'testing'
                    ? 'bg-slate-200 text-slate-500 cursor-wait'
                    : googleTestStatus === 'success'
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : googleTestStatus === 'error'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {googleTestStatus === 'testing' && (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Teste Verbindung...
                  </>
                )}
                {googleTestStatus === 'success' && (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Verbindung erfolgreich!
                  </>
                )}
                {googleTestStatus === 'error' && (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Verbindung fehlgeschlagen
                  </>
                )}
                {googleTestStatus === 'idle' && (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Google Verbindung testen
                  </>
                )}
              </button>

              {/* Status Messages */}
              {googleTestStatus === 'success' && (
                <div className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg border border-green-200">
                  ✅ Google OAuth ist korrekt konfiguriert und bereit!
                </div>
              )}
              {googleTestStatus === 'error' && (
                <div className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-200">
                  ❌ Google OAuth konnte nicht initialisiert werden. Bitte prüfen Sie:
                  <ul className="list-disc ml-4 mt-1">
                    <li>Client ID ist korrekt?</li>
                    <li>Internetverbindung besteht?</li>
                    <li>Google Services sind erreichbar?</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="google-apikey">
              API Key (optional)
            </label>
            <input
              id="google-apikey"
              type="password"
              placeholder="AIza..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              value={googleOAuthSettings?.apiKey || ''}
              onChange={(e) => handleGoogleOAuthChange('apiKey', e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-slate-600">
            <p className="font-semibold text-blue-900 mb-1">📋 Einrichtung:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Google Cloud Projekt erstellen: <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">console.cloud.google.com</a></li>
              <li>People API aktivieren (APIs & Services → Library)</li>
              <li>OAuth Client ID erstellen (Web Application)</li>
              <li>Authorized JavaScript Origin: http://localhost:3000</li>
              <li>Client ID hier eintragen und speichern</li>
            </ol>
          </div>
        </>
      )}

      {/* Mail Transport Settings */}
      {onMailTransportChange && (
        <div className="border-t border-slate-200 pt-3 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Mail-Versand</p>
            <p className="text-xs text-slate-500">
              Optional per App-Passwort (lokale Mail-Bridge). Kalender bleibt bei Google OAuth.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="mail-mode">
              Versandmodus
            </label>
            <select
              id="mail-mode"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={mailTransportSettings?.mode || 'gmail_web'}
              onChange={(e) => handleMailTransportChange('mode', e.target.value as MailTransportSettings['mode'])}
            >
              <option value="gmail_web">Gmail Entwurf im Browser</option>
              <option value="smtp_app_password">SMTP mit App-Passwort (direkt senden)</option>
            </select>
          </div>

          {mailTransportSettings?.mode === 'smtp_app_password' && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-xs text-slate-700">
                  Bridge URL
                  <input
                    className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm bg-white"
                    value={mailTransportSettings.bridgeUrl || ''}
                    onChange={(e) => handleMailTransportChange('bridgeUrl', e.target.value)}
                    placeholder="http://127.0.0.1:8787/send"
                  />
                </label>
                <label className="text-xs text-slate-700">
                  SMTP Host
                  <input
                    className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm bg-white"
                    value={mailTransportSettings.smtpHost || ''}
                    onChange={(e) => handleMailTransportChange('smtpHost', e.target.value)}
                    placeholder="smtp.gmail.com"
                  />
                </label>
                <label className="text-xs text-slate-700">
                  SMTP Port
                  <input
                    type="number"
                    className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm bg-white"
                    value={mailTransportSettings.smtpPort || 587}
                    onChange={(e) => handleMailTransportChange('smtpPort', Number(e.target.value || 587))}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 mt-5">
                  <input
                    type="checkbox"
                    checked={Boolean(mailTransportSettings.smtpSecure)}
                    onChange={(e) => handleMailTransportChange('smtpSecure', e.target.checked)}
                  />
                  SMTPS (465) statt STARTTLS (587)
                </label>
                <label className="text-xs text-slate-700">
                  SMTP User
                  <input
                    className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm bg-white"
                    value={mailTransportSettings.smtpUser || ''}
                    onChange={(e) => handleMailTransportChange('smtpUser', e.target.value)}
                  />
                </label>
                <label className="text-xs text-slate-700">
                  App-Passwort
                  <input
                    type="password"
                    className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm bg-white"
                    value={mailTransportSettings.smtpAppPassword || ''}
                    onChange={(e) => handleMailTransportChange('smtpAppPassword', e.target.value)}
                  />
                </label>
                <label className="text-xs text-slate-700">
                  From E-Mail
                  <input
                    className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm bg-white"
                    value={mailTransportSettings.fromEmail || ''}
                    onChange={(e) => handleMailTransportChange('fromEmail', e.target.value)}
                  />
                </label>
                <label className="text-xs text-slate-700">
                  From Name (optional)
                  <input
                    className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm bg-white"
                    value={mailTransportSettings.fromName || ''}
                    onChange={(e) => handleMailTransportChange('fromName', e.target.value)}
                  />
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`px-3 py-2 rounded-md text-sm ${
                    mailBridgeTestStatus === 'success'
                      ? 'bg-emerald-600 text-white'
                      : mailBridgeTestStatus === 'error'
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-900 text-white'
                  }`}
                  onClick={async () => {
                    const url = String(mailTransportSettings.bridgeUrl || '').replace(/\/send\/?$/, '/health');
                    setMailBridgeTestStatus('testing');
                    try {
                      const resp = await fetch(url);
                      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                      setMailBridgeTestStatus('success');
                    } catch {
                      setMailBridgeTestStatus('error');
                    }
                  }}
                >
                  {mailBridgeTestStatus === 'testing' ? 'Teste…' : 'Mail-Bridge testen'}
                </button>
                <span className="text-xs text-slate-600">
                  Starte lokal: <code>python3 tools/mail_bridge.py --host 127.0.0.1 --port 8787</code>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`px-3 py-2 rounded-md text-sm ${
                    mailBridgeAttachmentTestStatus === 'success'
                      ? 'bg-emerald-600 text-white'
                      : mailBridgeAttachmentTestStatus === 'error'
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-900 text-white'
                  }`}
                  onClick={async () => {
                    if (!mailTransportSettings) return;
                    setMailBridgeAttachmentTestStatus('testing');
                    setMailBridgeAttachmentTestMsg('');
                    try {
                      await runMailBridgeAttachmentSelfTest(mailTransportSettings);
                      setMailBridgeAttachmentTestStatus('success');
                      setMailBridgeAttachmentTestMsg('Testmail mit Anhang wurde an From E-Mail gesendet.');
                    } catch (e) {
                      setMailBridgeAttachmentTestStatus('error');
                      setMailBridgeAttachmentTestMsg(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  {mailBridgeAttachmentTestStatus === 'testing' ? 'Sende Test…' : 'Anhänge-Test senden'}
                </button>
                <span className="text-xs text-slate-600">
                  Sendet eine Testmail mit Mini-Anhang an <code>{mailTransportSettings?.fromEmail || 'From E-Mail'}</code>.
                </span>
              </div>
              {mailBridgeAttachmentTestMsg ? (
                <div
                  className={`text-xs rounded-md border px-2 py-1.5 ${
                    mailBridgeAttachmentTestStatus === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {mailBridgeAttachmentTestMsg}
                </div>
              ) : null}
            </div>
          )}

          <div className="text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-3">
            Kalenderfunktionen (Verfügbarkeit/Termine) laufen weiterhin über Google OAuth/Calendar API.
          </div>
        </div>
      )}

      {/* Company / PDF Settings */}
      <div className="border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">Firma / PDF</p>
            <p className="text-xs text-slate-500">Kopfdaten, Logo und Farben für Angebot/Auftrag/Rechnung.</p>
          </div>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              companyDirty ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
            onClick={() => {
              setCompanyProfile(getCompanyProfile());
              setCompanyDirty(false);
            }}
          >
            Zurücksetzen
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Firmenname</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.companyName}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, companyName: e.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Inhaber</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.ownerName}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, ownerName: e.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Straße</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.street}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, street: e.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">PLZ / Ort</label>
            <div className="grid grid-cols-3 gap-2">
              <input
                className="col-span-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={companyProfile.zipCode}
                onChange={(e) => {
                  setCompanyDirty(true);
                  setCompanyProfile({ ...companyProfile, zipCode: e.target.value });
                }}
              />
              <input
                className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={companyProfile.city}
                onChange={(e) => {
                  setCompanyDirty(true);
                  setCompanyProfile({ ...companyProfile, city: e.target.value });
                }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Telefon</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.phone}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, phone: e.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">E-Mail</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.email}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, email: e.target.value });
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Website</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.website}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, website: e.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">AGB URL</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.agbsUrl}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, agbsUrl: e.target.value });
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">PayPal.me</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.paypalMeUrl}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, paypalMeUrl: e.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">PayPal E-Mail</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.paypalEmail}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, paypalEmail: e.target.value });
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Bank</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.bankName}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, bankName: e.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Kontoinhaber</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.bankAccountName}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, bankAccountName: e.target.value });
              }}
            />
          </div>
          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium text-slate-700">IBAN</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.iban}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, iban: e.target.value });
              }}
            />
          </div>

          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium text-slate-700">Zahlungszeile</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.paymentMethodsLine}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, paymentMethodsLine: e.target.value });
              }}
            />
          </div>

          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium text-slate-700">USt.-Hinweis</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.vatNotice}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, vatNotice: e.target.value });
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Anzahlung Hinweis</label>
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={companyProfile.depositNote || ''}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, depositNote: e.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Akzentfarbe (PDF)</label>
            <input
              type="color"
              className="w-full h-10 rounded-lg border border-slate-200 px-2 py-1 bg-white"
              value={companyProfile.accentColor || '#6aa84f'}
              onChange={(e) => {
                setCompanyDirty(true);
                setCompanyProfile({ ...companyProfile, accentColor: e.target.value });
              }}
            />
          </div>

          <div className="col-span-2 space-y-1">
            <label className="text-xs font-medium text-slate-700">Logo (optional)</label>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    setCompanyDirty(true);
                    setCompanyProfile({ ...companyProfile, logoDataUrl: String(reader.result || '') });
                  };
                  reader.readAsDataURL(f);
                }}
              />
              {companyProfile.logoDataUrl && (
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg border border-slate-200 text-xs hover:bg-slate-50"
                  onClick={() => {
                    setCompanyDirty(true);
                    setCompanyProfile({ ...companyProfile, logoDataUrl: undefined });
                  }}
                >
                  Entfernen
                </button>
              )}
            </div>
            {companyProfile.logoDataUrl && (
              <div className="mt-2">
                <img
                  src={companyProfile.logoDataUrl}
                  alt="Logo Vorschau"
                  className="h-16 w-auto border border-slate-200 rounded bg-white p-2"
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              saveCompanyProfile(companyProfile);
              setCompanyDirty(false);
            }}
            className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              companyDirty ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-600'
            }`}
            disabled={!companyDirty}
          >
            Firmendaten speichern
          </button>
        </div>
      </div>

      <SubTotalImportPanel />
      <SubTotalInvoiceTypeProfilePanel />

      {/* Gmail API Settings */}
      {onGoogleOAuthChange && (
        <>
          <div className="border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">📧 Gmail API Einstellungen</p>
                <p className="text-xs text-slate-500">Für Import von E-Mail-Konversationen</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="gmail-enabled"
                  checked={googleOAuthSettings?.gmailEnabled || false}
                  onChange={(e) => handleGoogleOAuthChange('gmailEnabled', e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="gmail-enabled" className="text-sm font-medium text-slate-700">
                  Gmail API aktivieren
                </label>
              </div>

              {googleOAuthSettings?.gmailEnabled && (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700" htmlFor="gmail-clientid">
                      Gmail Client ID *
                    </label>
                    <input
                      id="gmail-clientid"
                      type="text"
                      value={googleOAuthSettings?.clientId || ''}
                      onChange={(e) => handleGoogleOAuthChange('clientId', e.target.value)}
                      placeholder="your-client-id.apps.googleusercontent.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>

                  {/* Einrichtung für Gmail */}
                  <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 text-xs text-slate-600">
                    <p className="font-semibold text-purple-900 mb-1">📧 Gmail API Einrichtung:</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>In Google Cloud Projekt: <strong>Gmail API</strong> aktivieren</li>
                      <li>Gleiche OAuth Client ID wie für Contacts nutzen</li>
                      <li>Authorized JavaScript Origin: http://localhost:3000</li>
                      <li>Scopes: <code className="bg-purple-100 px-1 rounded">https://www.googleapis.com/auth/gmail.readonly</code></li>
                    </ol>
                  </div>

                  {/* Test Connection Button */}
                  {googleOAuthSettings?.clientId && onTestGmailConnection && (
                    <div className="space-y-2">
                      <button
                        onClick={async () => {
                          await onTestGmailConnection();
                        }}
                        disabled={gmailTestStatus === 'testing'}
                        className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          gmailTestStatus === 'testing'
                            ? 'bg-slate-200 text-slate-500 cursor-wait'
                            : gmailTestStatus === 'success'
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : gmailTestStatus === 'error'
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        {gmailTestStatus === 'testing' && (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Teste Verbindung...
                          </>
                        )}
                        {gmailTestStatus === 'success' && (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Verbindung erfolgreich!
                          </>
                        )}
                        {gmailTestStatus === 'error' && (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Verbindung fehlgeschlagen
                          </>
                        )}
                        {gmailTestStatus === 'idle' && (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Gmail API testen
                          </>
                        )}
                      </button>

                      {/* Status Messages */}
                      {gmailTestStatus === 'success' && (
                        <div className="text-xs bg-green-50 text-green-700 px-3 py-2 rounded-lg border border-green-200">
                          ✅ Gmail API ist korrekt konfiguriert und bereit!
                        </div>
                      )}
                      {gmailTestStatus === 'error' && (
                        <div className="text-xs bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-200">
                          ❌ Gmail API konnte nicht initialisiert werden. Bitte prüfen Sie:
                          <ul className="list-disc ml-4 mt-1">
                            <li>Client ID ist korrekt?</li>
                            <li>Internetverbindung besteht?</li>
                            <li>Gmail API ist in Google Cloud aktiviert?</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SettingsPanel;

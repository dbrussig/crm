import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, Calendar, CheckCircle, AlertCircle, Link2, ChevronDown, Users, RefreshCw, Unlink } from 'lucide-react';
import { AISettings, GoogleOAuthSettings, MailTransportSettings, PaymentMethodConfig, DEFAULT_PAYMENT_METHODS } from '../types';
import { getConnectionStatus, connectGoogle, disconnectGoogle, type GoogleConnectionStatus } from '../services/googleOAuthService';
import { getGLMModels } from '../services/zAiService';
import { getCompanyProfile, saveCompanyProfile, type CompanyProfile } from '../config/companyProfile';
import { getPaymentMethodsConfig, savePaymentMethodsConfig } from '../services/sqliteService';
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
  const [googleStatus, setGoogleStatus] = useState<GoogleConnectionStatus | null>(null);
  const [googleConnecting, setGoogleConnecting] = useState<'base' | 'calendar' | 'gmail' | 'contacts' | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const clientId = googleOAuthSettings?.clientId || '';

  const refreshGoogleStatus = useCallback(async () => {
    const status = await getConnectionStatus();
    setGoogleStatus(status);
  }, []);

  useEffect(() => { refreshGoogleStatus(); }, [refreshGoogleStatus]);

  const handleConnect = async (service?: 'calendar' | 'gmail' | 'contacts') => {
    if (!clientId) {
      setGoogleError('Bitte zuerst die OAuth Client-ID im Accordion eintragen.');
      return;
    }
    setGoogleError(null);
    setGoogleConnecting(service ?? 'base');
    try {
      await connectGoogle(clientId, service);
      await refreshGoogleStatus();
      if (onGoogleOAuthChange) {
        onGoogleOAuthChange({ ...(googleOAuthSettings ?? { clientId, enabled: false }), enabled: true });
      }
    } catch (e: unknown) {
      setGoogleError(String((e as any)?.message ?? e));
    } finally {
      setGoogleConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    await disconnectGoogle();
    await refreshGoogleStatus();
    if (onGoogleOAuthChange) {
      onGoogleOAuthChange({ ...(googleOAuthSettings ?? { clientId, enabled: false }), enabled: false });
    }
  };

  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(() => getCompanyProfile());
  const [companyDirty, setCompanyDirty] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>(DEFAULT_PAYMENT_METHODS);
  const [pmDirty, setPmDirty] = useState(false);
  const [pmSaving, setPmSaving] = useState(false);
  const [pmEditId, setPmEditId] = useState<string | null>(null);
  const [pmNewForm, setPmNewForm] = useState<{ label: string; feePercent: string; feeFixed: string } | null>(null);

  useEffect(() => {
    getPaymentMethodsConfig().then(setPaymentMethods).catch(() => {});
  }, []);

  const handlePmChange = (id: string, field: keyof PaymentMethodConfig, value: string | number | boolean) => {
    setPaymentMethods((prev) => prev.map((m) => m.id === id ? { ...m, [field]: value } : m));
    setPmDirty(true);
  };

  const handlePmSave = async () => {
    setPmSaving(true);
    try {
      await savePaymentMethodsConfig(paymentMethods);
      setPmDirty(false);
    } finally {
      setPmSaving(false);
    }
  };

  const handlePmDelete = async (id: string) => {
    const ok = await requestConfirm({ title: 'Zahlart löschen?', message: 'Diese Zahlart wirklich löschen?', confirmLabel: 'Löschen', cancelLabel: 'Abbrechen', danger: true });
    if (!ok) return;
    setPaymentMethods((prev) => prev.filter((m) => m.id !== id));
    setPmDirty(true);
  };

  const handlePmAdd = () => {
    if (!pmNewForm) { setPmNewForm({ label: '', feePercent: '0', feeFixed: '0' }); return; }
    if (!pmNewForm.label.trim()) return;
    const newId = `custom_${Date.now()}`;
    setPaymentMethods((prev) => [...prev, {
      id: newId,
      label: pmNewForm.label.trim(),
      feePercent: Number(pmNewForm.feePercent) || 0,
      feeFixed: Number(pmNewForm.feeFixed) || 0,
      isActive: true,
    }]);
    setPmNewForm(null);
    setPmDirty(true);
  };
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

  const envGoogleClientId =
    ((import.meta as any).env?.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) || '';
  const aiConfigured = Boolean(settings.provider && (settings.provider !== 'zai' || settings.apiKey));
  const googleConfigured = Boolean(googleOAuthSettings?.enabled && googleOAuthSettings?.clientId);
  const setupItems = [
    { label: 'AI', ok: aiConfigured },
    { label: 'Google OAuth', ok: googleConfigured },
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

      {/* Google Workspace Integration */}
      {onGoogleOAuthChange && (
        <div className="border-t border-slate-200 pt-3 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Google Workspace Integration</p>
            <p className="text-xs text-slate-500">Gmail, Kalender & Kontakte synchronisieren</p>
          </div>

          {/* Status-Karte */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">

            {/* Verbindungsstatus */}
            {/* Status-Kopf */}
            <div className="flex items-center gap-3">
              {googleStatus?.connected ? (
                <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="w-6 h-6 text-amber-400 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">
                  {googleStatus?.connected ? 'Verbunden' : 'Nicht verbunden'}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {googleStatus?.connected
                    ? googleStatus.email ?? 'Google-Konto aktiv'
                    : 'Verbinde dein Google-Konto für Gmail, Kalender & Kontakte.'}
                </p>
              </div>
              {googleStatus?.connected && (
                <button
                  type="button"
                  title="Status aktualisieren"
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                  onClick={refreshGoogleStatus}
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Fehleranzeige */}
            {googleError && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {googleError}
              </div>
            )}

            {/* Nicht verbunden → prominenter Connect-Button */}
            {!googleStatus?.connected && (
              <button
                type="button"
                disabled={googleConnecting !== null}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition-colors"
                onClick={() => handleConnect()}
              >
                {googleConnecting === 'base' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
                {googleConnecting === 'base' ? 'Warte auf Browser…' : 'Mit Google verbinden'}
              </button>
            )}

            {/* Verbunden → per-Service Status */}
            {googleStatus?.connected && (
              <div className="space-y-1">
                {/* Letzte Verbindung */}
                {googleStatus.connectedAt && (
                  <p className="text-xs text-slate-400 mb-2">
                    Verbunden seit {new Date(googleStatus.connectedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                )}

                {/* Gmail */}
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Mail className="w-4 h-4 text-slate-400" />
                    Gmail
                    {googleStatus.gmailConnected
                      ? <span className="text-xs text-emerald-600 font-medium">✓ aktiv</span>
                      : <span className="text-xs text-slate-400">nicht autorisiert</span>}
                  </div>
                  {!googleStatus.gmailConnected ? (
                    <button
                      type="button"
                      disabled={googleConnecting !== null}
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      onClick={() => handleConnect('gmail')}
                    >
                      {googleConnecting === 'gmail' ? 'Warte…' : 'Freischalten'}
                    </button>
                  ) : onTestGmailConnection && (
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      disabled={gmailTestStatus === 'testing'}
                      onClick={() => onTestGmailConnection?.()}
                    >
                      {gmailTestStatus === 'testing' ? 'Teste…' : gmailTestStatus === 'success' ? '✅ OK' : gmailTestStatus === 'error' ? '❌ Fehler' : 'testen'}
                    </button>
                  )}
                </div>

                {/* Kalender */}
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    Kalender
                    {googleStatus.calendarConnected
                      ? <span className="text-xs text-emerald-600 font-medium">✓ aktiv</span>
                      : <span className="text-xs text-slate-400">nicht autorisiert</span>}
                  </div>
                  {!googleStatus.calendarConnected ? (
                    <button
                      type="button"
                      disabled={googleConnecting !== null}
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      onClick={() => handleConnect('calendar')}
                    >
                      {googleConnecting === 'calendar' ? 'Warte…' : 'Freischalten'}
                    </button>
                  ) : onTestGoogleConnection && (
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      disabled={googleTestStatus === 'testing'}
                      onClick={() => onTestGoogleConnection?.()}
                    >
                      {googleTestStatus === 'testing' ? 'Teste…' : googleTestStatus === 'success' ? '✅ OK' : googleTestStatus === 'error' ? '❌ Fehler' : 'testen'}
                    </button>
                  )}
                </div>

                {/* Kontakte */}
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Users className="w-4 h-4 text-slate-400" />
                    Kontakte
                    {googleStatus.contactsConnected
                      ? <span className="text-xs text-emerald-600 font-medium">✓ aktiv</span>
                      : <span className="text-xs text-slate-400">nicht autorisiert</span>}
                  </div>
                  {!googleStatus.contactsConnected && (
                    <button
                      type="button"
                      disabled={googleConnecting !== null}
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      onClick={() => handleConnect('contacts')}
                    >
                      {googleConnecting === 'contacts' ? 'Warte…' : 'Freischalten'}
                    </button>
                  )}
                </div>

                {/* Trennen */}
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors mt-1"
                  onClick={handleDisconnect}
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Verbindung trennen
                </button>
              </div>
            )}
          </div>

          {/* Erweiterte Einrichtung (Accordion) */}
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer list-none py-2 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
              <span className="text-xs font-medium text-slate-600">Erweiterte Einrichtung (Eigene Client-ID)</span>
              <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2 space-y-3 px-1">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600" htmlFor="google-clientid">OAuth Client ID</label>
                <input
                  id="google-clientid"
                  type="password"
                  placeholder="<client-id>.apps.googleusercontent.com"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={googleOAuthSettings?.clientId || ''}
                  onChange={(e) => handleGoogleOAuthChange('clientId', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600" htmlFor="google-apikey">API Key (optional)</label>
                <input
                  id="google-apikey"
                  type="password"
                  placeholder="AIza..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={googleOAuthSettings?.apiKey || ''}
                  onChange={(e) => handleGoogleOAuthChange('apiKey', e.target.value)}
                />
              </div>
              {googleOAuthSettings?.clientId && (
                <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  <div className="font-semibold">Bei Fehler 400: redirect_uri_mismatch</div>
                  <div>In der Google Cloud Console unter <span className="font-medium">Authorized redirect URIs</span> eintragen:</div>
                  <div className="font-mono bg-white border border-slate-200 rounded px-2 py-1 inline-block select-all">
                    http://127.0.0.1
                  </div>
                </div>
              )}
              {envGoogleClientId && (
                <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <span className="font-mono truncate mr-2">.env: {envGoogleClientId.slice(0, 24)}…</span>
                  <button
                    type="button"
                    className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 whitespace-nowrap"
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
                  >
                    Übernehmen
                  </button>
                </div>
              )}
              <div className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <span className="font-semibold text-blue-800 block mb-1">Einrichtung</span>
                <ol className="list-decimal pl-4 space-y-0.5">
                  <li>Google Cloud Projekt: <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">console.cloud.google.com</a></li>
                  <li>People API + Gmail API aktivieren</li>
                  <li>OAuth Client ID erstellen (Web Application)</li>
                  <li>Client ID oben eintragen</li>
                </ol>
              </div>
            </div>
          </details>
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
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <span className="px-3 py-2 rounded-md border border-slate-200 text-sm bg-white hover:bg-slate-50 text-slate-700">
                  Datei auswählen
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setCompanyDirty(true);
                      setCompanyProfile({ ...companyProfile, logoDataUrl: String(reader.result || '') });
                    };
                    reader.readAsDataURL(f);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
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

      {/* Zahlarten */}
      <div className="border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">💳 Zahlarten &amp; Gebühren</p>
            <p className="text-xs text-slate-500">Gebühren werden automatisch in der EÜR berechnet</p>
          </div>
        </div>
        <div className="space-y-2">
          {paymentMethods.map((m) => (
            <div key={m.id} className="rounded-lg border border-slate-200 bg-white p-3">
              {pmEditId === m.id ? (
                <div className="space-y-2">
                  <input
                    className="w-full px-2 py-1 rounded border border-slate-200 text-sm"
                    title="Bezeichnung"
                    placeholder="Bezeichnung"
                    value={m.label}
                    onChange={(e) => handlePmChange(m.id, 'label', e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500 block mb-0.5">Gebühr % (z.B. 1.39)</label>
                      <input type="number" step="0.01" min="0" max="100"
                        className="w-full px-2 py-1 rounded border border-slate-200 text-sm"
                        title="Gebühr Prozent"
                        value={m.feePercent}
                        onChange={(e) => handlePmChange(m.id, 'feePercent', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-0.5">Fixgebühr € (z.B. 0.35)</label>
                      <input type="number" step="0.01" min="0"
                        className="w-full px-2 py-1 rounded border border-slate-200 text-sm"
                        title="Fixgebühr Euro"
                        value={m.feeFixed}
                        onChange={(e) => handlePmChange(m.id, 'feeFixed', Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="px-3 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700" onClick={() => setPmEditId(null)}>Fertig</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <input type="checkbox" title="Aktiv" checked={m.isActive}
                      onChange={(e) => handlePmChange(m.id, 'isActive', e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span className="text-sm font-medium text-slate-800 truncate">{m.label}</span>
                    {(m.feePercent > 0 || m.feeFixed > 0) && (
                      <span className="text-xs text-amber-600 whitespace-nowrap">
                        {m.feePercent > 0 ? `${m.feePercent}%` : ''}{m.feePercent > 0 && m.feeFixed > 0 ? ' + ' : ''}{m.feeFixed > 0 ? `${m.feeFixed.toFixed(2)} €` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" title="Bearbeiten" className="px-2 py-1 rounded border border-slate-200 text-xs hover:bg-slate-50" onClick={() => setPmEditId(m.id)}>✏️</button>
                    <button type="button" title="Löschen" className="px-2 py-1 rounded border border-red-100 text-xs hover:bg-red-50 text-red-600" onClick={() => handlePmDelete(m.id)}>✕</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {pmNewForm ? (
          <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-3 space-y-2">
            <input className="w-full px-2 py-1 rounded border border-slate-200 text-sm bg-white" title="Bezeichnung neue Zahlart" placeholder="Bezeichnung (z.B. Klarna)" value={pmNewForm.label}
              onChange={(e) => setPmNewForm((f) => f ? { ...f, label: e.target.value } : f)} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Gebühr %</label>
                <input type="number" step="0.01" min="0" title="Gebühr Prozent" className="w-full px-2 py-1 rounded border border-slate-200 text-sm bg-white" value={pmNewForm.feePercent}
                  onChange={(e) => setPmNewForm((f) => f ? { ...f, feePercent: e.target.value } : f)} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-0.5">Fixgebühr €</label>
                <input type="number" step="0.01" min="0" title="Fixgebühr Euro" className="w-full px-2 py-1 rounded border border-slate-200 text-sm bg-white" value={pmNewForm.feeFixed}
                  onChange={(e) => setPmNewForm((f) => f ? { ...f, feeFixed: e.target.value } : f)} />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" className="px-3 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700" onClick={handlePmAdd}>Hinzufügen</button>
              <button type="button" className="px-3 py-1 rounded border border-slate-200 text-xs hover:bg-slate-50" onClick={() => setPmNewForm(null)}>Abbrechen</button>
            </div>
          </div>
        ) : (
          <button type="button" className="mt-3 w-full px-3 py-2 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600 hover:bg-slate-50" onClick={() => setPmNewForm({ label: '', feePercent: '0', feeFixed: '0' })}>+ Zahlart hinzufügen</button>
        )}

        <button type="button"
          className={`mt-3 w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${ pmDirty ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-600'}`}
          disabled={!pmDirty || pmSaving}
          onClick={handlePmSave}
        >
          {pmSaving ? 'Wird gespeichert…' : 'Zahlarten speichern'}
        </button>
      </div>

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

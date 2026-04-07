import React, { useEffect, useState } from 'react';
import {
  getAvailableProviders,
  getContactSyncSettings,
  getProviderLabel,
  getSystemContactsStatus,
  isSystemContactsAvailable,
  requestContactsAccess,
  saveContactSyncSettings,
  syncContacts,
  type ContactAccessStatus,
  type ContactSyncProvider,
  type ContactSyncSettings,
  type SyncDirection,
} from '../services/contactSyncService';

interface ContactSyncSettingsProps {
  customers: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: {
      street?: string;
      zipCode?: string;
      city?: string;
      country?: string;
    };
    company?: string;
    systemContactId?: string;
    updatedAt: number;
  }>;
}

const ContactSyncSettings: React.FC<ContactSyncSettingsProps> = ({ customers }) => {
  const [settings, setSettings] = useState<ContactSyncSettings>(getContactSyncSettings());
  const [systemStatus, setSystemStatus] = useState<ContactAccessStatus>('notDetermined');
  const [isLoading, setIsLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isSystemContactsAvailable()) {
      checkSystemStatus();
    }
  }, []);

  const checkSystemStatus = async () => {
    const status = await getSystemContactsStatus();
    setSystemStatus(status);
  };

  const handleProviderChange = (provider: ContactSyncProvider) => {
    const newSettings = { ...settings, provider };
    setSettings(newSettings);
    saveContactSyncSettings(newSettings);
  };

  const handleDirectionChange = (direction: SyncDirection) => {
    const newSettings = { ...settings, direction };
    setSettings(newSettings);
    saveContactSyncSettings(newSettings);
  };

  const handleEnabledChange = (enabled: boolean) => {
    const newSettings = { ...settings, enabled };
    setSettings(newSettings);
    saveContactSyncSettings(newSettings);
  };

  const handleRequestAccess = async () => {
    setIsLoading(true);
    try {
      const granted = await requestContactsAccess();
      if (granted) {
        setSystemStatus('authorized');
      } else {
        setSystemStatus('denied');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsLoading(true);
    setSyncResult(null);
    try {
      const result = await syncContacts(customers);
      if (result.success) {
        setSyncResult({
          success: true,
          message: `Synchronisation erfolgreich: ${result.imported} importiert, ${result.exported} exportiert`,
        });
      } else {
        setSyncResult({
          success: false,
          message: `Synchronisation fehlgeschlagen: ${result.errors.join(', ')}`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      setSyncResult({ success: false, message });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: ContactAccessStatus) => {
    switch (status) {
      case 'authorized':
        return '✅';
      case 'denied':
        return '❌';
      case 'restricted':
        return '⚠️';
      case 'notDetermined':
        return '⚠️';
      case 'unsupported':
        return '🚫';
      default:
        return '❓';
    }
  };

  const getStatusText = (status: ContactAccessStatus) => {
    switch (status) {
      case 'authorized':
        return 'Zugriff erlaubt';
      case 'denied':
        return 'Zugriff abgelehnt';
      case 'restricted':
        return 'Zugriff eingeschränkt';
      case 'notDetermined':
        return 'Nicht angefragt';
      case 'unsupported':
        return 'Nicht verfügbar';
      default:
        return 'Unbekannt';
    }
  };

  const availableProviders = getAvailableProviders();
  const showSystemSection = settings.provider === 'system' && isSystemContactsAvailable();

  return (
    <div className="space-y-6 p-4 bg-white rounded-lg border border-slate-200">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Kontaktsynchronisation</h3>
        <span className={`text-sm ${settings.enabled ? 'text-emerald-600' : 'text-slate-500'}`}>
          {settings.enabled ? 'Aktiviert' : 'Deaktiviert'}
        </span>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
        <div>
          <div className="font-medium text-slate-900">Synchronisation aktivieren</div>
          <div className="text-sm text-slate-500">
            Kunden mit externen Kontakten synchronisieren
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer" htmlFor="sync-enabled-toggle">
          <input
            id="sync-enabled-toggle"
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => handleEnabledChange(e.target.checked)}
            className="sr-only peer"
            aria-label="Synchronisation aktivieren"
          />
          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {/* Provider Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">Provider</label>
        <div className="grid grid-cols-1 gap-2">
          {availableProviders.map((provider) => (
            <button
              key={provider}
              onClick={() => handleProviderChange(provider)}
              className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                settings.provider === provider
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="font-medium">{getProviderLabel(provider)}</div>
                {provider === 'system' && (
                  <div className="text-xs text-slate-500">
                    Keine Cloud nötig - iCloud-Sync durch macOS
                  </div>
                )}
              </div>
              {settings.provider === provider && (
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* macOS System Contacts Section */}
      {showSystemSection && (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🍎</span>
            <h4 className="font-medium text-slate-900">macOS Kontakte Status</h4>
          </div>

          <div className="flex items-center gap-3 mb-4 p-3 bg-white rounded-lg">
            <span className="text-xl">{getStatusIcon(systemStatus)}</span>
            <div>
              <div className="font-medium">{getStatusText(systemStatus)}</div>
              {systemStatus === 'notDetermined' && (
                <div className="text-sm text-slate-500">
                  Klicken Sie auf "Berechtigung anfragen"
                </div>
              )}
            </div>
          </div>

          {systemStatus === 'notDetermined' && (
            <button
              onClick={handleRequestAccess}
              disabled={isLoading}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Warte auf Berechtigung...' : 'Berechtigung anfragen'}
            </button>
          )}

          {systemStatus === 'denied' && (
            <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">
              Berechtigung wurde abgelehnt. Bitte öffnen Sie{' '}
              <strong>Systemeinstellungen → Datenschutz & Sicherheit → Kontakte</strong>{' '}
              und erlauben Sie den Zugriff für Mietpark CRM.
            </div>
          )}
        </div>
      )}

      {/* Sync Direction */}
      {settings.enabled && settings.provider !== 'none' && (
        <div className="space-y-2">
          <label htmlFor="sync-direction-select" className="text-sm font-medium text-slate-700">Richtung</label>
          <select
            id="sync-direction-select"
            title="Synchronisationsrichtung"
            value={settings.syncDirection}
            onChange={(e) => handleDirectionChange(e.target.value as SyncDirection)}
            className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="bidirectional">Beide Richtungen</option>
            <option value="toExternal">Nur zu extern (CRM → Kontakte)</option>
            <option value="fromExternal">Nur von extern (Kontakte → CRM)</option>
          </select>
          <p className="text-xs text-slate-500">
            {settings.syncDirection === 'bidirectional'
              ? 'Kontakte werden in beide Richtungen synchronisiert'
              : settings.syncDirection === 'toExternal'
              ? 'CRM-Kunden werden zu externen Kontakten exportiert'
              : 'Externe Kontakte werden in CRM importiert'}
          </p>
        </div>
      )}

      {/* Manual Sync Button */}
      {settings.enabled && settings.provider !== 'none' && (
        <div className="space-y-3">
          <button
            onClick={handleSync}
            disabled={isLoading || (settings.provider === 'system' && systemStatus !== 'authorized')}
            className="w-full py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
          </button>

          {syncResult && (
            <div
              className={`p-3 rounded-lg text-sm ${
                syncResult.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {syncResult.message}
            </div>
          )}

          {settings.lastSyncAt && (
            <div className="text-xs text-slate-500 text-center">
              Letzte Synchronisation: {new Date(settings.lastSyncAt).toLocaleString('de-DE')}
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
        <h4 className="font-medium text-blue-900 mb-2">ℹ️ Information</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Systemkontakte (macOS) funktionieren offline</li>
          <li>• iCloud-Sync wird automatisch vom System gehandhabt</li>
          <li>• CRM-ID wird in der Notiz des Kontakts gespeichert</li>
          <li>• Duplikate werden anhand der E-Mail-Adresse erkannt</li>
        </ul>
      </div>
    </div>
  );
};

export default ContactSyncSettings;

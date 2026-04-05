import React, { useMemo, useState, useEffect } from 'react';
import { Customer, GoogleOAuthSettings, MailTransportSettings } from '../types';
import { syncCustomerToGoogle, deleteGoogleContact } from '../services/googleContactsService';
import { getDatabaseStats } from '../services/indexedDBService';
import CustomerEmailHistoryModal from './CustomerEmailHistoryModal';
import CustomerDocumentsModal from './CustomerDocumentsModal';
import { getAllCustomerDocuments, getAllMessages } from '../services/sqliteService';
import { loadJson } from '../services/_storage';
import {
  getAllBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  downloadBackup,
  downloadBackupBundle,
  importBackupBundleFromFile,
  getBackupStats,
  formatFileSize,
  formatBackupDate,
  BackupMetadata
} from '../services/backupService';
import CustomerForm from './CustomerForm';
import { openGenericCompose } from '../services/invoiceEmailService';
import { formatDisplayRef } from '../utils/displayId';

interface CustomerListProps {
  customers: Customer[];
  googleOAuthSettings?: GoogleOAuthSettings;
  mailTransportSettings?: MailTransportSettings;
  googleInitialized?: boolean;
  firecrawlAvailable?: boolean;
  onOpenSettings?: () => void;
  onAddCustomer: (customer: Customer) => void;
  onUpdateCustomer: (id: string, customer: Partial<Customer>) => void;
  onDeleteCustomer: (id: string) => void;
}

const CustomerList: React.FC<CustomerListProps> = ({
  customers,
  googleOAuthSettings,
  mailTransportSettings,
  googleInitialized = false,
  firecrawlAvailable = false,
  onOpenSettings,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [dbStats, setDbStats] = useState<{ customerCount: number; dbSize: number } | null>(null);
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [showBackups, setShowBackups] = useState(false);
  const [isLoadingBackup, setIsLoadingBackup] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);
  const bundleInputRef = React.useRef<HTMLInputElement | null>(null);
  const [emailHistoryCustomer, setEmailHistoryCustomer] = useState<Customer | null>(null);
  const [photoCustomer, setPhotoCustomer] = useState<Customer | null>(null);
  const [photoIndex, setPhotoIndex] = useState<number>(0);
  const [docsCustomer, setDocsCustomer] = useState<Customer | null>(null);
  const [lastMessageByCustomerId, setLastMessageByCustomerId] = useState<Record<string, number>>({});
  const [lastGmailByCustomerId, setLastGmailByCustomerId] = useState<Record<string, number>>({});
  const [docAggByCustomerId, setDocAggByCustomerId] = useState<Record<string, { count: number; bytes: number }>>({});
  const [docAggTotal, setDocAggTotal] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 });

  // Load database stats on mount
  useEffect(() => {
    const loadStats = async () => {
      try {
        const stats = await getDatabaseStats();
        setDbStats(stats);
      } catch (error) {
        console.error('Failed to load database stats:', error);
      }
    };
    loadStats();
  }, [customers]); // Reload when customers change

  // Load backups
  const loadBackups = async () => {
    const allBackups = await getAllBackups();
    setBackups(allBackups);
  };

  // Load backups on mount
  useEffect(() => {
    void loadBackups();
  }, []);

  // Reload backups when panel is opened
  useEffect(() => {
    if (showBackups) {
      void loadBackups();
    }
  }, [showBackups]);

  // Filter customers by search term
  const filteredCustomers = customers.filter(customer =>
    `${customer.firstName} ${customer.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await getAllMessages();
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const m of all) {
          const cid = (m as any).customerId;
          if (!cid) continue;
          const ts = Number((m as any).receivedAt || (m as any).createdAt || 0);
          if (!ts) continue;
          map[cid] = Math.max(map[cid] || 0, ts);
        }
        setLastMessageByCustomerId(map);
      } catch (e) {
        console.warn('Failed to load messages for last-contact calc:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const maxByCustomerId: Record<string, number> = {};

        // Read from per-customer email cache (populated when opening E-Mail Historie modal).
        // This avoids Gmail API calls per table row.
        const items = customers
          .map((c) => ({ id: c.id, email: (c.email || '').trim().toLowerCase() }))
          .filter((c) => Boolean(c.email));

        const toTs = (thread: any) => {
          const internal = thread?.lastInternalDate;
          if (typeof internal === 'number' && Number.isFinite(internal)) return internal;
          const raw = thread?.lastDate || thread?.date;
          const parsed = raw ? Date.parse(String(raw)) : NaN;
          return Number.isFinite(parsed) ? parsed : 0;
        };

        // Simple concurrency limiting to keep UI responsive.
        const concurrency = 6;
        for (let i = 0; i < items.length; i += concurrency) {
          const batch = items.slice(i, i + concurrency);
          const results = await Promise.all(
            batch.map(async (it) => {
              const cacheKey = `mietpark_crm_customer_email_cache_v1:${it.email}`;
              const cached = await loadJson<any>(cacheKey, null);
              const threads = cached?.threads;
              if (!Array.isArray(threads) || threads.length === 0) return { id: it.id, ts: 0 };
              let max = 0;
              for (const t of threads) {
                max = Math.max(max, toTs(t));
              }
              return { id: it.id, ts: max };
            })
          );
          if (cancelled) return;
          for (const r of results) {
            if (r.ts) maxByCustomerId[r.id] = Math.max(maxByCustomerId[r.id] || 0, r.ts);
          }
        }

        if (cancelled) return;
        setLastGmailByCustomerId(maxByCustomerId);
      } catch (e) {
        console.warn('Failed to load Gmail cache for last-contact calc:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Recompute after closing the email-history modal as it may have refreshed cache.
  }, [customers, emailHistoryCustomer]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const allDocs = await getAllCustomerDocuments();
        if (cancelled) return;
        const map: Record<string, { count: number; bytes: number }> = {};
        let totalCount = 0;
        let totalBytes = 0;
        for (const d of allDocs) {
          const cid = (d as any).customerId;
          if (!cid) continue;
          const bytes = typeof (d as any).sizeBytes === 'number' ? Number((d as any).sizeBytes) : 0;
          map[cid] = map[cid] || { count: 0, bytes: 0 };
          map[cid].count += 1;
          map[cid].bytes += bytes;
          totalCount += 1;
          totalBytes += bytes;
        }
        setDocAggByCustomerId(map);
        setDocAggTotal({ count: totalCount, bytes: totalBytes });
      } catch (e) {
        console.warn('Failed to load customer document stats:', e);
        setDocAggByCustomerId({});
        setDocAggTotal({ count: 0, bytes: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customers, docsCustomer]);

  const getLastContactTs = (c: Customer) => {
    const lastMsg = lastMessageByCustomerId[c.id] || 0;
    const lastGmail = lastGmailByCustomerId[c.id] || 0;
    return Math.max(
      lastMsg,
      lastGmail,
      Number(c.contactDate || 0), // first known contact (first email)
      Number(c.createdAt || 0)
    );
  };

  // Sort by last contact (newest first)
  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => getLastContactTs(b) - getLastContactTs(a));
  }, [filteredCustomers, lastMessageByCustomerId]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('de-DE');
  };

  const handleComposeCustomerEmail = async (customer: Customer) => {
    const to = (customer.email || '').trim();
    if (!to) {
      alert('Keine E-Mail-Adresse beim Kunden hinterlegt.');
      return;
    }

    const approved = window.confirm(
      `E-Mail-Entwurf für ${customer.firstName} ${customer.lastName} öffnen?\n\n` +
      'Hinweis: Vor dem Versand bitte Inhalt immer manuell prüfen und bei Bedarf anpassen.'
    );
    if (!approved) return;

    await openGenericCompose({
      toEmail: to,
      subject: 'Ihre Anfrage bei Mietpark Saar-Pfalz',
      body: '',
      preferGmail: true,
      mailTransportSettings,
    });
  };

  // Create manual backup
  const handleCreateBackup = async () => {
    setIsLoadingBackup(true);
    try {
      const backup = await createBackup('Manuelles Backup');
      await loadBackups();
      alert(
        `✅ Backup erfolgreich erstellt!\n\n` +
        `Datum: ${formatBackupDate(backup.timestamp)}\n` +
        `Kunden: ${backup.customerCount}\n` +
        `Größe: ${formatFileSize(backup.fileSize)}`
      );
    } catch (error) {
      console.error('Backup error:', error);
      alert('❌ Fehler beim Erstellen des Backups: ' + (error as Error).message);
    } finally {
      setIsLoadingBackup(false);
    }
  };

  // Restore from backup
  const handleRestoreBackup = async (backupId: string) => {
    if (!window.confirm(
      'Möchten Sie wirklich dieses Backup wiederherstellen?\n\n' +
      'Alle aktuellen Änderungen gehen verloren!'
    )) {
      return;
    }

    setIsLoadingBackup(true);
    try {
      const importCount = await restoreBackup(backupId);
      alert(
        `✅ Backup erfolgreich wiederhergestellt!\n\n` +
        `${importCount} Kunden wurden wiederhergestellt.\n\n` +
        'Die Seite wird jetzt neu geladen...'
      );
      // Reload page to refresh data
      window.location.reload();
    } catch (error) {
      console.error('Restore error:', error);
      alert('❌ Fehler beim Wiederherstellen des Backups: ' + (error as Error).message);
      setIsLoadingBackup(false);
    }
  };

  // Delete backup
  const handleDeleteBackup = (backupId: string) => {
    if (!window.confirm('Möchten Sie dieses Backup wirklich löschen?')) {
      return;
    }

    (async () => {
      const success = await deleteBackup(backupId);
      if (success) {
        await loadBackups();
        alert('✅ Backup erfolgreich gelöscht');
      } else {
        alert('❌ Fehler beim Löschen des Backups');
      }
    })();
  };

  // Download backup
  const handleDownloadBackup = (backupId: string) => {
    void downloadBackup(backupId);
  };

  const handleDownloadBackupBundle = (backupId: string) => {
    void downloadBackupBundle(backupId);
  };

  const handleImportBackupBundle = async (file?: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      alert('Bitte eine ZIP-Datei waehlen (Backup-Bundle).');
      return;
    }
    const ok = window.confirm(
      'Backup-Bundle importieren?\n\n' +
      'Achtung: Dies ueberschreibt den kompletten lokalen Datenbestand (Kunden, Vorgaenge, Dokumente, ...).'
    );
    if (!ok) return;

    setBundleBusy(true);
    try {
      const res = await importBackupBundleFromFile(file);
      alert(`✅ Import abgeschlossen.\n\nKunden: ${res.customerCount}\nDokumente: ${res.docImported}/${res.docCount}\n\nDie App wird jetzt neu geladen.`);
      window.location.reload();
    } catch (e: any) {
      alert('❌ Import fehlgeschlagen: ' + (e?.message || String(e)));
    } finally {
      setBundleBusy(false);
      if (bundleInputRef.current) bundleInputRef.current.value = '';
    }
  };

  // Sync customer to Google Contacts
  const handleSyncToGoogle = async (customer: Customer) => {
    // Check if Google OAuth is configured
    if (!googleOAuthSettings?.enabled || !googleOAuthSettings?.clientId) {
      alert(
        'Google OAuth ist nicht konfiguriert.\n\n' +
        'Bitte gehen Sie zu den Einstellungen (⚙️) und tragen Sie Ihre Google OAuth Client ID ein.'
      );
      return;
    }

    if (!googleInitialized) {
      alert('Google OAuth wird noch initialisiert... Bitte warten Sie einen Moment.');
      return;
    }

    // Check if customer already has a Google resource ID
    if (customer.googleContactResourceId) {
      alert(
        `Dieser Kunde wurde bereits zu Google Kontakten hinzugefügt.\n\n` +
        `Google-Kontakt-Ref: ${formatDisplayRef(customer.googleContactResourceId, 'GCT')}\n\n` +
        `Wenn Sie den Kontakt aktualisieren möchten, öffnen Sie ihn bitte direkt in Google Kontakten.`
      );
      return;
    }

    try {
      const result = await syncCustomerToGoogle(customer);

      if (result.success && result.resourceName) {
        // Update customer with Google Resource ID
        onUpdateCustomer(customer.id, {
          googleContactResourceId: result.resourceName
        });

        alert(
          `✅ Erfolg!\n\n` +
          `Der Kunde "${customer.firstName} ${customer.lastName}" wurde erfolgreich zu Google Kontakten hinzugefügt.\n\n` +
          `Kontakt-Ref: ${formatDisplayRef(result.resourceName, 'GCT')}`
        );
      } else {
        alert(
          `❌ Fehler!\n\n` +
          `Der Kunde konnte nicht zu Google Kontakten hinzugefügt werden.\n\n` +
          `Fehler: ${result.error}\n\n` +
          `Bitte überprüfen Sie Ihre OAuth-Berechtigungen.`
        );
      }
    } catch (error: any) {
      console.error('Google sync error:', error);
      alert(
        `❌ Fehler!\n\n` +
        `Ein unerwarteter Fehler ist aufgetreten.\n\n` +
        `${error.message || 'Unknown error'}`
      );
    }
  };

  // Handle add customer with auto-sync to Google
  const handleAddCustomer = async (customer: Customer) => {
    await onAddCustomer(customer);

    // Auto-sync to Google if OAuth is configured
    if (googleOAuthSettings?.enabled && googleOAuthSettings?.clientId) {
      try {
        const result = await syncCustomerToGoogle(customer);
        if (result.success) {
          console.log('✅ Kunde automatisch zu Google Kontakten hinzugefügt:', customer.firstName, customer.lastName);
          // Update customer with Google resource ID
          onUpdateCustomer(customer.id, { googleContactResourceId: result.resourceName });
        } else {
          console.warn('⚠️ Auto-Sync zu Google fehlgeschlagen:', result.error);
        }
      } catch (error: any) {
        console.warn('⚠️ Auto-Sync zu Google fehlgeschlagen:', error.message);
      }
    }
  };

  // Handle delete customer with auto-delete from Google
  const handleDeleteCustomer = async (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);

    // Delete from Google if synced
    if (customer?.googleContactResourceId) {
      try {
        const result = await deleteGoogleContact(customer.googleContactResourceId);
        if (result.success) {
          console.log('✅ Kunde automatisch aus Google Kontakten gelöscht:', customer.firstName, customer.lastName);
        } else {
          console.warn('⚠️ Auto-Löschen aus Google fehlgeschlagen:', result.error);
        }
      } catch (error: any) {
        console.warn('⚠️ Auto-Löschen aus Google fehlgeschlagen:', error.message);
      }
    }

    // Delete from local database
    onDeleteCustomer(customerId);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Kundenverwaltung</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-slate-600">
              {customers.length} {customers.length === 1 ? 'Kunde' : 'Kunden'} insgesamt
            </p>
            {docAggTotal.count > 0 && (
              <p className="text-slate-600">
                | {docAggTotal.count} Dokumente ({formatFileSize(docAggTotal.bytes)})
              </p>
            )}
            {firecrawlAvailable && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200" title="Firecrawl Web-Research verfügbar">
                🔍 Web-Suche aktiv
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Backups Button */}
          <button
            onClick={() => setShowBackups(!showBackups)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
            Backups ({backups.length})
          </button>

          {/* Add Customer Button */}
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg transition-colors shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Neukunde anlegen
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Kunden suchen (Name, E-Mail, Firma...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Kunden suchen"
          />
          <svg className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Backup Management Panel */}
      {showBackups && (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border-2 border-purple-200 shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-purple-900 flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
                Backup-Verwaltung
              </h3>
              <p className="text-sm text-purple-700 mt-1">
                Automatische tägliche Backups + Manuelle Backups
              </p>
            </div>
            <button
              onClick={() => setShowBackups(false)}
              className="text-purple-400 hover:text-purple-600 transition"
              aria-label="Backup-Verwaltung schließen"
              title="Schließen"
            >
              ✕
            </button>
          </div>

          {/* Create Backup Button */}
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={handleCreateBackup}
              disabled={isLoadingBackup}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              {isLoadingBackup ? 'Erstelle Backup...' : 'Jetzt Backup erstellen'}
            </button>
            <input
              ref={bundleInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => void handleImportBackupBundle(e.target.files?.[0] || null)}
            />
            <button
              onClick={() => bundleInputRef.current?.click()}
              disabled={bundleBusy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors shadow-sm"
              title="Importiert ein ZIP-Backup inklusive PDFs/Dokumente"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {bundleBusy ? 'Import...' : 'ZIP Import'}
            </button>
            {backups.length > 0 && (
              <span className="text-sm text-purple-700">
                💡 Es werden maximal 30 Backups gespeichert
              </span>
            )}
          </div>

          {/* Backup List */}
          {backups.length === 0 ? (
            <div className="bg-white rounded-lg border border-purple-200 p-8 text-center">
              <svg className="w-16 h-16 text-purple-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <h4 className="text-lg font-semibold text-purple-900 mb-2">Noch keine Backups</h4>
              <p className="text-purple-700 text-sm">
                Erstellen Sie Ihr erstes Backup oder warten Sie bis zum automatischen täglichen Backup.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {backups.map((backup) => (
                <div key={backup.id} className="bg-white rounded-lg border border-purple-200 p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-purple-900">
                          {backup.name}
                        </span>
                        {backup.id.includes('auto') && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-300">
                            🤖 Auto
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-purple-700 space-y-1">
                        <div>📅 {formatBackupDate(backup.timestamp)}</div>
                        <div>👥 {backup.customerCount} Kunden</div>
                        <div>💾 {formatFileSize(backup.fileSize)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleRestoreBackup(backup.id)}
                        disabled={isLoadingBackup}
                        className="p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Wiederherstellen"
                        aria-label="Backup wiederherstellen"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDownloadBackup(backup.id)}
                        className="p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Herunterladen"
                        aria-label="Backup herunterladen"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDownloadBackupBundle(backup.id)}
                        className="p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Export als ZIP (inkl. Dokumente/PDFs)"
                        aria-label="Backup als ZIP exportieren"
                      >
                        <div className="relative">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          <span className="absolute -bottom-2 -right-3 text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                            ZIP
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteBackup(backup.id)}
                        className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                        title="Löschen"
                        aria-label="Backup löschen"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Form Overlay */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-2xl font-bold text-slate-800">Neukunde anlegen</h3>
              <p className="text-slate-600 mt-1">Füllen Sie alle Pflichtfelder aus</p>
            </div>
            <CustomerForm
              allCustomers={customers}
              onSubmit={(customer) => {
                handleAddCustomer(customer);
                setShowAddForm(false);
              }}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        </div>
      )}

      {/* Edit Form Overlay */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-2xl font-bold text-slate-800">Kunde bearbeiten</h3>
              <p className="text-slate-600 mt-1">{editingCustomer.firstName} {editingCustomer.lastName}</p>
            </div>
            <CustomerForm
              customer={editingCustomer}
              allCustomers={customers}
              onSubmit={(updatedCustomer) => {
                onUpdateCustomer(editingCustomer.id, updatedCustomer);
                setEditingCustomer(null);
              }}
              onCancel={() => setEditingCustomer(null)}
            />
          </div>
        </div>
      )}

      {/* Customers Table */}
      {sortedCustomers.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <svg className="w-20 h-20 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">
            {searchTerm ? 'Keine Kunden gefunden' : 'Noch keine Kunden angelegt'}
          </h3>
          <p className="text-slate-600 mb-6">
            {searchTerm
              ? 'Versuchen Sie es mit einem anderen Suchbegriff.'
              : 'Legen Sie Ihren ersten Kunden an, um zu starten.'
            }
          </p>
          {!searchTerm && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg transition-colors shadow-sm"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Neukunde anlegen
              </button>
              {onOpenSettings ? (
                <button
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-2 px-6 py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-medium rounded-lg transition-colors shadow-sm"
                >
                  Import/Setup öffnen
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Anrede</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Kontakt</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Reling-Foto</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Fahrzeug / Dachträger</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Letzter Kontakt</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Neuanlage</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sortedCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="text-slate-700">{customer.salutation || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{customer.firstName} {customer.lastName}</div>
                      {(() => {
                        const line = [
                          customer.address?.street?.trim(),
                          [customer.address?.zipCode?.trim(), customer.address?.city?.trim()].filter(Boolean).join(' '),
                        ].filter(Boolean).join(', ');
                        if (!line) return null;
                        return <div className="text-sm text-slate-500">{line}</div>;
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div className="flex items-center gap-1 text-slate-700">
                          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {customer.email}
                        </div>
                        <div className="flex items-center gap-1 text-slate-700 mt-1">
                          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {customer.phone}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const photos = Array.isArray((customer as any).roofRailPhotoDataUrls)
                          ? (customer as any).roofRailPhotoDataUrls.filter(Boolean)
                          : (customer as any).roofRailPhotoDataUrl ? [String((customer as any).roofRailPhotoDataUrl)] : [];
                        if (!photos.length) return <span className="text-slate-400">Kein Foto</span>;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">
                              Vorhanden{photos.length > 1 ? ` (${photos.length})` : ''}
                            </span>
                            <button
                              onClick={() => {
                                setPhotoCustomer(customer);
                                setPhotoIndex(0);
                              }}
                              className="px-2 py-1 text-xs rounded-md border border-slate-200 hover:bg-slate-50 text-slate-700"
                              title="Reling-Foto anzeigen"
                              aria-label={`Reling-Foto von ${customer.firstName} ${customer.lastName} anzeigen`}
                            >
                              Ansehen
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const make = String((customer as any).assignedVehicleMake || '').trim();
                        const model = String((customer as any).assignedVehicleModel || '').trim();
                        const reling = String((customer as any).assignedRelingType || '').trim();
                        const key = String((customer as any).assignedRoofRackInventoryKey || '').trim();
                        const hsn = String((customer as any).assignedHsn || '').trim();
                        const tsn = String((customer as any).assignedTsn || '').trim();
                        const note = String((customer as any).roofRackDecisionNote || '').trim();
                        const vehicle = [make, model].filter(Boolean).join(' ');
                        if (!vehicle && !reling && !key && !hsn && !tsn && !note) {
                          return <span className="text-slate-400">Nicht zugeordnet</span>;
                        }
                        return (
                          <div className="text-sm space-y-1">
                            {vehicle ? <div className="font-medium text-slate-900">{vehicle}</div> : null}
                            {(hsn || tsn) ? (
                              <div className="text-xs text-slate-600">HSN/TSN: {hsn || '-'} / {tsn || '-'}</div>
                            ) : null}
                            {reling ? <div className="text-xs text-slate-700">Reling: {reling}</div> : null}
                            {key ? <div className="text-xs font-mono text-slate-700">{key}</div> : null}
                            {note ? <div className="text-xs text-slate-500 line-clamp-2">{note}</div> : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-700">{formatDate(getLastContactTs(customer))}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-700">{formatDate(customer.createdAt)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleComposeCustomerEmail(customer)}
                          className="p-2 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                          title="E-Mail schreiben"
                          aria-label={`E-Mail an ${customer.firstName} ${customer.lastName} schreiben`}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setEmailHistoryCustomer(customer)}
                          className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="E-Mail Historie"
                          aria-label={`E-Mail Historie von ${customer.firstName} ${customer.lastName} öffnen`}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDocsCustomer(customer)}
                          className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                          title={
                            docAggByCustomerId[customer.id]?.count
                              ? `Dokumente (${docAggByCustomerId[customer.id].count}) | ${formatFileSize(docAggByCustomerId[customer.id].bytes)}`
                              : 'Dokumente'
                          }
                          aria-label={`Dokumente von ${customer.firstName} ${customer.lastName} öffnen`}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4h9" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6v16H4z" />
                          </svg>
                          {docAggByCustomerId[customer.id]?.count ? (
                            <span className="absolute -top-1 -right-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 text-white shadow">
                              {docAggByCustomerId[customer.id].count}
                            </span>
                          ) : null}
                        </button>
                        <button
                          onClick={() => setEditingCustomer(customer)}
                          className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Bearbeiten"
                          aria-label={`Kunde ${customer.firstName} ${customer.lastName} bearbeiten`}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleSyncToGoogle(customer)}
                          className={`p-2 rounded-lg transition-colors ${
                            customer.googleContactResourceId
                              ? 'text-green-600 bg-green-50 cursor-default'
                              : 'text-slate-600 hover:text-green-600 hover:bg-green-50'
                          }`}
                          title={customer.googleContactResourceId ? 'Bereits zu Google Kontakten hinzugefügt' : 'Zu Google Kontakten hinzufügen'}
                          disabled={!!customer.googleContactResourceId}
                          aria-label={
                            customer.googleContactResourceId
                              ? `Kunde ${customer.firstName} ${customer.lastName} ist bereits in Google Kontakten`
                              : `Kunde ${customer.firstName} ${customer.lastName} zu Google Kontakten hinzufügen`
                          }
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteCustomer(customer.id)}
                          className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Löschen"
                          aria-label={`Kunde ${customer.firstName} ${customer.lastName} löschen`}
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {emailHistoryCustomer && (
        <CustomerEmailHistoryModal
          customer={emailHistoryCustomer}
          clientId={googleOAuthSettings?.clientId || ''}
          onUpdateCustomer={onUpdateCustomer}
          onClose={() => setEmailHistoryCustomer(null)}
        />
      )}

      {docsCustomer && (
        <CustomerDocumentsModal
          customer={docsCustomer}
          onClose={() => setDocsCustomer(null)}
        />
      )}

      {photoCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Reling-Foto</h3>
                <p className="text-sm text-slate-600">
                  {photoCustomer.firstName} {photoCustomer.lastName}
                </p>
              </div>
              <button
                onClick={() => setPhotoCustomer(null)}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                title="Schliessen"
                aria-label="Reling-Foto schließen"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 bg-slate-50">
              {(() => {
                const photos = Array.isArray((photoCustomer as any).roofRailPhotoDataUrls)
                  ? (photoCustomer as any).roofRailPhotoDataUrls.filter(Boolean)
                  : (photoCustomer as any).roofRailPhotoDataUrl ? [String((photoCustomer as any).roofRailPhotoDataUrl)] : [];
                if (!photos.length) return <div className="text-slate-500">Kein Foto vorhanden.</div>;
                const active = photos[Math.min(Math.max(photoIndex, 0), photos.length - 1)];
                return (
                  <div className="space-y-3">
                    <img
                      src={active}
                      alt="Reling-Foto"
                      className="w-full max-h-[60vh] object-contain rounded-xl border border-slate-200 bg-white"
                    />
                    {photos.length > 1 && (
                      <div className="flex flex-wrap gap-2">
                        {photos.map((url: string, idx: number) => (
                          <button
                            key={idx}
                            className={[
                              'w-16 h-16 rounded-lg overflow-hidden border bg-white',
                              idx === photoIndex ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300',
                            ].join(' ')}
                            onClick={() => setPhotoIndex(idx)}
                            title={idx === 0 ? 'Hauptfoto' : `Foto ${idx + 1}`}
                          >
                            <img src={url} alt="Reling-Foto Thumbnail" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="text-slate-600">
                        {photoIndex === 0 ? 'Hauptfoto' : `Foto ${photoIndex + 1}`} von {photos.length}
                      </div>
                      {photoIndex !== 0 && (
                        <button
                          className="px-3 py-2 rounded-md border border-slate-200 hover:bg-white text-sm"
                          onClick={async () => {
                            try {
                              const next = photos.slice();
                              const [picked] = next.splice(photoIndex, 1);
                              next.unshift(picked);
                              await onUpdateCustomer(photoCustomer.id, {
                                roofRailPhotoDataUrls: next,
                                roofRailPhotoDataUrl: next[0],
                              } as any);
                              // Update viewer state locally for immediate UI feedback.
                              setPhotoCustomer({ ...(photoCustomer as any), roofRailPhotoDataUrls: next, roofRailPhotoDataUrl: next[0] } as any);
                              setPhotoIndex(0);
                            } catch (e) {
                              console.warn('Failed to set primary photo:', e);
                            }
                          }}
                        >
                          Als Hauptfoto setzen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerList;

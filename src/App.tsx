import { useEffect, useMemo, useState } from 'react';
import type { AISettings, Customer, GmailAttachmentSummary, GoogleOAuthSettings, InboxImportResult, Invoice, InvoiceItem, MailTransportSettings, RentalRequest, RentalStatus } from './types';
import { getAllCustomers, createCustomer, updateCustomer, deleteCustomer, findCustomerByEmail, createMessage, updateRentalRequest, addCustomerDocumentBlob, getDocumentsByCustomer, getAllResources } from './services/sqliteService';
import { MessageBox } from './components/MessageBox';
import { KanbanBoard } from './components/KanbanBoard';
import CustomerList from './components/CustomerList';
import { Stammdaten } from './components/Stammdaten';
import { RentalRequestDetail } from './components/RentalRequestDetail';
import { createRentalRequest, transitionStatus } from './services/rentalService';
import { generateRentalId } from './services/rentalIdService';
import { fetchAllRentalRequests } from './services/rentalService';
import { InvoiceList } from './components/InvoiceList';
import { InvoiceEditor } from './components/InvoiceEditor';
import { createFollowUpInvoiceFromInvoice, fetchAllInvoices, fetchInvoiceById, reissueInvoice, removeInvoice, saveInvoice } from './services/invoiceService';
import SettingsPanel from './components/SettingsPanel';
import { testZAiConnection } from './services/zAiService';
import { findActiveResourcesForType } from './services/resourceService';
import { testGoogleContactsConnection } from './services/googleContactsService';
import { getMessageAttachmentDataWithClientId, listInboxThreads } from './services/googleGmailService';
import Inbox from './components/Inbox';
import { checkAvailabilityWithClientId } from './services/googleCalendarService';
import { calculateWebsitePrice } from './services/pricingService';
import CalendarPanel from './components/CalendarPanel';
import Vermietungszubehoer from './components/Vermietungszubehoer';
import { runDesktopAutoUpdate } from './services/desktopUpdaterService';
import { formatDisplayRef } from './utils/displayId';

type View =
  | 'dashboard'
  | 'inbox'
  | 'nachrichtenbox'
  | 'vorgaenge'
  | 'kalender'
  | 'kunden'
  | 'stammdaten'
  | 'zubehoer'
  | 'belege'
  | 'einstellungen';

export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedRentalId, setSelectedRentalId] = useState<string | null>(null);
  const [kanbanKey, setKanbanKey] = useState(0);

  // Invoices UI state
  const [editingInvoice, setEditingInvoice] = useState<Partial<Invoice> | null>(null);
  const [editingInvoiceItems, setEditingInvoiceItems] = useState<InvoiceItem[] | null>(null);
  const [editingInvoiceContext, setEditingInvoiceContext] = useState<{
    rentalId?: string;
    nextRentalStatus?: RentalStatus;
  } | null>(null);
  const [invoiceListKey, setInvoiceListKey] = useState(0);
  const [dashboardRentals, setDashboardRentals] = useState<RentalRequest[]>([]);
  const [dashboardInvoices, setDashboardInvoices] = useState<Invoice[]>([]);
  const [dashboardResourceTotal, setDashboardResourceTotal] = useState(0);

  const [aiSettings, setAiSettings] = useState<AISettings>({ provider: 'perplexica', enableWebSearch: true });
  const [googleOAuthSettings, setGoogleOAuthSettings] = useState<GoogleOAuthSettings>(() => {
    const envClientId = (import.meta as any).env?.VITE_GOOGLE_OAUTH_CLIENT_ID || '';
    const envEnabled = String((import.meta as any).env?.VITE_GOOGLE_OAUTH_ENABLED || '').toLowerCase() === 'true';
    const storedClientId = localStorage.getItem('mietpark_google_oauth_client_id') || '';
    const storedEnabled = localStorage.getItem('mietpark_google_oauth_enabled');
    return {
      clientId: storedClientId || envClientId,
      enabled: storedEnabled !== null ? storedEnabled === 'true' : envEnabled,
      gmailEnabled: String((import.meta as any).env?.VITE_GMAIL_ENABLED || '').toLowerCase() === 'true',
    };
  });
  const [mailTransportSettings, setMailTransportSettings] = useState<MailTransportSettings>(() => {
    const raw = localStorage.getItem('mietpark_mail_transport_settings');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
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
        }
      } catch {
        // ignore broken local cache
      }
    }
    return {
      mode: 'gmail_web',
      bridgeUrl: 'http://127.0.0.1:8787/send',
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: '',
      smtpAppPassword: '',
      fromEmail: '',
      fromName: '',
    };
  });

  const [googleTestStatus, setGoogleTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [zAiTestStatus, setZAiTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [gmailTestStatus, setGmailTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  const navItems = useMemo(
    () =>
      [
        { id: 'dashboard' as const, label: 'Dashboard', icon: '📊', group: 'Kommunikation' as const },
        { id: 'inbox' as const, label: 'Postfach', icon: '📧', group: 'Kommunikation' as const },
        { id: 'nachrichtenbox' as const, label: 'Nachrichtenbox', icon: '💬', group: 'Kommunikation' as const },
        { id: 'vorgaenge' as const, label: 'Vorgänge', icon: '📋', group: 'Vorgänge' as const },
        { id: 'kalender' as const, label: 'Kalender', icon: '🗓️', group: 'Vorgänge' as const },
        { id: 'belege' as const, label: 'Belege', icon: '🧾', group: 'Abrechnung' as const },
        { id: 'kunden' as const, label: 'Kunden', icon: '👥', group: 'Stammdaten' as const },
        { id: 'stammdaten' as const, label: 'Vermietungsgegenstände', icon: '📦', group: 'Stammdaten' as const },
        { id: 'zubehoer' as const, label: 'Vermietungszubehör', icon: '🧰', group: 'Stammdaten' as const },
        { id: 'einstellungen' as const, label: 'Einstellungen', icon: '⚙️', group: 'System' as const },
      ] satisfies Array<{ id: View; label: string; icon: string; group: 'Kommunikation' | 'Vorgänge' | 'Stammdaten' | 'Abrechnung' | 'System' }>,
    []
  );

  const openStatuses: RentalStatus[] = ['neu', 'info_fehlt', 'check_verfuegbarkeit', 'angebot_gesendet', 'angenommen', 'uebergabe_rueckgabe'];
  const toLocalDayStart = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const openRentalsCount = useMemo(
    () =>
      dashboardRentals.filter((r) => {
        if (!openStatuses.includes(r.status)) return false;
        const endDay = toLocalDayStart(r.rentalEnd);
        const todayDay = toLocalDayStart(Date.now());
        return endDay >= todayDay;
      }).length,
    [dashboardRentals]
  );
  const draftInvoicesCount = useMemo(
    () => dashboardInvoices.filter((i) => i.state === 'entwurf').length,
    [dashboardInvoices]
  );
  const pendingInvoicesCount = useMemo(
    () => dashboardInvoices.filter((i) => i.state === 'gesendet').length,
    [dashboardInvoices]
  );
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const activeIssuedCount = useMemo(
    () =>
      dashboardRentals.filter((r) => {
        if (!openStatuses.includes(r.status)) return false;
        const startDay = toLocalDayStart(r.rentalStart);
        const endDay = toLocalDayStart(r.rentalEnd);
        return startDay <= today && endDay >= today;
      }).length,
    [dashboardRentals, today]
  );
  const resourceAvailableCount = Math.max(0, dashboardResourceTotal - activeIssuedCount);
  const upcomingRentals = useMemo(
    () =>
      dashboardRentals
        .filter((r) => {
          if (!openStatuses.includes(r.status)) return false;
          const endDay = toLocalDayStart(r.rentalEnd);
          return endDay >= today;
        })
        .sort((a, b) => a.rentalStart - b.rentalStart)
        .slice(0, 5),
    [dashboardRentals, today]
  );
  const navBadges = useMemo(
    () => ({
      vorgaenge: openRentalsCount,
      belege: pendingInvoicesCount + draftInvoicesCount,
    }),
    [openRentalsCount, pendingInvoicesCount, draftInvoicesCount]
  );
  const navGroups = useMemo(
    () => ['Kommunikation', 'Vorgänge', 'Stammdaten', 'Abrechnung', 'System'] as const,
    []
  );

  async function loadCustomers() {
    const loaded = await getAllCustomers();
    setCustomers(loaded);
  }

  async function loadDashboardData() {
    try {
      const [rentals, invoices, resources] = await Promise.all([
        fetchAllRentalRequests(),
        fetchAllInvoices(),
        getAllResources(),
      ]);
      setDashboardRentals(rentals);
      setDashboardInvoices(invoices);
      setDashboardResourceTotal(resources.filter((r) => r.isActive).length);
    } catch (e) {
      console.warn('Dashboard-Daten konnten nicht geladen werden:', e);
    }
  }

  useEffect(() => {
    void runDesktopAutoUpdate();
  }, []);

  useEffect(() => {
    loadCustomers();
    void loadDashboardData();

    // Development: Seed test data on first run
    if (import.meta.env.DEV && localStorage.getItem('mietpark_dev_seed') !== 'done') {
      import('./dev/seedData.js').then(({ seedTestData }) => {
        seedTestData({ clear: false, verbose: true })
          .then(() => {
            localStorage.setItem('mietpark_dev_seed', 'done');
            // Reload customers after seeding
            loadCustomers();
          })
          .catch((error) => {
            console.error('Failed to seed test data:', error);
          });
      });
    }
  }, []);

  useEffect(() => {
    if (activeView === 'dashboard') {
      void loadDashboardData();
    }
  }, [activeView, kanbanKey, invoiceListKey]);

  useEffect(() => {
    // Persist for services that use default client id.
    localStorage.setItem('mietpark_google_oauth_client_id', googleOAuthSettings.clientId || '');
    localStorage.setItem('mietpark_google_oauth_enabled', String(Boolean(googleOAuthSettings.enabled)));
  }, [googleOAuthSettings.clientId, googleOAuthSettings.enabled]);

  useEffect(() => {
    localStorage.setItem('mietpark_mail_transport_settings', JSON.stringify(mailTransportSettings));
  }, [mailTransportSettings]);

  const openInvoiceEditorById = async (invoiceId: string) => {
    const loaded = await fetchInvoiceById(invoiceId);
    if (!loaded) {
      alert('Beleg nicht gefunden');
      return;
    }
    setEditingInvoiceContext(null);
    setEditingInvoice(loaded.invoice);
    setEditingInvoiceItems(loaded.items);
  };

  const onRentalRequestCreate = async (data: {
    customerId: string;
    productType: string;
    rentalStart: number;
    rentalEnd: number;
    message: string;
    channel: string;
    id?: string;
    createdAt?: number;
    gmailThreadId?: string | null;
    vehicleData?: {
      make?: string;
      model?: string;
      widthMm?: number;
      hsn?: string;
      tsn?: string;
      relingType?: string;
      ahkPresent?: string;
    };
  }) => {
    const now = data.createdAt ?? Date.now();

    const candidates = await findActiveResourcesForType(data.productType as any);
    let res = candidates[0] || null;

    // If Google OAuth is configured, try to pick an actually available resource for the requested period.
    if (googleOAuthSettings.enabled && googleOAuthSettings.clientId && candidates.length > 1) {
      for (const c of candidates) {
        if (!c.googleCalendarId) continue;
        try {
          const check = await checkAvailabilityWithClientId(
            c.googleCalendarId,
            new Date(data.rentalStart),
            new Date(data.rentalEnd),
            { clientId: googleOAuthSettings.clientId }
          );
          if (check.isAvailable) {
            res = c;
            break;
          }
        } catch {
          // Best-effort, fall back to first resource.
        }
      }
    }

    const calendarId = res?.googleCalendarId || '';
    const deposit = (data.productType === 'Heckbox' || data.productType === 'Dachbox XL' || data.productType === 'Dachbox M')
      ? 150
      : (res?.deposit ?? undefined);

    const includeRoofRack =
      data.productType === 'Dachbox XL' || data.productType === 'Dachbox M'
        ? true
        : undefined;

    const price = calculateWebsitePrice({
      productType: data.productType as any,
      start: new Date(data.rentalStart),
      end: new Date(data.rentalEnd),
      includeRoofRack,
    });

    let priceSnapshot: number | undefined = undefined;
    if ('error' in price) {
      // Fallback to legacy daily-rate calculation if pricing config is missing.
      const dailyRate = res?.dailyRate ?? 0;
      const days = Math.max(1, Math.ceil((data.rentalEnd - data.rentalStart) / (1000 * 60 * 60 * 24)));
      priceSnapshot = dailyRate ? Math.round(dailyRate * days * 100) / 100 : undefined;
    } else {
      priceSnapshot = price.total;
    }

    // Generiere menschenlesbare Anfrage-ID (Format: YYYYMMDD-NN, z.B. 20260218-01)
    // Nur wenn keine explizite ID übergeben wurde (z.B. bei Migration)
    const rentalId = data.id || await generateRentalId(new Date(now));

    const rental: RentalRequest = {
      id: rentalId,
      customerId: data.customerId,
      productType: data.productType as any,
      status: 'neu',
      gmailThreadId: data.gmailThreadId || undefined,
      rentalStart: data.rentalStart,
      rentalEnd: data.rentalEnd,
      includeRoofRack,
      vehicleMake: data.vehicleData?.make || undefined,
      vehicleModel: data.vehicleData?.model || undefined,
      vehicleWidthMm: Number(data.vehicleData?.widthMm || 0) || undefined,
      hsn: data.vehicleData?.hsn || undefined,
      tsn: data.vehicleData?.tsn || undefined,
      relingType: (data.vehicleData?.relingType as any) || undefined,
      ahkPresent: (data.vehicleData?.ahkPresent as any) || undefined,
      googleCalendarId: calendarId || undefined,
      priceSnapshot,
      deposit,
      createdAt: now,
      updatedAt: now,
    };
    await createRentalRequest(rental);
    setActiveView('vorgaenge');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-white',
          'transform transition-transform duration-200 ease-in-out',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
        ].join(' ')}
      >
        <div className="p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Mietpark CRM</h1>
            <button
              className="lg:hidden text-slate-300 hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Menü schließen"
            >
              ✕
            </button>
          </div>

          <nav className="mt-6 space-y-4">
            {navGroups.map((group) => (
              <div key={group}>
                <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group}</div>
                <div className="space-y-1">
                  {navItems
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActiveView(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={[
                          'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                          activeView === item.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                        ].join(' ')}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <span className="text-lg" aria-hidden="true">
                            {item.icon}
                          </span>
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.id in navBadges && (navBadges as any)[item.id] > 0 ? (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-white/20 text-white border border-white/25">
                            {(navBadges as any)[item.id]}
                          </span>
                        ) : null}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-20 bg-white border-b border-slate-200 p-3 flex items-center justify-between">
        <button
          onClick={() => setMobileMenuOpen((v) => !v)}
          className="px-2 py-1 text-slate-700"
          aria-label="Menü öffnen"
        >
          ☰
        </button>
        <div className="text-sm font-semibold text-slate-800">Mietpark CRM</div>
        <div className="w-8" />
      </div>

      {/* Main content */}
      <main className="flex-1 lg:ml-64 p-4 lg:p-8 mt-14 lg:mt-0">
        {activeView === 'dashboard' && (
          <div className="max-w-7xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
                <p className="mt-1 text-slate-600">Tagesübersicht mit den wichtigsten Aufgaben und Schnellaktionen.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                  onClick={() => setActiveView('inbox')}
                >
                  Postfach öffnen
                </button>
                <button
                  className="px-3 py-2 rounded-md border border-slate-200 bg-white text-sm hover:bg-slate-50"
                  onClick={() => setActiveView('vorgaenge')}
                >
                  Offene Vorgänge
                </button>
                <button
                  className="px-3 py-2 rounded-md border border-slate-200 bg-white text-sm hover:bg-slate-50"
                  onClick={() => setActiveView('belege')}
                >
                  Belege prüfen
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs text-amber-700">Offene Vorgänge</div>
                <div className="text-2xl font-semibold text-amber-900">{openRentalsCount}</div>
              </div>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <div className="text-xs text-indigo-700">Belege Entwurf</div>
                <div className="text-2xl font-semibold text-indigo-900">{draftInvoicesCount}</div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-xs text-rose-700">Belege Gesendet</div>
                <div className="text-2xl font-semibold text-rose-900">{pendingInvoicesCount}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs text-emerald-700">Aktiv ausgegeben</div>
                <div className="text-2xl font-semibold text-emerald-900">{activeIssuedCount}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-slate-900">Nächste Mietvorgänge</div>
                <div className="text-xs text-slate-500 mt-1">Früheste offenen Termine zuerst.</div>
                <div className="mt-3 space-y-2">
                  {upcomingRentals.length === 0 ? (
                    <div className="text-sm text-slate-600">Keine offenen Vorgänge vorhanden.</div>
                  ) : (
                    upcomingRentals.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setSelectedRentalId(r.id);
                          setActiveView('vorgaenge');
                        }}
                        className="w-full text-left rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
                      >
                        <div className="text-sm font-medium text-slate-900">{r.productType}</div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {new Date(r.rentalStart).toLocaleDateString('de-DE')} bis {new Date(r.rentalEnd).toLocaleDateString('de-DE')} · {r.status}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">{formatDisplayRef(r.id)}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-sm font-semibold text-slate-900">Heute im Fokus</div>
                <ul className="mt-2 text-sm text-slate-700 space-y-2">
                  <li>• {openRentalsCount} Vorgänge aktiv bearbeiten</li>
                  <li>• {pendingInvoicesCount} gesendete Belege nachfassen</li>
                  <li>• {draftInvoicesCount} Entwürfe finalisieren</li>
                  <li>• {activeIssuedCount} Ressource(n) aktuell im Einsatz</li>
                  <li>• {resourceAvailableCount} / {dashboardResourceTotal} heute verfügbar</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeView === 'inbox' && (
          <div className="max-w-5xl">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Postfach</h2>
            <Inbox
              clientId={googleOAuthSettings.clientId}
              aiSettings={aiSettings}
              customers={customers}
              onOpenSettings={() => setActiveView('einstellungen')}
              onImport={async (data): Promise<InboxImportResult> => {
                // 1) Ensure customer exists (match by email).
                let customer = await findCustomerByEmail(data.emailFrom);
                let customerCreated = false;
                const now = Date.now();
                const contactDate = typeof data.contactDate === 'number' && Number.isFinite(data.contactDate) ? data.contactDate : now;
                if (!customer) {
                  customerCreated = true;
                  customer = {
                    id: `customer_${now}`,
                    salutation: undefined,
                    firstName: data.customerNameHint?.firstName || '',
                    lastName: data.customerNameHint?.lastName || '',
                    email: data.emailFrom,
                    phone: data.customerPhoneHint?.trim() || '',
                    address: {
                      street: data.customerAddressHint?.street || '',
                      city: data.customerAddressHint?.city || '',
                      zipCode: data.customerAddressHint?.zipCode || '',
                      country: data.customerAddressHint?.country || 'Deutschland',
                    },
                    contactDate,
                    createdAt: now,
                    updatedAt: now,
                    notes: 'Erstellt aus Gmail Inbox',
                  };
                  await createCustomer(customer);
                  await loadCustomers();
                } else {
                  const patch: any = { ...customer };
                  let changed = false;

                  // Backfill name if the existing contact is incomplete.
                  if ((!customer.firstName || !customer.lastName) && (data.customerNameHint?.firstName || data.customerNameHint?.lastName)) {
                    patch.firstName = customer.firstName || data.customerNameHint?.firstName || '';
                    patch.lastName = customer.lastName || data.customerNameHint?.lastName || '';
                    changed = true;
                  }

                  // Contact date = earliest known contact (first email).
                  if (!customer.contactDate || contactDate < customer.contactDate) {
                    patch.contactDate = contactDate;
                    changed = true;
                  }

                  // Backfill address if currently empty.
                  const addr = data.customerAddressHint;
                  if (addr) {
                    const hasAnyExisting =
                      Boolean(customer.address?.street?.trim()) ||
                      Boolean(customer.address?.zipCode?.trim()) ||
                      Boolean(customer.address?.city?.trim());
                    const hasAnyNew = Boolean(addr.street?.trim()) || Boolean(addr.zipCode?.trim()) || Boolean(addr.city?.trim());
                    if (!hasAnyExisting && hasAnyNew) {
                      patch.address = {
                        street: addr.street || '',
                        zipCode: addr.zipCode || '',
                        city: addr.city || '',
                        country: addr.country || customer.address?.country || 'Deutschland',
                      };
                      changed = true;
                    }
                  }

                  // Backfill phone if currently empty.
                  if (!customer.phone?.trim() && data.customerPhoneHint?.trim()) {
                    patch.phone = data.customerPhoneHint.trim();
                    changed = true;
                  }

                  if (changed) {
                    patch.updatedAt = now;
                    await updateCustomer(patch);
                    await loadCustomers();
                    customer = patch;
                  }
                }
                if (!customer) {
                  throw new Error('Kunde konnte nicht ermittelt werden.');
                }

                // 1b) Auto-import attachments (PDFs as customer documents; first image as roof-rail photo if missing).
                const attachmentStats = {
                  pdfImported: 0,
                  pdfSkippedDuplicate: 0,
                  pdfSkippedTooLarge: 0,
                  pdfFailed: 0,
                  imageImported: 0,
                  imageSkippedAlreadySet: 0,
                  imageFailed: 0,
                };
                try {
                  const attachments: GmailAttachmentSummary[] = Array.isArray(data.gmailAttachments) ? data.gmailAttachments : [];
                  if (googleOAuthSettings.enabled && googleOAuthSettings.clientId && attachments.length) {
                    const hasExplicitActions = attachments.some((a: any) => Boolean((a as any).importAs));
                    const docs = await getDocumentsByCustomer(customer.id);
                    const already = new Set(
                      docs
                        .map((d: any) => `${d.gmailMessageId || ''}:${d.gmailAttachmentId || ''}`)
                        .filter((k: string) => k !== ':')
                    );

                    const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
                    const pdfs = attachments.filter((a) => {
                      const mt = String(a.mimeType || '').toLowerCase();
                      const name = String(a.filename || '').toLowerCase();
                      const isPdf = mt === 'application/pdf' || name.endsWith('.pdf');
                      if (!isPdf) return false;
                      if (hasExplicitActions && (a as any).importAs !== 'document') return false;
                      const key = `${a.messageId}:${a.attachmentId}`;
                      if (already.has(key)) {
                        attachmentStats.pdfSkippedDuplicate += 1;
                        return false;
                      }
                      const sz = typeof a.sizeBytes === 'number' ? a.sizeBytes : undefined;
                      if (sz !== undefined && sz > MAX_PDF_BYTES) {
                        attachmentStats.pdfSkippedTooLarge += 1;
                        return false;
                      }
                      return true;
                    });

                    for (const a of pdfs) {
                      try {
                        const { dataBase64, sizeBytes } = await getMessageAttachmentDataWithClientId({
                          clientId: googleOAuthSettings.clientId,
                          messageId: a.messageId,
                          attachmentId: a.attachmentId,
                        });
                        const effectiveSize = (typeof a.sizeBytes === 'number' ? a.sizeBytes : sizeBytes);
                        if (typeof effectiveSize === 'number' && effectiveSize > MAX_PDF_BYTES) {
                          attachmentStats.pdfSkippedTooLarge += 1;
                          continue;
                        }

                        const bin = atob(dataBase64);
                        const bytes = new Uint8Array(bin.length);
                        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                        const blob = new Blob([bytes], { type: a.mimeType || 'application/pdf' });

                        const id =
                          (globalThis as any).crypto?.randomUUID?.() ||
                          `doc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
                        await addCustomerDocumentBlob(
                          {
                            id,
		                    customerId: customer!.id,
                            filename: a.filename?.trim() || `dokument_${Date.now()}.pdf`,
                            mimeType: a.mimeType || 'application/pdf',
                            sizeBytes: typeof a.sizeBytes === 'number' ? a.sizeBytes : sizeBytes,
	                            category: 'Sonstiges',
                            source: 'gmail',
                            gmailThreadId: data.gmailThreadId || undefined,
                            gmailMessageId: a.messageId,
                            gmailAttachmentId: a.attachmentId,
                            createdAt: Date.now(),
                          },
                          blob
                        );
                        attachmentStats.pdfImported += 1;
                      } catch {
                        attachmentStats.pdfFailed += 1;
                      }
                    }

                    const currentPhotos = Array.isArray((customer as any).roofRailPhotoDataUrls)
                      ? (customer as any).roofRailPhotoDataUrls.filter(Boolean)
                      : (customer as any).roofRailPhotoDataUrl ? [String((customer as any).roofRailPhotoDataUrl)] : [];
                    const normalizeImageAttachment = async (a: any): Promise<string> => {
                      const { dataBase64 } = await getMessageAttachmentDataWithClientId({
                        clientId: googleOAuthSettings.clientId,
                        messageId: a.messageId,
                        attachmentId: a.attachmentId,
                      });
                      const mime = (a.mimeType || 'image/jpeg').toLowerCase();
                      const dataUrl = `data:${mime};base64,${dataBase64}`;
                      const img = new Image();
                      img.decoding = 'async';
                      img.src = dataUrl;
                      await new Promise<void>((resolve, reject) => {
                        img.onload = () => resolve();
                        img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
                      });
                      const w = img.naturalWidth || img.width;
                      const h = img.naturalHeight || img.height;
                      const scale = Math.min(1, 1600 / Math.max(w || 1, h || 1));
                      const tw = Math.max(1, Math.round((w || 1) * scale));
                      const th = Math.max(1, Math.round((h || 1) * scale));
                      const canvas = document.createElement('canvas');
                      canvas.width = tw;
                      canvas.height = th;
                      const ctx = canvas.getContext('2d');
                      if (!ctx) throw new Error('Canvas nicht verfuegbar');
                      ctx.drawImage(img, 0, 0, tw, th);
                      return canvas.toDataURL('image/jpeg', 0.85);
                    };

                    if (hasExplicitActions) {
                      const imagesToImport = attachments
                        .filter((a: any) => (a as any).importAs === 'roof_photo')
                        .filter((a: any) => String(a.mimeType || '').toLowerCase().startsWith('image/'))
                        .slice(0, 6);

                      if (imagesToImport.length) {
                        const nextPhotos = currentPhotos.slice();
                        let changed = false;
                        for (const a of imagesToImport) {
                          try {
                            const normalized = await normalizeImageAttachment(a);
                            nextPhotos.push(normalized);
                            changed = true;
                            attachmentStats.imageImported += 1;
                          } catch {
                            attachmentStats.imageFailed += 1;
                          }
                        }
                        if (changed) {
                          const updated = {
                            ...customer,
                            roofRailPhotoDataUrls: nextPhotos.length ? nextPhotos : undefined,
                            roofRailPhotoDataUrl: nextPhotos[0] || undefined,
                            updatedAt: Date.now(),
                          } as any;
                          await updateCustomer(updated);
                          await loadCustomers();
                          customer = updated;
                        }
                      }
                    } else {
                      const shouldSetRoofPhoto = currentPhotos.length === 0;
                      if (shouldSetRoofPhoto) {
                        const firstImage = attachments.find((a) => String(a.mimeType || '').toLowerCase().startsWith('image/'));
                        if (firstImage) {
                          try {
                            const normalized = await normalizeImageAttachment(firstImage);
                            const nextPhotos = [normalized];
                            const updated = {
                              ...customer,
                              roofRailPhotoDataUrls: nextPhotos,
                              roofRailPhotoDataUrl: nextPhotos[0],
                              updatedAt: Date.now()
                            } as any;
                            await updateCustomer(updated);
                            await loadCustomers();
                            customer = updated;
                            attachmentStats.imageImported += 1;
                          } catch {
                            attachmentStats.imageFailed += 1;
                          }
                        }
                      } else {
                        const images = attachments.filter((a) => String(a.mimeType || '').toLowerCase().startsWith('image/'));
                        if (images.length) attachmentStats.imageSkippedAlreadySet += images.length;
                      }
                    }
                  }
                } catch (e) {
                  console.warn('Auto attachment import failed (best-effort):', e);
                }

                // 2) Create rental request.
                const usedFallbackDates = !(typeof data.rentalStart === 'number' && typeof data.rentalEnd === 'number');
                const start = data.rentalStart ?? (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  return d.getTime();
                })();
                const end = data.rentalEnd ?? (start + 7 * 24 * 60 * 60 * 1000);

                const isClosed = (s: any) =>
                  s === 'archiviert' || s === 'abgeschlossen' || s === 'abgelehnt' || s === 'storniert' || s === 'noshow';
                const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
                  aStart < bEnd && bStart < aEnd;

                let targetRentalId: string | null = null;
                let existingRental: any = null;
                try {
                  const all = await fetchAllRentalRequests();
                  // Primary: same Gmail thread => same Vorgang (dates can change within the conversation).
                  if (data.gmailThreadId) {
                    existingRental = all.find((r) => r.gmailThreadId === data.gmailThreadId);
                  }
                  // Fallback: open + overlapping (same customer/product) to avoid accidental duplicates.
                  if (!existingRental) {
                    existingRental = all.find((r) =>
                      r.customerId === customer!.id &&
                      r.productType === (data.productType as any) &&
                      !isClosed(r.status) &&
                      r.rentalStart && r.rentalEnd &&
                      overlaps(r.rentalStart, r.rentalEnd, start, end)
                    );
                  }
                  if (existingRental) targetRentalId = existingRental.id;
                } catch {
                  // Ignore and fall back to creating a new rental.
                }

                let rentalAction: 'created' | 'updated' = 'updated';
                if (!targetRentalId) {
                  const createdAt = Date.now();
                  // Use the dedicated Vorgangs-/Anfrage-Nummernkreis (YYYYMMDD-NN).
                  targetRentalId = await generateRentalId(new Date(createdAt));
                  rentalAction = 'created';
                  await onRentalRequestCreate({
                    id: targetRentalId,
                    createdAt,
	                  customerId: customer!.id,
                    productType: data.productType,
                    rentalStart: start,
                    rentalEnd: end,
                    message: data.rawText,
                    channel: 'E-Mail',
                    gmailThreadId: data.gmailThreadId,
                  });
                } else {
                  // If this is the same Gmail conversation, update the existing Vorgang's dates (best-effort)
                  // so we don't create a second Vorgang for "neuer Zeitraum" inside the same thread.
                  const canAutoUpdateDates = (s: any) =>
                    s === 'neu' || s === 'info_fehlt' || s === 'check_verfuegbarkeit' || s === 'angebot_gesendet';
                  if (existingRental && data.gmailThreadId && canAutoUpdateDates(existingRental.status)) {
                    const datesChanged = (existingRental.rentalStart !== start) || (existingRental.rentalEnd !== end);
                    if (datesChanged) {
                      // Recalculate price snapshot similar to initial creation (uses website pricing).
                      const includeRoofRack =
                        existingRental.productType === 'Dachbox XL' || existingRental.productType === 'Dachbox M'
                          ? Boolean(existingRental.includeRoofRack ?? true)
                          : undefined;
                      const price = calculateWebsitePrice({
                        productType: existingRental.productType as any,
                        start: new Date(start),
                        end: new Date(end),
                        includeRoofRack,
                      });
                      const nextSnapshot = 'error' in price ? existingRental.priceSnapshot : price.total;
                      await updateRentalRequest(existingRental.id, {
                        rentalStart: start,
                        rentalEnd: end,
                        priceSnapshot: nextSnapshot,
                        availabilityStatus: undefined,
                        availabilityCheckedAt: undefined,
                        updatedAt: Date.now(),
                      });
                    }
                  }
                  setActiveView('vorgaenge');
                }

                // 3) Store original message for traceability.
                await createMessage({
                  id: `msg_${Date.now()}`,
	                  customerId: customer!.id,
                  rentalRequestId: targetRentalId || undefined,
                  gmailThreadId: data.gmailThreadId || undefined,
                  message: data.rawText,
                  channel: 'E-Mail',
                  receivedAt: contactDate,
                  createdAt: Date.now(),
                  isIncoming: true,
                  suggestedProductType: data.productType,
                  extractedInfo: {
                    productType: data.productType,
                    rentalStart: start,
                    rentalEnd: end,
                  },
                } as any);

                // UX: Nach Inbox-Import direkt im Vorgänge-Board bleiben (kein erzwungenes Detail-Modal).
                // Details können weiterhin bewusst per Kartenklick geöffnet werden.
                setSelectedRentalId(null);

                return {
                  attachmentStats,
                  customerCreated,
                  rentalAction,
                  rentalId: targetRentalId || undefined,
                  usedFallbackDates,
                };
              }}
            />
          </div>
        )}

        {activeView === 'zubehoer' && (
          <div className="max-w-6xl">
            <Vermietungszubehoer />
          </div>
        )}

        {activeView === 'nachrichtenbox' && (
          <div className="max-w-5xl">
            <MessageBox
              customers={customers}
              onCustomerCreate={async (c) => {
                await createCustomer(c);
                await loadCustomers();
              }}
              onRentalRequestCreate={onRentalRequestCreate}
            />
          </div>
        )}

        {activeView === 'vorgaenge' && (
          <div className="max-w-7xl">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Vorgänge</h2>
            <div className="h-[calc(100vh-140px)]">
              <KanbanBoard
                key={kanbanKey}
                customers={customers}
                onCardClick={(r) => setSelectedRentalId(r.id)}
                onOpenInvoice={async (invoiceId) => {
                  setActiveView('belege');
                  await openInvoiceEditorById(invoiceId);
                }}
              />
            </div>
          </div>
        )}

        {activeView === 'kalender' && (
          <CalendarPanel
            clientId={googleOAuthSettings.clientId}
            enabled={Boolean(googleOAuthSettings.enabled)}
            onOpenSettings={() => setActiveView('einstellungen')}
          />
        )}

        {activeView === 'kunden' && (
          <div className="max-w-7xl">
            <CustomerList
              customers={customers}
              googleOAuthSettings={googleOAuthSettings}
              mailTransportSettings={mailTransportSettings}
              googleInitialized={false}
              firecrawlAvailable={false}
              onOpenSettings={() => setActiveView('einstellungen')}
              onAddCustomer={async (c) => {
                await createCustomer(c);
                await loadCustomers();
              }}
              onUpdateCustomer={async (id, patch) => {
                const current = customers.find((c) => c.id === id);
                if (!current) return;
                await updateCustomer({ ...current, ...patch, updatedAt: Date.now() });
                await loadCustomers();
              }}
              onDeleteCustomer={async (id) => {
                await deleteCustomer(id);
                await loadCustomers();
              }}
            />
          </div>
        )}

        {activeView === 'stammdaten' && (
          <div className="max-w-7xl">
            <Stammdaten />
          </div>
        )}

        {activeView === 'belege' && (
          <div className="max-w-7xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-slate-900">Belege</h2>
              <button
                className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                onClick={() => {
                  setEditingInvoiceContext(null);
                  setEditingInvoice({});
                  setEditingInvoiceItems([]);
                }}
              >
                + Neuer Beleg
              </button>
            </div>

            <InvoiceList
              key={invoiceListKey}
              customers={customers}
              mailTransportSettings={mailTransportSettings}
              onCreate={() => {
                setEditingInvoiceContext(null);
                setEditingInvoice({});
                setEditingInvoiceItems([]);
              }}
              onEdit={(inv) => {
                void (async () => {
                  const loaded = await fetchInvoiceById(inv.id);
                  setEditingInvoiceContext(null);
                  setEditingInvoice(loaded?.invoice || inv);
                  setEditingInvoiceItems(loaded?.items || []);
                })();
              }}
              onConvertToOrder={async (invoiceId) => {
                const source = await fetchInvoiceById(invoiceId);
                const nextId = await createFollowUpInvoiceFromInvoice(invoiceId, 'Auftrag');
                if (source?.invoice?.rentalRequestId) {
                  try {
                    await transitionStatus(source.invoice.rentalRequestId, 'angenommen');
                    setKanbanKey((k) => k + 1);
                  } catch (e) {
                    console.error('Status sync failed after Angebot -> Auftrag:', e);
                    try {
                      await removeInvoice(nextId);
                    } catch (rollbackError) {
                      console.error('Rollback failed after status sync error:', rollbackError);
                    }
                    alert('Status konnte nicht aktualisiert werden. Der neu erstellte Auftrag wurde zur Konsistenz wieder entfernt.');
                    setInvoiceListKey((k) => k + 1);
                    return;
                  }
                }
                setInvoiceListKey((k) => k + 1);
                await openInvoiceEditorById(nextId);
              }}
              onConvertToInvoice={async (invoiceId) => {
                const source = await fetchInvoiceById(invoiceId);
                const nextId = await createFollowUpInvoiceFromInvoice(invoiceId, 'Rechnung');
                if (source?.invoice?.rentalRequestId) {
                  try {
                    await transitionStatus(source.invoice.rentalRequestId, 'abgeschlossen');
                    setKanbanKey((k) => k + 1);
                  } catch (e) {
                    console.error('Status sync failed after Auftrag -> Rechnung:', e);
                    try {
                      await removeInvoice(nextId);
                    } catch (rollbackError) {
                      console.error('Rollback failed after status sync error:', rollbackError);
                    }
                    alert('Status konnte nicht aktualisiert werden. Die neu erstellte Rechnung wurde zur Konsistenz wieder entfernt.');
                    setInvoiceListKey((k) => k + 1);
                    return;
                  }
                }
                setInvoiceListKey((k) => k + 1);
                await openInvoiceEditorById(nextId);
              }}
            />
          </div>
        )}

        {activeView === 'einstellungen' && (
          <div className="max-w-3xl">
            <SettingsPanel
              settings={aiSettings}
              googleOAuthSettings={googleOAuthSettings}
              mailTransportSettings={mailTransportSettings}
              googleTestStatus={googleTestStatus as any}
              zAiTestStatus={zAiTestStatus as any}
              gmailTestStatus={gmailTestStatus as any}
              onSettingsChange={(next) => {
                setAiSettings(next);
                setZAiTestStatus('idle');
              }}
              onGoogleOAuthChange={(next) => {
                setGoogleOAuthSettings(next);
                setGoogleTestStatus('idle');
                setGmailTestStatus('idle');
              }}
              onMailTransportChange={(next) => {
                setMailTransportSettings(next);
              }}
              onTestGoogleConnection={async () => {
                setGoogleTestStatus('testing');
                const ok = await testGoogleContactsConnection({ clientId: googleOAuthSettings.clientId });
                setGoogleTestStatus(ok ? 'success' : 'error');
                return ok;
              }}
              onTestZAiConnection={async () => {
                setZAiTestStatus('testing');
                const ok = await testZAiConnection(aiSettings);
                setZAiTestStatus(ok ? 'success' : 'error');
                return ok;
              }}
              onTestGmailConnection={async () => {
                setGmailTestStatus('testing');
                try {
                  await listInboxThreads({ clientId: googleOAuthSettings.clientId, maxResults: 1 });
                  setGmailTestStatus('success');
                  return true;
                } catch {
                  setGmailTestStatus('error');
                  return false;
                }
              }}
            />
          </div>
        )}
      </main>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-10 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Rental detail modal */}
      {selectedRentalId && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="font-semibold text-slate-800">Vorgang</div>
              <button className="text-slate-500 hover:text-slate-800" onClick={() => setSelectedRentalId(null)} aria-label="Schließen">
                ✕
              </button>
            </div>
            <div className="p-4">
              <RentalRequestDetail
                rentalId={selectedRentalId}
                customers={customers}
                mailTransportSettings={mailTransportSettings}
                onClose={() => setSelectedRentalId(null)}
                onRefresh={() => setKanbanKey((k) => k + 1)}
                onPrepareInvoiceDraft={({ rentalId, invoice, items, nextRentalStatus }) => {
                  setEditingInvoiceContext({ rentalId, nextRentalStatus });
                  setEditingInvoice(invoice);
                  setEditingInvoiceItems(items);
                  setSelectedRentalId(null);
                  setActiveView('belege');
                }}
                onOpenInvoice={async (invoiceId) => {
                  setSelectedRentalId(null);
                  setActiveView('belege');
                  await openInvoiceEditorById(invoiceId);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Invoice editor modal */}
      {editingInvoice && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="font-semibold text-slate-800">
                {editingInvoice?.id ? 'Beleg bearbeiten' : 'Beleg erstellen'}
              </div>
              <button
                className="text-slate-500 hover:text-slate-800"
                onClick={() => {
                  setEditingInvoiceContext(null);
                  setEditingInvoice(null);
                }}
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <InvoiceEditor
                invoice={editingInvoice}
                items={editingInvoiceItems || []}
                customers={customers}
                onSave={async (inv, items) => {
                  const wasCreate = !inv.id;
                  const savedInvoiceId = await saveInvoice(inv, items);
                  if (editingInvoiceContext?.rentalId && editingInvoiceContext.nextRentalStatus) {
                    try {
                      await transitionStatus(editingInvoiceContext.rentalId, editingInvoiceContext.nextRentalStatus);
                      setKanbanKey((k) => k + 1);
                    } catch (e: any) {
                      if (wasCreate) {
                        try {
                          await removeInvoice(savedInvoiceId);
                        } catch (rollbackError) {
                          console.error('Rollback failed after status transition error:', rollbackError);
                        }
                      }
                      const msg = e?.error || e?.message || 'Status konnte nicht automatisch gesetzt werden.';
                      alert(`${msg}${wasCreate ? '\n\nDer neu erstellte Beleg wurde zur Konsistenz wieder entfernt.' : ''}`);
                      return;
                    }
                  }
                  setInvoiceListKey((k) => k + 1);
                  setEditingInvoiceContext(null);
                  setEditingInvoice(null);
                }}
                onConvertToOrder={async (invoiceId) => {
                  const source = await fetchInvoiceById(invoiceId);
                  const nextId = await createFollowUpInvoiceFromInvoice(invoiceId, 'Auftrag');
                  if (source?.invoice?.rentalRequestId) {
                    try {
                      await transitionStatus(source.invoice.rentalRequestId, 'angenommen');
                      setKanbanKey((k) => k + 1);
                    } catch (e) {
                      console.error('Status sync failed after Angebot -> Auftrag:', e);
                      try {
                        await removeInvoice(nextId);
                      } catch (rollbackError) {
                        console.error('Rollback failed after status sync error:', rollbackError);
                      }
                      alert('Status konnte nicht aktualisiert werden. Der neu erstellte Auftrag wurde zur Konsistenz wieder entfernt.');
                      setInvoiceListKey((k) => k + 1);
                      return;
                    }
                  }
                  setInvoiceListKey((k) => k + 1);
                  await openInvoiceEditorById(nextId);
                }}
                onConvertToInvoice={async (invoiceId) => {
                  const source = await fetchInvoiceById(invoiceId);
                  const nextId = await createFollowUpInvoiceFromInvoice(invoiceId, 'Rechnung');
                  if (source?.invoice?.rentalRequestId) {
                    try {
                      await transitionStatus(source.invoice.rentalRequestId, 'abgeschlossen');
                      setKanbanKey((k) => k + 1);
                    } catch (e) {
                      console.error('Status sync failed after Auftrag -> Rechnung:', e);
                      try {
                        await removeInvoice(nextId);
                      } catch (rollbackError) {
                        console.error('Rollback failed after status sync error:', rollbackError);
                      }
                      alert('Status konnte nicht aktualisiert werden. Die neu erstellte Rechnung wurde zur Konsistenz wieder entfernt.');
                      setInvoiceListKey((k) => k + 1);
                      return;
                    }
                  }
                  setInvoiceListKey((k) => k + 1);
                  await openInvoiceEditorById(nextId);
                }}
                onReissue={async (invoiceId) => {
                  const nextId = await reissueInvoice(invoiceId);
                  setInvoiceListKey((k) => k + 1);
                  await openInvoiceEditorById(nextId);
                }}
                onClose={() => {
                  setEditingInvoiceContext(null);
                  setEditingInvoice(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

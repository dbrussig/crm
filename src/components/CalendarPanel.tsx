import { useEffect, useMemo, useState } from 'react';
import type { AccessoryCalendarEvent, AccessoryCalendarMapping, RentalAccessory, Resource } from '../types';
import { listCalendarsWithClientId, type GoogleCalendarListEntry, listEventsWithClientId, type GoogleCalendarEvent } from '../services/googleCalendarService';
import {
  deleteAccessoryCalendarMapping,
  getAccessoryCalendarGlobalMappingId,
  getAllAccessories,
  getAllInvoices,
  getAllResources,
  getInvoiceItems,
  listAccessoryBookings,
  listAccessoryCalendarEventsRange,
  listAccessoryCalendarMappings,
  setAccessoryCalendarMapping,
  type AccessoryBooking,
} from '../services/sqliteService';
import { modifyResource } from '../services/resourceService';
import { generateInternalAccessoryCalendarEventsForInvoice, trySyncAccessoryCalendarEvents } from '../services/accessoryCalendarSyncService';

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDateMs(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  return d.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

type AccessoryMonthBar = {
  id: string;
  invoiceId: string;
  kind: AccessoryCalendarEvent['kind'];
  title: string;
  startIdx: number;
  endExcl: number;
  track: number;
  syncStatus: AccessoryCalendarEvent['syncStatus'];
  lastError: string | null;
};

function splitAccessoryBarLabel(e: { kind: string; title: string }): { primary: string; secondary: string } {
  const raw = String(e.title || '').trim();
  if (!raw) return { primary: '(ohne Titel)', secondary: '' };
  const parts = raw.split(' – ').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { primary: raw, secondary: '' };

  // Booking: Buyer – Träger #12 – 50 € / 135 €
  if (e.kind === 'booking') {
    return {
      primary: parts.slice(0, 2).join(' – ') || raw,
      secondary: parts.slice(2).join(' – '),
    };
  }

  // Pickup/Return: Abholung – Buyer – Träger #12
  return {
    primary: parts.slice(0, 2).join(' – ') || raw,
    secondary: parts.slice(2).join(' – '),
  };
}

export default function CalendarPanel(props: {
  clientId: string;
  enabled: boolean;
  onOpenSettings?: () => void;
  onOpenInvoice?: (invoiceId: string) => void;
}) {
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [accessories, setAccessories] = useState<RentalAccessory[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [days, setDays] = useState<number>(14);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [accessoryBookings, setAccessoryBookings] = useState<AccessoryBooking[]>([]);
  const [accessoryMappings, setAccessoryMappings] = useState<AccessoryCalendarMapping[]>([]);
  const [accessoryCalendarMonth, setAccessoryCalendarMonth] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [accessoryCalendarEvents, setAccessoryCalendarEvents] = useState<AccessoryCalendarEvent[]>([]);
  const [accessorySyncBusy, setAccessorySyncBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignBusyId, setAssignBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const showError = (text: string) => setNotice({ tone: 'error', text });

  const canUse = props.enabled && Boolean(props.clientId?.trim());

  const resourceByCalendarId = useMemo(() => {
    const map = new Map<string, Resource>();
    for (const r of resources) {
      if (r.googleCalendarId) map.set(r.googleCalendarId, r);
    }
    return map;
  }, [resources]);

  const accessoryById = useMemo(() => {
    const map = new Map<string, RentalAccessory>();
    for (const a of accessories) map.set(a.id, a);
    return map;
  }, [accessories]);

  const accessoryLabel = (accessoryId: string): string => {
    const a = accessoryById.get(accessoryId);
    if (!a) return accessoryId;
    const key = String(a.inventoryKey || '').trim();
    if (key) return `${key.startsWith('#') ? key : `#${key}`} — ${a.name}`;
    return a.name || accessoryId;
  };

  const accessoryCalendarIdByAccessoryId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of accessoryMappings) {
      if (m.googleCalendarId) map.set(m.accessoryId, m.googleCalendarId);
    }
    return map;
  }, [accessoryMappings]);

  const globalAccessoryCalendarId = accessoryCalendarIdByAccessoryId.get(getAccessoryCalendarGlobalMappingId()) || '';

  async function loadCalendars() {
    if (!canUse) return;
    setLoading(true);
    setError(null);
    try {
      const [cals, res, acc, maps] = await Promise.all([
        listCalendarsWithClientId({ clientId: props.clientId }),
        getAllResources(),
        getAllAccessories(),
        listAccessoryCalendarMappings(),
      ]);
      setCalendars(cals);
      setResources(res);
      setAccessories(acc);
      setAccessoryMappings(maps);
      if (!selectedCalendarId) {
        const firstResourceCal = res.find((r) => r.googleCalendarId)?.googleCalendarId;
        const pick = firstResourceCal || cals.find((c) => c.primary)?.id || cals[0]?.id || '';
        setSelectedCalendarId(pick);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents(calendarId: string, rangeDays: number) {
    if (!canUse || !calendarId) return;
    setLoading(true);
    setError(null);
    try {
      const start = new Date();
      const end = new Date(start.getTime() + Math.max(1, rangeDays) * 24 * 60 * 60 * 1000);
      const ev = await listEventsWithClientId({
        clientId: props.clientId,
        calendarId,
        timeMin: start,
        timeMax: end,
        maxResults: 250,
      });
      setEvents(ev);
    } catch (e: any) {
      setError(e?.message || String(e));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAccessoryBookings(rangeDays: number) {
    setError(null);
    try {
      const start = new Date();
      const end = new Date(start.getTime() + Math.max(1, rangeDays) * 24 * 60 * 60 * 1000);
      const rows = await listAccessoryBookings(start.getTime(), end.getTime());
      setAccessoryBookings(rows);
    } catch (e: any) {
      setAccessoryBookings([]);
      setError(e?.message || String(e));
    }
  }

  const monthRange = useMemo(() => {
    const base = new Date(accessoryCalendarMonth);
    base.setDate(1);
    base.setHours(0, 0, 0, 0);
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    return { startMs: start.getTime(), endMs: end.getTime(), daysInMonth, year: base.getFullYear(), month: base.getMonth() };
  }, [accessoryCalendarMonth]);

  async function loadAccessoryCalendarEvents() {
    try {
      const rows = await listAccessoryCalendarEventsRange(monthRange.startMs, monthRange.endMs);
      setAccessoryCalendarEvents(rows);
    } catch (e: any) {
      setAccessoryCalendarEvents([]);
      setError(e?.message || String(e));
    }
  }

  async function trySyncAccessoryCalendarVisibleRange() {
    if (!canUse) return;
    setAccessorySyncBusy(true);
    try {
      const rows = await listAccessoryCalendarEventsRange(monthRange.startMs, monthRange.endMs);
      const pending = rows.filter((e) => e.syncStatus !== 'synced' || !String(e.googleEventId || '').trim());
      if (pending.length > 0) {
        await trySyncAccessoryCalendarEvents(pending);
      }
      await loadAccessoryCalendarEvents();
      const maps = await listAccessoryCalendarMappings();
      setAccessoryMappings(maps);
    } finally {
      setAccessorySyncBusy(false);
    }
  }

  async function generateAccessoryCalendarFromInvoicesVisibleMonth() {
    setAccessorySyncBusy(true);
    try {
      const existingRows = await listAccessoryCalendarEventsRange(monthRange.startMs, monthRange.endMs);
      const invoiceIdsWithEvents = new Set(existingRows.map((e) => e.invoiceId));

      const invoices = await getAllInvoices();
      const candidates = invoices.filter((inv) => {
        if (typeof inv.servicePeriodStart !== 'number' || typeof inv.servicePeriodEnd !== 'number') return false;
        if (inv.state === 'storniert' || inv.state === 'abgelehnt' || inv.state === 'archiviert') return false;
        if (invoiceIdsWithEvents.has(inv.id)) return false;
        return inv.servicePeriodStart < monthRange.endMs && inv.servicePeriodEnd > monthRange.startMs;
      });

      for (const inv of candidates) {
        const items = await getInvoiceItems(inv.id);
        if (!items.some((it) => Boolean(String(it.assignedAccessoryId || '').trim()))) continue;
        await generateInternalAccessoryCalendarEventsForInvoice(inv, items);
      }

      await loadAccessoryCalendarEvents();
    } catch (e: any) {
      showError(e?.message || String(e));
    } finally {
      setAccessorySyncBusy(false);
    }
  }

  useEffect(() => {
    void loadCalendars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse]);

  useEffect(() => {
    // Local sources should also work when Google is not connected.
    getAllResources().then(setResources).catch(() => {});
    getAllAccessories().then(setAccessories).catch(() => {});
    listAccessoryCalendarMappings().then(setAccessoryMappings).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedCalendarId) return;
    void loadEvents(selectedCalendarId, days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCalendarId, days, canUse]);

  useEffect(() => {
    void loadAccessoryBookings(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  useEffect(() => {
    void loadAccessoryCalendarEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthRange.startMs, monthRange.endMs]);

  useEffect(() => {
    // Auto-retry sync when Google connection is available.
    void trySyncAccessoryCalendarVisibleRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse, monthRange.startMs, monthRange.endMs]);

  const selectedLabel = (() => {
    if (!selectedCalendarId) return '';
    const r = resourceByCalendarId.get(selectedCalendarId);
    if (r) return `${r.name} (${r.type})`;
    const c = calendars.find((x) => x.id === selectedCalendarId);
    return c?.summary || selectedCalendarId;
  })();

  const googleCalendarUrl = selectedCalendarId
    ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(selectedCalendarId)}`
    : '';

  const roofRacks = useMemo(() => {
    return accessories
      .filter((a) => a.isActive && a.category === 'Dachträger')
      .slice()
      .sort((a, b) => String(a.inventoryKey || a.name).localeCompare(String(b.inventoryKey || b.name), 'de'));
  }, [accessories]);

  const accessoryEventsByAccessoryId = useMemo(() => {
    const map = new Map<string, AccessoryCalendarEvent[]>();
    for (const e of accessoryCalendarEvents) {
      const bucket = map.get(e.accessoryId) || [];
      bucket.push(e);
      map.set(e.accessoryId, bucket);
    }
    for (const [k, v] of map.entries()) {
      v.sort((a, b) => a.startTime - b.startTime);
      map.set(k, v);
    }
    return map;
  }, [accessoryCalendarEvents]);

  const dayStarts = useMemo(() => {
    const out: number[] = [];
    for (let d = 0; d < monthRange.daysInMonth; d++) {
      const ms = new Date(monthRange.year, monthRange.month, d + 1).getTime();
      out.push(ms);
    }
    return out;
  }, [monthRange.daysInMonth, monthRange.month, monthRange.year]);

  const occupancyCountByAccessoryDay = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const a of roofRacks) {
      map.set(a.id, new Array(monthRange.daysInMonth).fill(0));
    }
    for (const e of accessoryCalendarEvents) {
      if (e.kind !== 'booking') continue;
      const counts = map.get(e.accessoryId);
      if (!counts) continue;
      for (let d = 0; d < monthRange.daysInMonth; d++) {
        const dayStart = dayStarts[d];
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;
        if (e.startTime < dayEnd && e.endTime > dayStart) {
          counts[d] += 1;
        }
      }
    }
    return map;
  }, [accessoryCalendarEvents, dayStarts, monthRange.daysInMonth, roofRacks]);

  const todayIdx = useMemo(() => {
    const now = new Date();
    if (now.getFullYear() !== monthRange.year) return -1;
    if (now.getMonth() !== monthRange.month) return -1;
    return now.getDate() - 1;
  }, [monthRange.month, monthRange.year]);

  const rackDotById = useMemo(() => {
    const dots = [
      'bg-emerald-500',
      'bg-blue-500',
      'bg-amber-400',
      'bg-purple-500',
      'bg-rose-400',
      'bg-indigo-500',
      'bg-cyan-500',
      'bg-orange-500',
    ];
    const map = new Map<string, string>();
    for (let i = 0; i < roofRacks.length; i++) {
      map.set(roofRacks[i].id, dots[i % dots.length]);
    }
    return map;
  }, [roofRacks]);

  const rackRowLayout = useMemo(() => {
    const monthStart = monthRange.startMs;
    const dayMs = 24 * 60 * 60 * 1000;
    const startOfDay = (ms: number) => {
      const d = new Date(ms);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };

    const kindWeight: Record<string, number> = { booking: 0, pickup: 1, return: 2 };

    const layoutByRackId = new Map<
      string,
      {
        rowStart: number;
        rowSpan: number;
        bars: AccessoryMonthBar[];
      }
    >();

    let rowStart = 2; // header = row 1

    for (const rack of roofRacks) {
      const ev = accessoryEventsByAccessoryId.get(rack.id) || [];
      const rawBars: Omit<AccessoryMonthBar, 'track'>[] = ev
        .filter((e) => e.kind === 'booking' || e.kind === 'pickup' || e.kind === 'return')
        .filter((e) => e.startTime < monthRange.endMs && e.endTime > monthRange.startMs)
        .map((e) => {
          const s0 = startOfDay(e.startTime);
          const e0 = startOfDay(Math.max(e.startTime, e.endTime - 1));
          const startIdx = Math.max(0, Math.min(monthRange.daysInMonth - 1, Math.floor((s0 - monthStart) / dayMs)));
          const endIdxIncl = Math.max(0, Math.min(monthRange.daysInMonth - 1, Math.floor((e0 - monthStart) / dayMs)));
          const endExcl = Math.max(startIdx + 1, Math.min(monthRange.daysInMonth, endIdxIncl + 1));
          return {
            id: e.id,
            invoiceId: e.invoiceId,
            kind: e.kind,
            title: e.title,
            startIdx,
            endExcl,
            syncStatus: e.syncStatus,
            lastError: e.lastError ?? null,
          };
        });

      // Prefer booking in track 0, then stack pickup/return under it when overlapping.
      rawBars.sort((a, b) => {
        const wa = kindWeight[String(a.kind)] ?? 9;
        const wb = kindWeight[String(b.kind)] ?? 9;
        if (wa !== wb) return wa - wb;
        const da = a.endExcl - a.startIdx;
        const db = b.endExcl - b.startIdx;
        if (db !== da) return db - da;
        return a.startIdx - b.startIdx;
      });

      const tracks: AccessoryMonthBar[][] = [];
      const bars: AccessoryMonthBar[] = [];

      for (const b of rawBars) {
        let pick = 0;
        while (true) {
          const t = tracks[pick] || [];
          const overlap = t.some((x) => b.startIdx < x.endExcl && b.endExcl > x.startIdx);
          if (!overlap) break;
          pick += 1;
        }
        if (!tracks[pick]) tracks[pick] = [];
        const bar: AccessoryMonthBar = { ...b, track: pick };
        tracks[pick].push(bar);
        bars.push(bar);
      }

      const rowSpan = Math.max(tracks.length, 1);
      layoutByRackId.set(rack.id, { rowStart, rowSpan, bars });
      rowStart += rowSpan;
    }

    return { layoutByRackId, totalRows: rowStart - 1 };
  }, [
    accessoryEventsByAccessoryId,
    monthRange.daysInMonth,
    monthRange.endMs,
    monthRange.month,
    monthRange.startMs,
    monthRange.year,
    roofRacks,
  ]);

  return (
    <div className="max-w-7xl">
      {notice && (
        <div
          className={[
            'mb-4 rounded-xl border px-4 py-3 text-sm whitespace-pre-line',
            notice.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-slate-200 bg-white text-slate-800',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-3">
            <div>{notice.text}</div>
            <button
              className="text-slate-600 hover:text-slate-900"
              onClick={() => setNotice(null)}
              aria-label="Hinweis schließen"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Kalender</h2>
          <p className="text-sm text-slate-600">Google Kalender anzeigen (Ressourcen-Kalender und eigene Kalender).</p>
        </div>
        <button
          className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
          onClick={() => loadCalendars()}
          disabled={!canUse || loading}
          title="Kalenderliste und Ressourcen neu laden"
        >
          Aktualisieren
        </button>
      </div>

      {!canUse && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-amber-900">Kalender noch nicht verbunden</div>
          <div className="text-sm text-amber-800 mt-1">
            Verbinde zuerst Google OAuth, damit Verfügbarkeiten und Termine geladen werden können.
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {props.onOpenSettings ? (
              <button
                type="button"
                className="px-3 py-2 rounded-md bg-amber-600 text-white text-sm hover:bg-amber-700"
                onClick={props.onOpenSettings}
              >
                Jetzt in Einstellungen verbinden
              </button>
            ) : null}
            <span className="text-xs text-amber-700">
              Danach hier mit „Aktualisieren“ Kalender laden.
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-slate-800 mb-2">Ressourcen</div>
          <div className="text-xs text-slate-500 mb-3">Schnellauswahl deiner Mietgeraete-Kalender.</div>
          <div className="space-y-2 max-h-[55vh] overflow-auto">
            {resources.filter((r) => r.isActive && r.googleCalendarId).map((r) => (
              <button
                key={r.id}
                className={[
                  'w-full text-left px-3 py-2 rounded-md border text-sm transition',
                  selectedCalendarId === r.googleCalendarId ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50',
                ].join(' ')}
                onClick={() => setSelectedCalendarId(r.googleCalendarId)}
                disabled={!canUse || loading}
              >
                <div className="font-medium text-slate-900">{r.name}</div>
                <div className="text-xs text-slate-600">{r.type}</div>
              </button>
            ))}
            {resources.filter((r) => r.isActive && r.googleCalendarId).length === 0 && (
              <div className="text-sm text-slate-600">Keine Ressourcen mit Kalender-Referenz konfiguriert (siehe Vermietungsgegenstände).</div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{selectedLabel || 'Kalender auswählen'}</div>
              {selectedCalendarId && (
                <div className="text-xs text-slate-500 truncate">{selectedCalendarId}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600 flex items-center gap-2">
                Zeitraum
                <select
                  className="px-2 py-1 rounded-md border border-slate-200 bg-white text-sm"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value || 14))}
                  disabled={!canUse || loading}
                  aria-label="Zeitraum in Tagen"
                >
                  <option value={7}>7 Tage</option>
                  <option value={14}>14 Tage</option>
                  <option value={30}>30 Tage</option>
                  <option value={60}>60 Tage</option>
                </select>
              </label>
              {googleCalendarUrl && (
                <a
                  className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                  href={googleCalendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  In Google Calendar öffnen
                </a>
              )}
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs text-slate-600">Kalender</label>
            <select
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
              value={selectedCalendarId}
              onChange={(e) => setSelectedCalendarId(e.target.value)}
              disabled={!canUse || loading}
              aria-label="Kalender auswählen"
            >
              <option value="">Bitte auswählen…</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.primary ? '[Primary] ' : '')}{c.summary || c.id}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <div className="text-sm font-semibold text-slate-800">Termine (nächste {days} Tage)</div>
            <div className="text-xs text-slate-500 mt-1">Anzeige ist eine Liste (Agenda). Bearbeiten bitte in Google Calendar.</div>

            {loading ? (
              <div className="mt-3 text-sm text-slate-600">Lade…</div>
            ) : events.length === 0 ? (
              <div className="mt-3 text-sm text-slate-600">Keine Termine im Zeitraum gefunden.</div>
            ) : (
              <div className="mt-3 space-y-2 max-h-[55vh] overflow-auto">
                {events.map((e) => (
                  <div key={e.id} className="rounded-lg border border-slate-200 p-3 border-l-4 border-l-emerald-500 bg-emerald-50/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{e.summary || '(ohne Titel)'}</div>
                        <div className="text-xs text-slate-600">
                          {fmtDateTime(e.start)} bis {fmtDateTime(e.end)}
                        </div>
                        {e.status && e.status !== 'confirmed' && (
                          <div className="text-xs text-amber-700 mt-1">Status: {e.status}</div>
                        )}
                        {e.description && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-slate-600 select-none">Beschreibung</summary>
                            <div className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">{e.description}</div>
                          </details>
                        )}
                      </div>
                      {e.htmlLink && (
                        <a
                          className="shrink-0 px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
                          href={e.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Öffnen
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6">
            <div className="text-sm font-semibold text-slate-800">Zubehör-Buchungen (intern)</div>
            <div className="text-xs text-slate-500 mt-1">
              Blau = Zubehör (intern). Reserviert ab Angebot, fest gebucht ab Auftrag/Rechnung.
            </div>

            {accessoryBookings.length === 0 ? (
              <div className="mt-3 text-sm text-slate-600">Keine internen Zubehör-Buchungen im Zeitraum.</div>
            ) : (
              <div className="mt-3 space-y-2 max-h-[40vh] overflow-auto">
                {accessoryBookings.map((b) => {
                  const badge = b.invoiceType === 'Angebot' ? 'Reserviert' : 'Gebucht';
                  return (
                    <div
                      key={`${b.invoiceId}:${b.accessoryId}:${b.servicePeriodStart}`}
                      className="rounded-lg border border-slate-200 p-3 border-l-4 border-l-blue-500 bg-blue-50/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {accessoryLabel(b.accessoryId)}
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            {fmtDateMs(b.servicePeriodStart)} bis {fmtDateMs(b.servicePeriodEnd)} · Beleg #{b.invoiceNo}
                          </div>
                          <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {badge}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">Dachträger-Kalender (intern)</div>
                <div className="text-xs text-slate-500 mt-1">
                  Monatsansicht pro Dachträger. Quelle ist die lokale DB; Google ist nur Sync-Ziel.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-2 py-1 rounded-md border border-slate-200 text-xs hover:bg-slate-50"
                  onClick={() => {
                    const d = new Date(accessoryCalendarMonth);
                    d.setMonth(d.getMonth() - 1);
                    d.setDate(1);
                    setAccessoryCalendarMonth(d);
                  }}
                  title="Vorheriger Monat"
                >
                  ◀
                </button>
                <div className="text-xs font-medium text-slate-700">
                  {accessoryCalendarMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
                </div>
                <button
                  className="px-2 py-1 rounded-md border border-slate-200 text-xs hover:bg-slate-50"
                  onClick={() => {
                    const d = new Date(accessoryCalendarMonth);
                    d.setMonth(d.getMonth() + 1);
                    d.setDate(1);
                    setAccessoryCalendarMonth(d);
                  }}
                  title="Nächster Monat"
                >
                  ▶
                </button>
                <button
                  className="px-2 py-1 rounded-md border border-slate-200 text-xs hover:bg-slate-50"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(1);
                    d.setHours(0, 0, 0, 0);
                    setAccessoryCalendarMonth(d);
                  }}
                  title="Zum aktuellen Monat"
                >
                  Heute
                </button>
                <button
                  className="px-3 py-1.5 rounded-md border border-slate-200 text-xs hover:bg-slate-50 disabled:opacity-60"
                  disabled={accessorySyncBusy}
                  onClick={() => generateAccessoryCalendarFromInvoicesVisibleMonth()}
                  title="Erstellt interne Dachträger-Termine aus bestehenden Belegen (nur wenn noch keine internen Termine existieren)."
                >
                  Aus Belegen generieren
                </button>
                <button
                  className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-60"
                  disabled={!canUse || accessorySyncBusy}
                  onClick={() => trySyncAccessoryCalendarVisibleRange()}
                  title={canUse ? 'Ausstehende Google-Syncs im Monat erneut versuchen' : 'Google OAuth ist nicht verbunden'}
                >
                  {accessorySyncBusy ? 'Sync…' : 'Sync jetzt'}
                </button>
              </div>
            </div>

            {roofRacks.length === 0 ? (
              <div className="mt-3 text-sm text-slate-600">Keine aktiven Dachträger im Zubehörkatalog.</div>
            ) : (
              <div className="mt-3 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
                <div
                  className="grid text-[11px] leading-none"
                  style={{ gridTemplateColumns: `240px repeat(${monthRange.daysInMonth}, 32px)` }}
                >
                  {/* Header */}
                  <div className="sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 font-semibold text-slate-600">
                    Dachträger
                  </div>
                  {Array.from({ length: monthRange.daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const date = new Date(monthRange.year, monthRange.month, day);
                    const dow = date.getDay(); // 0=So
                    const isWeekend = dow === 0 || dow === 6;
                    const isToday = todayIdx === i;
                    const dowLabel = date
                      .toLocaleDateString('de-DE', { weekday: 'short' })
                      .replace('.', '')
                      .toUpperCase();
                    return (
                      <div
                        key={`hdr-${day}`}
                        className={cn(
                          'border-b border-r border-slate-200 px-1 py-2 text-center',
                          isWeekend ? 'bg-slate-50/80' : 'bg-slate-50',
                          isToday && 'bg-blue-50'
                        )}
                        title={date.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                      >
                        <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{dowLabel}</div>
                        <div className="mt-1 flex justify-center">
                          <span
                            className={cn(
                              'h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                              isToday ? 'bg-blue-600 text-white shadow-sm shadow-blue-200' : 'text-slate-700'
                            )}
                          >
                            {day}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Rows */}
                  {roofRacks.map((rack, rowIdx) => {
                    const layout = rackRowLayout.layoutByRackId.get(rack.id);
                    const row = layout?.rowStart ?? 2 + rowIdx;
                    const rowSpan = layout?.rowSpan ?? 1;
                    const counts = occupancyCountByAccessoryDay.get(rack.id) || new Array(monthRange.daysInMonth).fill(0);
                    const dot = rackDotById.get(rack.id) || 'bg-slate-400';

                    const bars = (layout?.bars || []).map((e) => {
                      const gcStart = 2 + e.startIdx;
                      const gcEnd = 2 + e.endExcl;
                      const isFailed = e.syncStatus === 'failed';
                      const isPending = e.syncStatus !== 'synced';

                      const baseTone =
                        e.kind === 'booking'
                          ? 'bg-blue-600 border-blue-700'
                          : e.kind === 'pickup'
                            ? 'bg-slate-800 border-slate-900'
                            : 'bg-slate-600 border-slate-700';

                      const label = splitAccessoryBarLabel(e);

                      return (
                        <button
                          key={e.id}
                          type="button"
                          className={cn(
                            'z-10 mx-0.5 my-0.5 rounded-md px-2 py-1 text-left text-white shadow-sm border',
                            'transition-all hover:brightness-[0.98] active:scale-[0.99]',
                            baseTone,
                            isFailed && 'ring-2 ring-red-400',
                            isPending && 'opacity-85 hover:opacity-100'
                          )}
                          style={{ gridColumn: `${gcStart} / ${gcEnd}`, gridRow: String(row + (e.track || 0)) }}
                          title={`${e.title}\n\nStatus: ${e.syncStatus}${e.lastError ? `\n${e.lastError}` : ''}`}
                          onClick={() => props.onOpenInvoice?.(e.invoiceId)}
                        >
                          <span className="flex items-start gap-1.5 w-full min-w-0">
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-1.5', dot)} />
                            <span className="flex-1 min-w-0 leading-tight">
                              <span className="block truncate font-bold text-[10px]">{label.primary}</span>
                              {label.secondary ? (
                                <span className="block truncate text-[9px] mt-0.5 text-white/80 font-medium">{label.secondary}</span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      );
                    });

                    return (
                      <div key={`row-${rack.id}`} className="contents">
                        <div
                          className="sticky left-0 z-30 bg-white border-b border-r border-slate-200 px-3 py-2 text-xs font-medium text-slate-900 truncate flex items-center gap-2"
                          style={{ gridRow: `${row} / ${row + rowSpan}` }}
                          title={`${String(rack.inventoryKey || '').trim() ? `#${rack.inventoryKey} — ` : ''}${rack.name}`}
                        >
                          <span className={cn('w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-sm', dot)} />
                          {String(rack.inventoryKey || '').trim() ? `#${rack.inventoryKey} — ` : ''}{rack.name}
                        </div>

                        {Array.from({ length: monthRange.daysInMonth }).map((_, i) => {
                          const day = i + 1;
                          const date = new Date(monthRange.year, monthRange.month, day);
                          const dow = date.getDay();
                          const isWeekend = dow === 0 || dow === 6;
                          const c = counts[i] || 0;
                          const isToday = todayIdx === i;
                          const cls =
                            c > 1
                              ? 'bg-red-50'
                              : c === 1
                                ? 'bg-blue-50'
                                : isWeekend
                                  ? 'bg-slate-50'
                                  : 'bg-white';
                          const title =
                            c > 1
                              ? `Überschneidung: ${c} Buchungen`
                              : c === 1
                                ? 'Belegt'
                                : 'Frei';
                          return (
                            <div
                              key={`cell-${rack.id}-${day}`}
                              className={cn(
                                'border-b border-r border-slate-100',
                                cls,
                                isToday && 'bg-blue-50/40'
                              )}
                              style={{ gridRow: `${row} / ${row + rowSpan}` }}
                              title={title}
                            />
                          );
                        })}

                        {bars}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <details className="mt-4 rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800 select-none">
              Google Kalender-Zuordnung (Dachträger)
            </summary>
            <div className="mt-3 text-xs text-slate-500">
              Optional: Globaler Kalender für alle Dachträger oder Kalender pro Dachträger. Pro-Dachträger überschreibt global.
            </div>

            {!canUse ? (
              <div className="mt-3 text-sm text-slate-600">
                Google OAuth ist nicht verbunden (Einstellungen → Google OAuth).
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="rounded-md border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-700 mb-1">Globaler Dachträger-Kalender</div>
                  <select
                    className="w-full px-2 py-1 rounded-md border border-slate-200 bg-white text-sm"
                    value={globalAccessoryCalendarId}
                    onChange={async (e) => {
                      const next = e.target.value;
                      const key = getAccessoryCalendarGlobalMappingId();
                      if (!next) {
                        await deleteAccessoryCalendarMapping(key);
                      } else {
                        await setAccessoryCalendarMapping(key, next);
                      }
                      setAccessoryMappings(await listAccessoryCalendarMappings());
                    }}
                    disabled={loading || accessorySyncBusy}
                    aria-label="Globaler Dachträger Kalender"
                  >
                    <option value="">— kein Kalender —</option>
                    {calendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {(c.primary ? '[Primary] ' : '')}{c.summary || c.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  {roofRacks.map((rack) => {
                    const current = accessoryCalendarIdByAccessoryId.get(rack.id) || '';
                    const effective = current || globalAccessoryCalendarId;
                    return (
                      <div key={`map-${rack.id}`} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900 truncate">
                            {String(rack.inventoryKey || '').trim() ? `#${rack.inventoryKey} — ` : ''}{rack.name}
                          </div>
                          <div className="text-xs text-slate-600 truncate">
                            Effektiv: {effective ? effective : '—'}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <select
                            className="px-2 py-1 rounded-md border border-slate-200 bg-white text-sm max-w-[360px]"
                            value={current}
                            disabled={loading || accessorySyncBusy}
                            onChange={async (e) => {
                              const next = e.target.value;
                              if (!next) {
                                await deleteAccessoryCalendarMapping(rack.id);
                              } else {
                                await setAccessoryCalendarMapping(rack.id, next);
                              }
                              setAccessoryMappings(await listAccessoryCalendarMappings());
                            }}
                            aria-label={`Kalender zuordnen fuer Dachträger ${rack.name}`}
                            title="Kalender pro Dachträger setzen (überschreibt global)"
                          >
                            <option value="">— global verwenden —</option>
                            {calendars.map((c) => (
                              <option key={c.id} value={c.id}>
                                {(c.primary ? '[Primary] ' : '')}{c.summary || c.id}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                  {roofRacks.length === 0 ? (
                    <div className="text-sm text-slate-600">Keine Dachträger gefunden.</div>
                  ) : null}
                </div>
              </div>
            )}
          </details>

          <details className="mt-4 rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800 select-none">
              Kalender-Zuordnung pflegen (Vermietungsgegenstände)
            </summary>
            <div className="mt-3 text-xs text-slate-500">
              Hier kannst du Ressourcen direkt mit einem Google Kalender verknüpfen (wichtig für Verfügbarkeit und automatische Termine bei Auftrag bestätigt).
            </div>
            <div className="mt-3 space-y-2">
              {resources
                .filter((r) => r.isActive)
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{r.name}</div>
                      <div className="text-xs text-slate-600 truncate">{r.type}</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <select
                        className="px-2 py-1 rounded-md border border-slate-200 bg-white text-sm max-w-[360px]"
                        value={r.googleCalendarId || ''}
                        disabled={!canUse || loading || assignBusyId === r.id}
                        onChange={async (e) => {
                          const nextId = e.target.value;
                          setAssignBusyId(r.id);
                          try {
                            await modifyResource(r.id, { googleCalendarId: nextId });
                            setResources((prev) => prev.map((x) => (x.id === r.id ? { ...x, googleCalendarId: nextId } : x)));
                          } catch (err: any) {
                            showError('Konnte Kalender nicht speichern: ' + (err?.message || String(err)));
                          } finally {
                            setAssignBusyId(null);
                          }
                        }}
                        aria-label={`Kalender zuordnen fuer ${r.name}`}
                        title="Kalender fuer diese Ressource setzen"
                      >
                        <option value="">— kein Kalender —</option>
                        {calendars.map((c) => (
                          <option key={c.id} value={c.id}>
                            {(c.primary ? '[Primary] ' : '')}{c.summary || c.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              {resources.filter((r) => r.isActive).length === 0 && (
                <div className="text-sm text-slate-600">Keine aktiven Ressourcen vorhanden.</div>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import CalendarDays from 'lucide-react/dist/esm/icons/calendar-days.js';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left.js';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js';
import Columns3 from 'lucide-react/dist/esm/icons/columns-3.js';
import Grid3X3 from 'lucide-react/dist/esm/icons/grid-3x3.js';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js';
import Search from 'lucide-react/dist/esm/icons/search.js';
import type { Invoice, InvoiceItem, Resource } from '../types';
import {
  listCalendarsWithClientId,
  listEventsWithClientId,
  type GoogleCalendarEvent,
  type GoogleCalendarListEntry,
} from '../services/googleCalendarService';
import {
  getAllInvoices,
  getAllResources,
  getInvoiceItems,
} from '../services/sqliteService';
import { modifyResource } from '../services/resourceService';

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

type CalendarView = 'month' | 'week';
type CalendarItemKind = 'resource' | 'invoice' | 'google';

type CalendarItem = {
  id: string;
  name: string;
  kind: CalendarItemKind;
  category?: string;
  googleCalendarId?: string;
  colorKey: ColorKey;
};

type CalendarEntry = {
  id: string;
  itemId: string;
  itemName: string;
  itemKind: CalendarItemKind;
  colorKey: ColorKey;
  title: string;
  subtitle: string;
  start: Date;
  end: Date;
  invoiceId?: string;
  invoiceNo?: string;
  rentalRequestId?: string;
  htmlLink?: string;
  isGoogleOnly?: boolean;
};

type ColorKey = 'emerald' | 'blue' | 'amber' | 'purple' | 'rose' | 'indigo' | 'cyan' | 'orange' | 'slate';

const COLOR_KEYS: ColorKey[] = ['emerald', 'blue', 'amber', 'purple', 'rose', 'indigo', 'cyan', 'orange'];

const COLOR_CLASS: Record<ColorKey, { bar: string; dot: string; text: string; sub: string }> = {
  emerald: { bar: 'bg-emerald-600 border-emerald-700', dot: 'bg-emerald-500', text: 'text-white', sub: 'text-white/80' },
  blue: { bar: 'bg-blue-600 border-blue-700', dot: 'bg-blue-500', text: 'text-white', sub: 'text-white/80' },
  amber: { bar: 'bg-amber-500 border-amber-600', dot: 'bg-amber-400', text: 'text-white', sub: 'text-white/90' },
  purple: { bar: 'bg-purple-600 border-purple-700', dot: 'bg-purple-500', text: 'text-white', sub: 'text-white/80' },
  rose: { bar: 'bg-rose-500 border-rose-600', dot: 'bg-rose-400', text: 'text-white', sub: 'text-white/80' },
  indigo: { bar: 'bg-indigo-600 border-indigo-700', dot: 'bg-indigo-500', text: 'text-white', sub: 'text-white/80' },
  cyan: { bar: 'bg-cyan-600 border-cyan-700', dot: 'bg-cyan-500', text: 'text-white', sub: 'text-white/80' },
  orange: { bar: 'bg-orange-600 border-orange-700', dot: 'bg-orange-500', text: 'text-white', sub: 'text-white/80' },
  slate: { bar: 'bg-white border-slate-300 border-dashed', dot: 'bg-slate-400', text: 'text-slate-700', sub: 'text-slate-500' },
};

const ACTIVE_INVOICE_STATES = new Set<Invoice['state']>(['entwurf', 'gesendet', 'angenommen', 'bezahlt']);

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfWeekMonday(date: Date): Date {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return startOfDay(addDays(date, offset));
}

function monthMatrix(date: Date): Date[][] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeekMonday(first);
  return Array.from({ length: 6 }, (_, weekIdx) =>
    Array.from({ length: 7 }, (_, dayIdx) => addDays(start, weekIdx * 7 + dayIdx))
  );
}

function weekDays(date: Date): Date[] {
  const start = startOfWeekMonday(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function overlaps(entry: CalendarEntry, start: Date, end: Date): boolean {
  return entry.start <= end && entry.end >= start;
}

function rangesOverlap(entryStart: Date, entryEnd: Date, start: Date, end: Date): boolean {
  return entryStart <= end && entryEnd >= start;
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function fmtDateTime(date: Date): string {
  return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtMonth(date: Date): string {
  return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

function parseRentalRequestIdFromDescription(description?: string): string | null {
  const raw = String(description || '');
  const match = /(?:^|\n)\s*Vorgang:\s*([^\n]+)/i.exec(raw);
  return match?.[1]?.trim() || null;
}

function invoiceTypeRank(invoice: Invoice): number {
  const type = String(invoice.invoiceType || '');
  if (type === 'Rechnung') return 3;
  if (type === 'Auftrag') return 2;
  if (type === 'Angebot') return 1;
  return 0;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseDateTime(date?: string, time?: string): Date | null {
  if (!date) return null;
  const raw = `${date}T${time || '00:00'}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function invoiceRange(invoice: Invoice): { start: Date; end: Date } | null {
  if (typeof invoice.servicePeriodStart !== 'number' || typeof invoice.servicePeriodEnd !== 'number') return null;
  const pickup = parseDateTime(invoice.pickupDate, invoice.pickupTime);
  const ret = parseDateTime(invoice.returnDate, invoice.returnTime);
  const start = pickup || new Date(invoice.servicePeriodStart);
  const end = ret || new Date(invoice.servicePeriodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) return { start: end, end: start };
  return { start, end };
}

function money(value: number): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

function invoiceTotal(items: InvoiceItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function makeCalendarItemId(kind: CalendarItemKind, id: string): string {
  return `${kind}:${id}`;
}

function matchResource(itemName: string, resources: Resource[]): Resource | undefined {
  const name = normalizeText(itemName);
  return resources.find((resource) => {
    const resourceName = normalizeText(resource.name);
    const resourceType = normalizeText(resource.type);
    return Boolean(resourceName && name.includes(resourceName)) || Boolean(resourceType && name.includes(resourceType));
  });
}

function pickColor(index: number): ColorKey {
  return COLOR_KEYS[index % COLOR_KEYS.length];
}

export default function CalendarPanel(props: {
  clientId: string;
  enabled: boolean;
  onOpenSettings?: () => void;
  onOpenInvoice?: (invoiceId: string) => void;
}) {
  const [view, setView] = useState<CalendarView>('week');
  const [focusDate, setFocusDate] = useState<Date>(() => new Date());
  const [filterId, setFilterId] = useState<string>('all');
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceItemsByInvoiceId, setInvoiceItemsByInvoiceId] = useState<Map<string, InvoiceItem[]>>(new Map());
  const [googleEventsByCalendarId, setGoogleEventsByCalendarId] = useState<Map<string, GoogleCalendarEvent[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [assignBusyId, setAssignBusyId] = useState<string | null>(null);

  const canUseGoogle = props.enabled && Boolean(props.clientId?.trim());

  const visibleDays = useMemo(() => (view === 'month' ? monthMatrix(focusDate).flat() : weekDays(focusDate)), [focusDate, view]);
  const visibleStart = useMemo(() => startOfDay(visibleDays[0] || new Date()), [visibleDays]);
  const visibleEnd = useMemo(() => endOfDay(visibleDays[visibleDays.length - 1] || new Date()), [visibleDays]);
  const visibleWeeks = useMemo(() => (view === 'month' ? monthMatrix(focusDate) : [weekDays(focusDate)]), [focusDate, view]);

  const resourceByCalendarId = useMemo(() => {
    const map = new Map<string, Resource>();
    for (const resource of resources) {
      if (resource.googleCalendarId) map.set(resource.googleCalendarId, resource);
    }
    return map;
  }, [resources]);

  const calendarItems = useMemo<CalendarItem[]>(() => {
    const items: CalendarItem[] = [];
    let colorIndex = 0;

    for (const resource of resources.filter((r) => r.isActive)) {
      items.push({
        id: makeCalendarItemId('resource', resource.id),
        name: resource.name,
        kind: 'resource',
        category: resource.type,
        googleCalendarId: resource.googleCalendarId || undefined,
        colorKey: pickColor(colorIndex++),
      });
    }

    return items.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'resource' ? -1 : 1;
      return a.name.localeCompare(b.name, 'de');
    });
  }, [resources]);

  const itemById = useMemo(() => new Map(calendarItems.map((item) => [item.id, item])), [calendarItems]);

  const loadLocalData = useCallback(async () => {
    setError(null);
    try {
      const [nextResources, nextInvoices] = await Promise.all([
        getAllResources(),
        getAllInvoices(),
      ]);

      const activeInvoices = nextInvoices.filter((invoice) => {
        if (!ACTIVE_INVOICE_STATES.has(invoice.state)) return false;
        const nextId = String(invoice.replacesInvoiceId || '').trim();
        if (!nextId) return true;
        return !nextInvoices.some((candidate) => candidate.id === nextId);
      });

      const bestByRentalId = new Map<string, Invoice>();
      const standaloneInvoices: Invoice[] = [];
      for (const invoice of activeInvoices) {
        const rentalId = String(invoice.rentalRequestId || '').trim();
        if (!rentalId) {
          standaloneInvoices.push(invoice);
          continue;
        }

        const current = bestByRentalId.get(rentalId);
        if (!current) {
          bestByRentalId.set(rentalId, invoice);
          continue;
        }

        const currentRank = invoiceTypeRank(current);
        const nextRank = invoiceTypeRank(invoice);
        if (nextRank > currentRank) {
          bestByRentalId.set(rentalId, invoice);
          continue;
        }
        if (nextRank === currentRank && Number(invoice.updatedAt || 0) > Number(current.updatedAt || 0)) {
          bestByRentalId.set(rentalId, invoice);
        }
      }

      const visibleInvoices = [...standaloneInvoices, ...bestByRentalId.values()];
      const entries = await Promise.all(visibleInvoices.map(async (invoice) => [invoice.id, await getInvoiceItems(invoice.id)] as const));

      setResources(nextResources);
      setInvoices(visibleInvoices);
      setInvoiceItemsByInvoiceId(new Map(entries));
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }, []);

  const loadGoogleData = useCallback(async () => {
    if (!canUseGoogle) {
      setCalendars([]);
      setGoogleEventsByCalendarId(new Map());
      return;
    }

    setSyncingGoogle(true);
    try {
      const nextCalendars = await listCalendarsWithClientId({ clientId: props.clientId });
      setCalendars(nextCalendars);

      const calendarIds = Array.from(new Set([
        ...resources.map((resource) => resource.googleCalendarId).filter((id): id is string => Boolean(id)),
      ]));

      const rows: Array<readonly [string, GoogleCalendarEvent[]]> = await Promise.all(
        calendarIds.map(async (calendarId) => {
          try {
            const events = await listEventsWithClientId({
              clientId: props.clientId,
              calendarId,
              timeMin: visibleStart,
              timeMax: visibleEnd,
              maxResults: 250,
            });
            return [calendarId, events] as const;
          } catch {
            return [calendarId, [] as GoogleCalendarEvent[]] as const;
          }
        })
      );
      setGoogleEventsByCalendarId(new Map(rows));
    } catch (err: any) {
      setError(err?.message || String(err));
      setCalendars([]);
      setGoogleEventsByCalendarId(new Map());
    } finally {
      setSyncingGoogle(false);
    }
  }, [canUseGoogle, props.clientId, resources, visibleEnd, visibleStart]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await loadLocalData();
    } finally {
      setLoading(false);
    }
  }, [loadLocalData]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void loadGoogleData();
  }, [loadGoogleData]);

  const entries = useMemo<CalendarEntry[]>(() => {
    const out: CalendarEntry[] = [];

    for (const invoice of invoices) {
      const range = invoiceRange(invoice);
      if (!range || !rangesOverlap(range.start, range.end, visibleStart, visibleEnd)) continue;

      const items = invoiceItemsByInvoiceId.get(invoice.id) || [];
      const total = invoiceTotal(items);
      const sharedSubtitle = [
        invoice.buyerName,
        invoice.pickupDate ? `Ausgabe ${invoice.pickupTime || ''}`.trim() : '',
        total > 0 ? money(total) : '',
        invoice.invoiceNo,
      ].filter(Boolean).join(' • ');

      if (items.length === 0) {
        out.push({
          id: `invoice:${invoice.id}`,
          itemId: makeCalendarItemId('invoice', invoice.id),
          itemName: invoice.invoiceNo,
          itemKind: 'invoice',
          colorKey: 'slate',
          title: invoice.buyerName || invoice.invoiceNo,
          subtitle: sharedSubtitle,
          start: range.start,
          end: range.end,
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          rentalRequestId: invoice.rentalRequestId,
        });
      }

      for (const item of items) {
        const resource = matchResource(item.name, resources);
        const calendarItemId = resource
          ? makeCalendarItemId('resource', resource.id)
          : makeCalendarItemId('invoice', item.id);
        const calendarItem = itemById.get(calendarItemId);
        const itemName = resource?.name || item.name;

        out.push({
          id: `invoice-item:${item.id}`,
          itemId: calendarItemId,
          itemName,
          itemKind: resource ? 'resource' : 'invoice',
          colorKey: calendarItem?.colorKey || 'slate',
          title: item.name,
          subtitle: sharedSubtitle,
          start: range.start,
          end: range.end,
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          rentalRequestId: invoice.rentalRequestId,
        });
      }
    }

    for (const [calendarId, events] of googleEventsByCalendarId.entries()) {
      const resource = resourceByCalendarId.get(calendarId);
      const itemId = resource ? makeCalendarItemId('resource', resource.id) : makeCalendarItemId('google', calendarId);
      const item = itemById.get(itemId);

      for (const event of events) {
        const start = new Date(event.start);
        const end = new Date(event.end);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
        const googleRentalRequestId = parseRentalRequestIdFromDescription(event.description);

        const duplicatesLocal = out.some((entry) =>
          entry.itemId === itemId && (
            (googleRentalRequestId && entry.rentalRequestId === googleRentalRequestId) ||
            (sameDay(entry.start, start) && normalizeText(entry.title) === normalizeText(event.summary || ''))
          )
        );
        if (duplicatesLocal) continue;

        out.push({
          id: `google:${calendarId}:${event.id}`,
          itemId,
          itemName: resource?.name || calendars.find((calendar) => calendar.id === calendarId)?.summary || calendarId,
          itemKind: resource ? 'resource' : 'google',
          colorKey: item?.colorKey || 'slate',
          title: event.summary || '(ohne Titel)',
          subtitle: `${fmtDateTime(start)} bis ${fmtDateTime(end)}`,
          start,
          end,
          htmlLink: event.htmlLink,
          isGoogleOnly: true,
        });
      }
    }

    return out.sort((a, b) => {
      const durA = a.end.getTime() - a.start.getTime();
      const durB = b.end.getTime() - b.start.getTime();
      if (durA !== durB) return durB - durA;
      return a.start.getTime() - b.start.getTime();
    });
  }, [
    calendars,
    googleEventsByCalendarId,
    invoiceItemsByInvoiceId,
    invoices,
    itemById,
    resourceByCalendarId,
    resources,
    visibleEnd,
    visibleStart,
  ]);

  const filterOptions = useMemo(() => {
    const localOtherItems = new Map<string, CalendarItem>();
    for (const entry of entries) {
      if (entry.itemKind !== 'invoice') continue;
      localOtherItems.set(entry.itemId, {
        id: entry.itemId,
        name: entry.itemName,
        kind: 'invoice',
        colorKey: 'slate',
      });
    }
    return [...calendarItems, ...Array.from(localOtherItems.values()).sort((a, b) => a.name.localeCompare(b.name, 'de'))];
  }, [calendarItems, entries]);

  const filteredEntries = useMemo(() => {
    if (filterId === 'all') return entries;
    return entries.filter((entry) => entry.itemId === filterId);
  }, [entries, filterId]);

  const selectedFilterLabel = filterId === 'all'
    ? 'Alle Buchungen'
    : filterOptions.find((item) => item.id === filterId)?.name || 'Auswahl';

  const goPrevious = () => setFocusDate((date) => (view === 'month' ? addMonths(date, -1) : addDays(date, -7)));
  const goNext = () => setFocusDate((date) => (view === 'month' ? addMonths(date, 1) : addDays(date, 7)));
  const goToday = () => setFocusDate(new Date());

  const saveResourceCalendar = async (resourceId: string, googleCalendarId: string) => {
    setAssignBusyId(resourceId);
    try {
      await modifyResource(resourceId, { googleCalendarId });
      setResources((prev) => prev.map((resource) => (resource.id === resourceId ? { ...resource, googleCalendarId } : resource)));
      setNotice({ tone: 'info', text: 'Kalender-Zuordnung gespeichert.' });
    } catch (err: any) {
      setNotice({ tone: 'error', text: 'Konnte Kalender nicht speichern: ' + (err?.message || String(err)) });
    } finally {
      setAssignBusyId(null);
    }
  };

  const renderBar = (entry: CalendarEntry, weekStart: Date, weekEnd: Date, index: number) => {
    const start = entry.start < weekStart ? weekStart : entry.start;
    const end = entry.end > weekEnd ? weekEnd : entry.end;
    const startCol = Math.max(0, Math.floor((startOfDay(start).getTime() - startOfDay(weekStart).getTime()) / 86_400_000));
    const endCol = Math.max(startCol, Math.floor((startOfDay(end).getTime() - startOfDay(weekStart).getTime()) / 86_400_000));
    const colors = COLOR_CLASS[entry.isGoogleOnly ? 'slate' : entry.colorKey];
    const title = `${entry.title}\n${entry.subtitle}`;

    return (
      <button
        key={`${entry.id}:${weekStart.toISOString()}:${index}`}
        type="button"
        className={cn(
          'h-9 min-w-0 px-2 py-1 text-left text-[10px] border shadow-sm transition-all hover:brightness-[0.98] active:scale-[0.99] overflow-hidden',
          colors.bar,
          entry.start < weekStart ? 'rounded-l-none' : 'rounded-l-md',
          entry.end > weekEnd ? 'rounded-r-none' : 'rounded-r-md'
        )}
        style={{ gridColumn: `${startCol + 1} / ${endCol + 2}` }}
        title={title}
        onClick={() => {
          if (entry.invoiceId) props.onOpenInvoice?.(entry.invoiceId);
          else if (entry.htmlLink) window.open(entry.htmlLink, '_blank', 'noopener,noreferrer');
        }}
      >
        <span className="flex items-start gap-1.5 w-full min-w-0">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-1.5', colors.dot)} />
          <span className="flex-1 min-w-0 leading-tight">
            <span className={cn('block truncate font-bold', colors.text)}>{entry.title}</span>
            <span className={cn('block truncate text-[9px] mt-0.5 font-medium', colors.sub)}>{entry.subtitle}</span>
          </span>
        </span>
      </button>
    );
  };

  const renderMonth = () => (
    <div className="flex-1 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden flex flex-col">
      <div className="grid grid-cols-7 border-b border-slate-200">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day) => (
          <div key={day} className="py-3 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
            {day}
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {visibleWeeks.map((week, weekIdx) => {
          const weekStart = startOfDay(week[0]);
          const weekEnd = endOfDay(week[6]);
          const weekEntries = filteredEntries.filter((entry) => overlaps(entry, weekStart, weekEnd));
          return (
            <div key={weekIdx} className="border-b border-slate-100" style={{ minHeight: `${88 + Math.max(weekEntries.length, 1) * 38}px` }}>
              <div className="grid grid-cols-7">
                {week.map((day) => {
                  const isToday = sameDay(day, new Date());
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        'border-r border-slate-100 p-2 min-h-[88px] flex justify-center transition-colors group',
                        !isSameMonth(day, focusDate) && 'bg-slate-50/60',
                        isToday && 'bg-blue-50/30'
                      )}
                    >
                      <span
                        className={cn(
                          'text-xs font-bold h-7 w-7 flex items-center justify-center rounded-full transition-all mt-1',
                          isToday ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-500 group-hover:bg-slate-100 group-hover:text-slate-900'
                        )}
                      >
                        {day.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="px-[2px] pb-3">
                <div className="space-y-1">
                  {weekEntries.map((entry, index) => (
                    <div key={`${entry.id}:row:${index}`} className="grid grid-cols-7 gap-0">
                      {renderBar(entry, weekStart, weekEnd, index)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderWeek = () => {
    const days = visibleWeeks[0] || weekDays(focusDate);
    const weekStart = startOfDay(days[0]);
    const weekEnd = endOfDay(days[6]);
    return (
      <div className="flex-1 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 min-h-[66vh]">
          {days.map((day) => {
            const isToday = sameDay(day, new Date());
            const dayEntries = filteredEntries.filter((entry) => overlaps(entry, startOfDay(day), endOfDay(day)));
            return (
              <div key={day.toISOString()} className={cn('border-r border-slate-100 flex flex-col', isToday && 'bg-blue-50/30')}>
                <div className={cn('py-3 px-2 border-b border-slate-100 text-center sticky top-0 bg-white z-10', isToday && 'bg-blue-50')}>
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {day.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}
                  </div>
                  <div className={cn('text-2xl font-bold mt-1', isToday ? 'text-blue-600' : 'text-slate-700')}>{day.getDate()}</div>
                </div>
                <div className="flex-1 p-2 space-y-1.5 overflow-y-auto">
                  {dayEntries.length === 0 ? (
                    <div className="text-center py-8 text-slate-300 text-xs">Keine Buchungen</div>
                  ) : (
                    dayEntries.map((entry, index) => {
                      const colors = COLOR_CLASS[entry.isGoogleOnly ? 'slate' : entry.colorKey];
                      return (
                        <button
                          key={`${entry.id}:${day.toISOString()}:${index}`}
                          type="button"
                          className={cn('w-full rounded-md p-2 shadow-sm cursor-pointer transition-all hover:shadow-md border text-left', colors.bar)}
                          title={`${entry.title}\n${entry.subtitle}\n${fmtDate(entry.start)} - ${fmtDate(entry.end)}`}
                          onClick={() => {
                            if (entry.invoiceId) props.onOpenInvoice?.(entry.invoiceId);
                            else if (entry.htmlLink) window.open(entry.htmlLink, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          <div className={cn('font-bold text-xs truncate flex items-center gap-1.5', colors.text)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', colors.dot)} />
                            <span className="truncate">{entry.title}</span>
                          </div>
                          <div className={cn('text-[10px] truncate mt-0.5', colors.sub)}>{entry.subtitle}</div>
                          <div className={cn('text-[10px] truncate mt-0.5', colors.sub)}>{fmtDate(entry.start)} - {fmtDate(entry.end)}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="sr-only">{weekStart.toISOString()} {weekEnd.toISOString()}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6 h-full flex flex-col bg-slate-50/50 -m-6 p-6">
      {notice && (
        <div
          className={cn(
            'rounded-xl border px-4 py-3 text-sm whitespace-pre-line',
            notice.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-800'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>{notice.text}</div>
            <button className="text-slate-600 hover:text-slate-900" onClick={() => setNotice(null)} aria-label="Hinweis schließen">
              x
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <CalendarDays className="h-8 w-8 text-blue-600" aria-hidden="true" />
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Belegungsplan</h2>
            <p className="text-sm text-slate-500 font-medium">Alle lokalen Buchungen und synchronisierten Kalender im Überblick</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setView('month')}
              className={cn('p-1.5 rounded-md transition-colors', view === 'month' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50')}
              title="Monatsansicht"
              aria-label="Monatsansicht"
            >
              <Grid3X3 className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setView('week')}
              className={cn('p-1.5 rounded-md transition-colors', view === 'week' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-50')}
              title="Wochenansicht"
              aria-label="Wochenansicht"
            >
              <Columns3 className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={goToday}
            className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm active:scale-95"
          >
            Heute
          </button>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <button type="button" onClick={goPrevious} className="p-1.5 hover:bg-slate-50 rounded-md transition-colors text-slate-600" aria-label="Zurück">
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="px-4 text-sm font-bold text-slate-800 min-w-[190px] text-center">
              {view === 'month'
                ? fmtMonth(focusDate)
                : `${fmtDate(visibleStart)} - ${visibleEnd.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
            </span>
            <button type="button" onClick={goNext} className="p-1.5 hover:bg-slate-50 rounded-md transition-colors text-slate-600" aria-label="Weiter">
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" aria-hidden="true" />
            <select
              value={filterId}
              onChange={(event) => setFilterId(event.target.value)}
              className="pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm appearance-none cursor-pointer min-w-[220px]"
              aria-label="Kalenderfilter"
              title={selectedFilterLabel}
            >
              <option value="all">Alle Buchungen</option>
              <optgroup label="Synchronisierte Kalender">
                {filterOptions.filter((item) => item.kind === 'resource').map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </optgroup>
              {filterOptions.some((item) => item.kind === 'invoice') ? (
                <optgroup label="Weitere Artikel">
                  {filterOptions.filter((item) => item.kind === 'invoice').map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              void refreshAll();
              void loadGoogleData();
            }}
            disabled={loading || syncingGoogle}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-60"
            title="Kalender neu laden"
          >
            <RefreshCw className={cn('h-4 w-4', (loading || syncingGoogle) && 'animate-spin')} aria-hidden="true" />
            Aktualisieren
          </button>
        </div>
      </div>

      {!canUseGoogle && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-amber-900">Google Kalender noch nicht verbunden</div>
          <div className="text-sm text-amber-800 mt-1">Lokale Belege werden angezeigt. Für synchronisierte Kalender muss Google OAuth freigeschaltet sein.</div>
          {props.onOpenSettings ? (
            <button type="button" className="mt-3 px-3 py-2 rounded-md bg-amber-600 text-white text-sm hover:bg-amber-700" onClick={props.onOpenSettings}>
              In Einstellungen verbinden
            </button>
          ) : null}
        </div>
      )}

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      {view === 'month' ? renderMonth() : renderWeek()}

      <div className="flex flex-wrap items-center gap-6 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm text-sm">
        <div className="flex items-center gap-2 font-bold text-slate-500 uppercase tracking-widest text-[10px]">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          Kalender:
        </div>
        <div className="flex flex-wrap gap-3">
          {filterOptions.filter((item) => item.kind !== 'invoice').map((item) => {
            const colors = COLOR_CLASS[item.colorKey];
            return (
              <div key={item.id} className="flex items-center gap-2 bg-slate-50 pl-2 pr-3 py-1.5 rounded-full border border-slate-100 hover:bg-slate-100 transition-colors cursor-default group shadow-sm">
                <span className={cn('w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-sm', colors.dot)} />
                <span className="font-bold text-slate-700 text-xs">{item.name}</span>
              </div>
            );
          })}
          {filterOptions.filter((item) => item.kind !== 'invoice').length === 0 ? (
            <span className="text-xs text-slate-500">Keine Vermietungsgegenstände vorhanden.</span>
          ) : null}
        </div>
      </div>

      <details className="rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 select-none">Kalender-Zuordnung pflegen (Vermietungsgegenstände)</summary>
        <div className="mt-3 text-xs text-slate-500">Hier kannst du Ressourcen direkt mit einem Google Kalender verknüpfen.</div>
        <div className="mt-3 space-y-2">
          {resources.filter((resource) => resource.isActive).map((resource) => (
            <div key={resource.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{resource.name}</div>
                <div className="text-xs text-slate-600 truncate">{resource.type}</div>
              </div>
              <select
                className="px-2 py-1 rounded-md border border-slate-200 bg-white text-sm max-w-[360px]"
                value={resource.googleCalendarId || ''}
                disabled={!canUseGoogle || syncingGoogle || assignBusyId === resource.id}
                onChange={(event) => void saveResourceCalendar(resource.id, event.target.value)}
                aria-label={`Kalender zuordnen fuer ${resource.name}`}
                title="Kalender fuer diese Ressource setzen"
              >
                <option value="">- kein Kalender -</option>
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {(calendar.primary ? '[Primary] ' : '')}{calendar.summary || calendar.id}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

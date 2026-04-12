import { useEffect, useMemo, useState } from 'react';
import type { Customer, Invoice, InvoiceItem, Payment, RentalRequest, RentalStatus } from '../types';
import { getCompanyProfile } from '../config/companyProfile';
import { getInvoiceItems } from '../services/sqliteService';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type DashboardPanelProps = {
  customers: Customer[];
  rentals: RentalRequest[];
  invoices: Invoice[];
  payments: Payment[];
  onOpenRental: (rentalId: string) => void | Promise<void>;
  onOpenRentalDetail: (rentalId: string) => void | Promise<void>;
  onOpenInvoice: (invoiceId: string) => void | Promise<void>;
  onOpenOrders: () => void;
};

function toLocalDayStart(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function calcInvoiceGross(items: InvoiceItem[]): number {
  return items.reduce((sum, it) => {
    const qty = Number(it.quantity) || 0;
    const unit = Number(it.unitPrice) || 0;
    const tax = Number(it.taxPercent) || 0;
    const line = qty * unit;
    return sum + line * (1 + tax / 100);
  }, 0);
}

function sumClaimPaymentsForContext(payments: Payment[], rentalId?: string, invoiceId?: string): number {
  const rid = String(rentalId || '').trim();
  const iid = String(invoiceId || '').trim();
  return payments
    .filter((p) => {
      if (p.kind === 'Kaution') return false;
      const paymentInvoiceId = String(p.invoiceId || '').trim();
      const paymentRentalId = String(p.rentalRequestId || '').trim();
      if (iid && paymentInvoiceId === iid) return true;
      if (rid && !paymentInvoiceId && paymentRentalId === rid) return true;
      return false;
    })
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

function getMonthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function getPrevMonthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
}

function getNextMonthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function formatCompact(value: number) {
  const v = Number(value || 0);
  if (Math.abs(v) >= 1000) {
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(v);
  }
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(v);
}

function KpiCard(props: {
  title: string;
  value: string;
  deltaText?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
  deltaHint?: string;
  iconBgClass: string;
  icon: React.ReactNode;
  sublines?: string[];
  active?: boolean;
  onClick?: () => void;
}) {
  const { title, value, deltaText, deltaTone, deltaHint = 'vs. letzter Monat', iconBgClass, icon, sublines, active = false, onClick } = props;
  const toneClass =
    deltaTone === 'up' ? 'text-emerald-700' : deltaTone === 'down' ? 'text-rose-700' : 'text-slate-500';
  const body = (
    <div
      className={[
        'bg-white border rounded-xl p-4 shadow-sm transition-colors',
        active ? 'border-slate-400 ring-1 ring-slate-300' : 'border-slate-200',
        onClick ? 'cursor-pointer hover:border-slate-300' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500">{title}</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
        </div>
        <div className={['h-10 w-10 rounded-lg flex items-center justify-center', iconBgClass].join(' ')}>
          {icon}
        </div>
      </div>
      {deltaText ? (
        <div className={['mt-3 text-xs font-medium flex items-center gap-1', toneClass].join(' ')}>
          <span>{deltaText}</span>
          <span className="text-slate-400 font-normal">{deltaHint}</span>
        </div>
      ) : null}
      {sublines?.length ? (
        <div className="mt-2 space-y-1">
          {sublines.map((l, idx) => (
            <div key={idx} className="text-xs text-slate-500">
              {l}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left">
        {body}
      </button>
    );
  }
  return body;
}

type DrilldownKey = 'vermietet' | 'offene_auftraege' | 'erwartete_einnahmen' | 'angezahlt' | 'unbezahlt';

type DrilldownRow = {
  key: string;
  title: string;
  subtitle: string;
  meta?: string;
  invoiceId?: string;
  rentalId?: string;
};

type SmartInsight = {
  key: string;
  tone: 'amber' | 'rose' | 'emerald' | 'sky';
  title: string;
  text: string;
  invoiceId?: string;
  rentalId?: string;
};

export default function DashboardPanel(props: DashboardPanelProps) {
  const { customers, rentals, invoices, payments, onOpenRental, onOpenRentalDetail, onOpenInvoice, onOpenOrders } = props;
  const [activeDrilldown, setActiveDrilldown] = useState<DrilldownKey | null>(null);
  const company = useMemo(() => getCompanyProfile(), []);
  const ownerFirstName = useMemo(() => {
    const raw = String(company.ownerName || '').trim();
    return raw ? raw.split(/\s+/)[0] : '';
  }, [company.ownerName]);

  const now = useMemo(() => new Date(), []);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const year = useMemo(() => new Date().getFullYear(), []);
  const yearStart = useMemo(() => new Date(year, 0, 1).getTime(), [year]);
  const nextYearStart = useMemo(() => new Date(year + 1, 0, 1).getTime(), [year]);
  const previousYearStart = useMemo(() => new Date(year - 1, 0, 1).getTime(), [year]);
  const sameDayLastYearTs = useMemo(() => {
    const d = new Date(now);
    d.setFullYear(d.getFullYear() - 1);
    return d.getTime();
  }, [now]);

  const monthStart = useMemo(() => getMonthStart(new Date()), []);
  const nextMonthStart = useMemo(() => getNextMonthStart(new Date()), []);
  const prevMonthStart = useMemo(() => getPrevMonthStart(new Date()), []);

  const paymentsYearTotal = useMemo(() => {
    return payments
      .filter((p) => {
        const ts = Number(p.receivedAt || p.createdAt || 0);
        return ts >= yearStart && ts < nextYearStart;
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments, yearStart, nextYearStart]);

  const paymentsPrevYearToDateTotal = useMemo(() => {
    return payments
      .filter((p) => {
        const ts = Number(p.receivedAt || p.createdAt || 0);
        return ts >= previousYearStart && ts <= sameDayLastYearTs;
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments, previousYearStart, sameDayLastYearTs]);

  const revenueYearToDateDeltaPct = useMemo(() => {
    const prev = paymentsPrevYearToDateTotal;
    const cur = paymentsYearTotal;
    if (prev <= 0 && cur > 0) return 100;
    if (prev <= 0) return 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10; // 1 decimal
  }, [paymentsPrevYearToDateTotal, paymentsYearTotal]);

  const customerCount = customers.length;
  const customersThisMonth = useMemo(() => customers.filter((c) => c.createdAt >= monthStart && c.createdAt < nextMonthStart).length, [customers, monthStart, nextMonthStart]);
  const customersPrevMonth = useMemo(() => customers.filter((c) => c.createdAt >= prevMonthStart && c.createdAt < monthStart).length, [customers, prevMonthStart, monthStart]);
  const customersDelta = customersThisMonth - customersPrevMonth;
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const rentalById = useMemo(() => new Map(rentals.map((r) => [r.id, r])), [rentals]);

  const openRentalStatuses: RentalStatus[] = [
    'neu',
    'info_fehlt',
    'check_verfuegbarkeit',
    'angebot_gesendet',
    'angenommen',
    'rechnung_gestellt',
    'uebergabe_rueckgabe',
  ];
  const rentableInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (inv.invoiceType !== 'Auftrag' && inv.invoiceType !== 'Rechnung') return false;
      if (inv.state === 'storniert' || inv.state === 'archiviert') return false;
      return typeof inv.servicePeriodStart === 'number' && typeof inv.servicePeriodEnd === 'number';
    });
  }, [invoices]);
  const relevantInvoices = useMemo(() => {
    return invoices.filter((inv) => (inv.invoiceType === 'Auftrag' || inv.invoiceType === 'Rechnung') && inv.state !== 'storniert' && inv.state !== 'archiviert');
  }, [invoices]);
  const latestInvoiceForRental = useMemo(() => {
    const grouped = new Map<string, Invoice[]>();
    for (const inv of relevantInvoices) {
      const rid = String(inv.rentalRequestId || '').trim();
      if (!rid) continue;
      grouped.set(rid, [...(grouped.get(rid) || []), inv]);
    }
    const order: Record<string, number> = { Rechnung: 2, Auftrag: 1, Angebot: 0 };
    return new Map(
      Array.from(grouped.entries()).map(([rid, rows]) => [
        rid,
        [...rows].sort((a, b) => {
          const oa = order[a.invoiceType] ?? -1;
          const ob = order[b.invoiceType] ?? -1;
          if (oa !== ob) return ob - oa;
          return b.invoiceDate - a.invoiceDate;
        })[0],
      ])
    );
  }, [relevantInvoices]);

  const countActiveRentalUnitsAt = (dayTs: number) => {
    const seen = new Set<string>();
    for (const inv of rentableInvoices) {
      const start = toLocalDayStart(inv.servicePeriodStart as number);
      const end = toLocalDayStart(inv.servicePeriodEnd as number);
      if (start > dayTs || end < dayTs) continue;
      const key = String(inv.rentalRequestId || inv.id || '').trim();
      if (!key) continue;
      seen.add(key);
    }
    return seen.size;
  };

  const activeRentalsNow = useMemo(() => countActiveRentalUnitsAt(today), [rentableInvoices, today]);

  const activeRentalsPrevMonth = useMemo(() => {
    const ref = new Date();
    ref.setMonth(ref.getMonth() - 1);
    return countActiveRentalUnitsAt(toLocalDayStart(ref.getTime()));
  }, [rentableInvoices]);

  const activeRentalsDelta = activeRentalsNow - activeRentalsPrevMonth;
  const activeRentalRows = useMemo<DrilldownRow[]>(() => {
    const rows: DrilldownRow[] = [];
    for (const inv of rentableInvoices) {
      const rid = String(inv.rentalRequestId || '').trim();
      if (!rid) continue;
      const start = toLocalDayStart(inv.servicePeriodStart as number);
      const end = toLocalDayStart(inv.servicePeriodEnd as number);
      if (start > today || end < today) continue;
      if (rows.some((row) => row.key === rid)) continue;
      const chosen = latestInvoiceForRental.get(rid) || inv;
      const rental = rentalById.get(rid);
      const customer = rental ? customerById.get(rental.customerId) : undefined;
      rows.push({
        key: rid,
        title: `${chosen.invoiceType} ${chosen.invoiceNo || '(ohne Nummer)'}`,
        subtitle: customer ? `${customer.firstName} ${customer.lastName}`.trim() : (chosen.buyerName || rid),
        meta: `${new Date(chosen.servicePeriodStart || chosen.invoiceDate).toLocaleDateString('de-DE')} bis ${new Date(chosen.servicePeriodEnd || chosen.invoiceDate).toLocaleDateString('de-DE')}`,
        invoiceId: chosen.id,
        rentalId: rid,
      });
    }
    return rows.sort((a, b) => a.title.localeCompare(b.title, 'de'));
  }, [rentableInvoices, today, latestInvoiceForRental, rentalById, customerById]);

  const isOpenOrderRentalAt = (rental: RentalRequest, dayTs: number) => {
    if (rental.status === 'abgeschlossen') return true;
    if (!['angenommen', 'rechnung_gestellt', 'uebergabe_rueckgabe'].includes(rental.status)) return false;
    return toLocalDayStart(rental.rentalEnd) >= dayTs;
  };

  const openOrdersCount = useMemo(() => {
    return rentals.filter((r) => isOpenOrderRentalAt(r, today)).length;
  }, [rentals, today]);

  const openOrdersPrevMonth = useMemo(() => {
    const ref = new Date();
    ref.setMonth(ref.getMonth() - 1);
    return rentals.filter((r) => isOpenOrderRentalAt(r, toLocalDayStart(ref.getTime()))).length;
  }, [rentals]);
  const openOrderRows = useMemo<DrilldownRow[]>(() => {
    return rentals
      .filter((r) => isOpenOrderRentalAt(r, today))
      .map((r) => {
        const customer = customerById.get(r.customerId);
        const inv = latestInvoiceForRental.get(r.id) || null;
        return {
          key: r.id,
          title: inv ? `${inv.invoiceType} ${inv.invoiceNo || '(ohne Nummer)'}` : `${r.productType} ${r.id}`,
          subtitle: customer ? `${customer.firstName} ${customer.lastName}`.trim() : r.customerId,
          meta: `${new Date(r.rentalStart).toLocaleDateString('de-DE')} bis ${new Date(r.rentalEnd).toLocaleDateString('de-DE')} · ${r.status}`,
          invoiceId: inv?.id,
          rentalId: r.id,
        };
      })
      .sort((a, b) => a.subtitle.localeCompare(b.subtitle, 'de'));
  }, [rentals, customerById, latestInvoiceForRental, today]);

  const [grossByInvoiceId, setGrossByInvoiceId] = useState<Record<string, number>>({});
  useEffect(() => {
    const ids = relevantInvoices.map((i) => i.id).filter(Boolean);
    if (!ids.length) {
      setGrossByInvoiceId({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const items = await getInvoiceItems(id);
            const gross = Math.round(calcInvoiceGross(items) * 100) / 100;
            return [id, gross] as const;
          } catch {
            return [id, 0] as const;
          }
        })
      );
      const next: Record<string, number> = Object.fromEntries(entries);
      if (cancelled) return;
      setGrossByInvoiceId(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [relevantInvoices]);

  const buildOpenOrderFinancialRowsAt = (dayTs: number) => {
    return rentals
      .filter((r) => isOpenOrderRentalAt(r, dayTs))
      .map((r) => {
        const inv = latestInvoiceForRental.get(r.id) || null;
        if (!inv?.id) return null;
        const gross = Number(grossByInvoiceId[inv.id] || 0);
        const paid = Math.round(sumClaimPaymentsForContext(payments, r.id, inv.id) * 100) / 100;
        const open = Math.max(0, Math.round((gross - paid) * 100) / 100);
        if (gross <= 0 || open <= 0) return null;
        const customer = customerById.get(r.customerId);
        return {
          rental: r,
          inv,
          gross,
          paid,
          open,
          row: {
            key: r.id,
            title: `${inv.invoiceType} ${inv.invoiceNo || '(ohne Nummer)'}`,
            subtitle: customer ? `${customer.firstName} ${customer.lastName}`.trim() : (inv.buyerName || r.customerId),
            meta: `${formatCurrency(open)} Rest offen`,
            invoiceId: inv.id,
            rentalId: r.id,
          } as DrilldownRow,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => a.row.title.localeCompare(b.row.title, 'de'));
  };

  const openOrderFinancialRows = useMemo(() => buildOpenOrderFinancialRowsAt(today), [
    rentals,
    today,
    latestInvoiceForRental,
    grossByInvoiceId,
    payments,
    customerById,
  ]);

  const expectedRevenueRows = useMemo<DrilldownRow[]>(() => {
    return openOrderFinancialRows.map((entry) => entry.row);
  }, [openOrderFinancialRows]);

  const expectedRevenue = useMemo(() => {
    const open = Math.round(openOrderFinancialRows.reduce((sum, entry) => sum + entry.open, 0) * 100) / 100;
    return { total: open, open, count: openOrderFinancialRows.length };
  }, [openOrderFinancialRows]);

  const expectedRevenueDeltaOrders = useMemo(() => {
    const ref = new Date();
    ref.setMonth(ref.getMonth() - 1);
    return openOrderFinancialRows.length - buildOpenOrderFinancialRowsAt(toLocalDayStart(ref.getTime())).length;
  }, [openOrderFinancialRows, rentals, latestInvoiceForRental, grossByInvoiceId, payments, customerById]);

  const ordersPaymentBuckets = useMemo(() => {
    const rows = openOrderFinancialRows.map((entry) => ({
      rental: entry.rental,
      inv: entry.inv,
      gross: entry.gross,
      paid: entry.paid,
      open: entry.open,
    }));

    const partial = rows.filter((x) => x.paid > 0);
    const unpaid = rows.filter((x) => x.paid <= 0 && toLocalDayStart(x.rental.rentalStart) > today);

    const sum = (arr: typeof rows) => ({
      total: Math.round(arr.reduce((s, x) => s + x.gross, 0) * 100) / 100,
      paid: Math.round(arr.reduce((s, x) => s + x.paid, 0) * 100) / 100,
      open: Math.round(arr.reduce((s, x) => s + x.open, 0) * 100) / 100,
    });

    const toRow = (x: (typeof rows)[0]): DrilldownRow => {
      const customer = customerById.get(x.rental.customerId);
      return {
        key: x.rental.id,
        title: `${x.inv.invoiceType} ${x.inv.invoiceNo || '(ohne Nummer)'}`,
        subtitle: customer ? `${customer.firstName} ${customer.lastName}`.trim() : (x.inv.buyerName || x.rental.customerId),
        meta: `${formatCurrency(x.open)} offen / ${formatCurrency(x.paid)} bezahlt`,
        invoiceId: x.inv.id,
        rentalId: x.rental.id,
      };
    };

    return {
      partial: { count: partial.length, ...sum(partial) },
      unpaid: { count: unpaid.length, ...sum(unpaid) },
      partialRows: partial.map(toRow),
      unpaidRows: unpaid.map(toRow),
    };
  }, [openOrderFinancialRows, today, customerById]);

  const upcomingAppointments = useMemo(() => {
    const in14 = today + 14 * 24 * 60 * 60 * 1000;
    const items: Array<{ kind: 'Übergabe' | 'Rückgabe'; ts: number; rental: RentalRequest }> = [];
    for (const r of rentals) {
      if (!openRentalStatuses.includes(r.status)) continue;
      const startDay = toLocalDayStart(r.rentalStart);
      const endDay = toLocalDayStart(r.rentalEnd);
      if (startDay >= today && startDay <= in14) items.push({ kind: 'Übergabe', ts: r.rentalStart, rental: r });
      if (endDay >= today && endDay <= in14) items.push({ kind: 'Rückgabe', ts: r.rentalEnd, rental: r });
    }
    items.sort((a, b) => a.ts - b.ts);
    return items.slice(0, 10);
  }, [rentals, today]);

  const revenueComparison = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const months = Array.from({ length: 12 }, (_, i) => new Date(currentYear, i, 1).toLocaleString('de-DE', { month: 'short' }));

    const sumByMonthForYear = (y: number) => {
      const out = new Array(12).fill(0);
      for (const p of payments) {
        const ts = Number(p.receivedAt || p.createdAt || 0);
        const d = new Date(ts);
        if (d.getFullYear() !== y) continue;
        out[d.getMonth()] += Number(p.amount) || 0;
      }
      return out.map((v) => Math.round(v * 100) / 100);
    };

    const cur = sumByMonthForYear(currentYear);
    const prev = sumByMonthForYear(previousYear);
    const expectedByMonthForYear = (y: number) => {
      const out = new Array(12).fill(0);
      for (const entry of openOrderFinancialRows) {
        const ts = Number(entry.rental.rentalStart || 0);
        const d = new Date(ts);
        if (d.getFullYear() !== y) continue;
        out[d.getMonth()] += Number(entry.open) || 0;
      }
      return out.map((v) => Math.round(v * 100) / 100);
    };
    const expectedCur = expectedByMonthForYear(currentYear);
    const expectedPrev = expectedByMonthForYear(previousYear);
    const curTotal = Math.round(cur.reduce((s, v) => s + v, 0) * 100) / 100;
    const prevTotal = Math.round(prev.reduce((s, v) => s + v, 0) * 100) / 100;
    const expectedCurTotal = Math.round(expectedCur.reduce((s, v) => s + v, 0) * 100) / 100;
    const expectedPrevTotal = Math.round(expectedPrev.reduce((s, v) => s + v, 0) * 100) / 100;

    return {
      labels: months,
      curYear: currentYear,
      prevYear: previousYear,
      cur,
      prev,
      expectedCur,
      expectedPrev,
      curTotal,
      prevTotal,
      expectedCurTotal,
      expectedPrevTotal,
    };
  }, [payments, openOrderFinancialRows]);

  const chartData = useMemo(() => {
    return {
      labels: revenueComparison.labels,
      datasets: [
        {
          label: `${revenueComparison.curYear}: ${formatCompact(revenueComparison.curTotal)} €`,
          data: revenueComparison.cur,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.15)',
          pointRadius: 2,
          tension: 0.35,
        },
        {
          label: `${revenueComparison.prevYear}: ${formatCompact(revenueComparison.prevTotal)} €`,
          data: revenueComparison.prev,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          pointRadius: 2,
          borderDash: [6, 6],
          tension: 0.35,
        },
        {
          label: `${revenueComparison.curYear} erwartet: ${formatCompact(revenueComparison.expectedCurTotal)} €`,
          data: revenueComparison.expectedCur,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.12)',
          pointRadius: 2,
          borderDash: [2, 4],
          tension: 0.35,
        },
      ],
    };
  }, [revenueComparison]);

  const chartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' as const, align: 'end' as const },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `${ctx.dataset.label.split(':')[0]}: ${formatCurrency(ctx.parsed.y || 0)}`,
          },
        },
      },
      scales: {
        y: {
          ticks: {
            callback: (v: any) => `${v}€`,
          },
          grid: { color: 'rgba(148,163,184,0.15)' },
        },
        x: { grid: { color: 'rgba(148,163,184,0.08)' } },
      },
    };
  }, []);
  const activeDrilldownRows = useMemo(() => {
    if (activeDrilldown === 'vermietet') return activeRentalRows;
    if (activeDrilldown === 'offene_auftraege') return openOrderRows;
    if (activeDrilldown === 'erwartete_einnahmen') return expectedRevenueRows;
    if (activeDrilldown === 'angezahlt') return ordersPaymentBuckets.partialRows;
    if (activeDrilldown === 'unbezahlt') return ordersPaymentBuckets.unpaidRows;
    return [];
  }, [activeDrilldown, activeRentalRows, openOrderRows, expectedRevenueRows, ordersPaymentBuckets]);
  const activeDrilldownTitle = useMemo(() => {
    if (activeDrilldown === 'vermietet') return 'Vermietet';
    if (activeDrilldown === 'offene_auftraege') return 'Offene Aufträge';
    if (activeDrilldown === 'erwartete_einnahmen') return 'Erwartete Einnahmen';
    if (activeDrilldown === 'angezahlt') return 'Aufträge angezahlt';
    if (activeDrilldown === 'unbezahlt') return 'Aufträge unbezahlt';
    return '';
  }, [activeDrilldown]);

  const smartInsights = useMemo<SmartInsight[]>(() => {
    const insights: SmartInsight[] = [];

    const yesterday = today - 86_400_000;
    const rentalIdsWithOpenBalance = new Set(openOrderFinancialRows.map((e) => e.rental.id));
    const overdueReturns = rentals
      .filter((r) => openRentalStatuses.includes(r.status) && toLocalDayStart(r.rentalEnd) < yesterday && rentalIdsWithOpenBalance.has(r.id))
      .sort((a, b) => a.rentalEnd - b.rentalEnd);
    if (overdueReturns.length) {
      const rental = overdueReturns[0];
      const customer = customerById.get(rental.customerId);
      const inv = latestInvoiceForRental.get(rental.id);
      insights.push({
        key: `overdue-return:${rental.id}`,
        tone: 'rose',
        title: `${overdueReturns.length} Rückgabe${overdueReturns.length === 1 ? '' : 'n'} überfällig`,
        text: `${customer ? `${customer.firstName} ${customer.lastName}`.trim() : rental.productType} hätte am ${new Date(rental.rentalEnd).toLocaleDateString('de-DE')} zurück sein sollen.`,
        invoiceId: inv?.id,
        rentalId: rental.id,
      });
    }

    if (upcomingAppointments.length) {
      const nextAppointment = upcomingAppointments[0];
      const customer = customerById.get(nextAppointment.rental.customerId);
      const inv = latestInvoiceForRental.get(nextAppointment.rental.id);
      insights.push({
        key: `next-appointment:${nextAppointment.kind}:${nextAppointment.rental.id}`,
        tone: 'emerald',
        title: `Nächste ${nextAppointment.kind.toLowerCase()} am ${new Date(nextAppointment.ts).toLocaleDateString('de-DE')}`,
        text: `${nextAppointment.rental.productType}${customer ? ` · ${customer.firstName} ${customer.lastName}`.trim() : ''}`,
        invoiceId: inv?.id,
        rentalId: nextAppointment.rental.id,
      });
    }

    const largestOpenOrder = [...openOrderFinancialRows].sort((a, b) => b.open - a.open)[0];
    if (largestOpenOrder) {
      insights.push({
        key: `largest-open:${largestOpenOrder.row.key}`,
        tone: 'sky',
        title: `Größte offene Forderung: ${formatCurrency(largestOpenOrder.open)}`,
        text: `${largestOpenOrder.row.title} · ${largestOpenOrder.row.subtitle}`,
        invoiceId: largestOpenOrder.inv.id,
        rentalId: largestOpenOrder.row.rentalId,
      });
    }

    const partialOrder = openOrderFinancialRows
      .filter((entry) => entry.paid > 0 && entry.open > 0)
      .sort((a, b) => b.paid - a.paid)[0];
    if (partialOrder) {
      insights.push({
        key: `partial-order:${partialOrder.row.key}`,
        tone: 'amber',
        title: `Anzahlung vorhanden, Rest offen: ${formatCurrency(partialOrder.open)}`,
        text: `${partialOrder.row.title} · ${formatCurrency(partialOrder.paid)} bereits bezahlt`,
        invoiceId: partialOrder.inv.id,
        rentalId: partialOrder.row.rentalId,
      });
    }

    return insights.slice(0, 4);
  }, [rentals, today, customerById, latestInvoiceForRental, upcomingAppointments, openOrderFinancialRows]);

  return (
    <div className="max-w-7xl">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="mt-1 text-slate-600">
          Willkommen zurück{ownerFirstName ? `, ${ownerFirstName}` : ''}. Hier ist die Übersicht für {company.companyName}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title={`Gesamtumsatz (${year})`}
          value={formatCurrency(paymentsYearTotal)}
          deltaText={`${revenueYearToDateDeltaPct >= 0 ? '↗' : '↘'} ${Math.abs(revenueYearToDateDeltaPct).toFixed(1)}%`}
          deltaTone={revenueYearToDateDeltaPct >= 0 ? 'up' : 'down'}
          deltaHint="vs. Vorjahreszeitraum"
          iconBgClass="bg-emerald-500 text-white"
          icon={<span className="text-lg font-bold">€</span>}
        />
        <KpiCard
          title="Aktive Kunden"
          value={`${customerCount}`}
          iconBgClass="bg-blue-500 text-white"
          icon={<span className="text-lg font-bold">👥</span>}
        />
        <KpiCard
          title="Vermietet"
          value={`${activeRentalsNow}`}
          deltaText={`${activeRentalsDelta >= 0 ? '↗' : '↘'} ${activeRentalsDelta >= 0 ? '+' : ''}${activeRentalsDelta}`}
          deltaTone={activeRentalsDelta >= 0 ? 'up' : 'down'}
          iconBgClass="bg-amber-500 text-white"
          icon={<span className="text-lg font-bold">📦</span>}
          active={activeDrilldown === 'vermietet'}
          onClick={() => setActiveDrilldown((current) => (current === 'vermietet' ? null : 'vermietet'))}
        />
        <KpiCard
          title="Offene Aufträge"
          value={`${openOrdersCount}`}
          deltaText={`${openOrdersPrevMonth >= 0 ? '↗' : '↘'} ${openOrdersPrevMonth >= 0 ? '+' : ''}${openOrdersPrevMonth}`}
          deltaTone={openOrdersPrevMonth >= 0 ? 'up' : 'down'}
          iconBgClass="bg-violet-500 text-white"
          icon={<span className="text-lg font-bold">🧾</span>}
          active={activeDrilldown === 'offene_auftraege'}
          onClick={() => setActiveDrilldown((current) => (current === 'offene_auftraege' ? null : 'offene_auftraege'))}
        />
        <KpiCard
          title="Erwartete Einnahmen"
          value={formatCurrency(expectedRevenue.total)}
          deltaText={`${expectedRevenueDeltaOrders >= 0 ? '↗' : '↘'} ${expectedRevenueDeltaOrders >= 0 ? '+' : ''}${expectedRevenueDeltaOrders} Aufträge`}
          deltaTone={expectedRevenueDeltaOrders >= 0 ? 'up' : 'down'}
          iconBgClass="bg-sky-500 text-white"
          icon={<span className="text-lg font-bold">$</span>}
          sublines={[`Rest offen: ${formatCurrency(expectedRevenue.open)}`]}
          active={activeDrilldown === 'erwartete_einnahmen'}
          onClick={() => setActiveDrilldown((current) => (current === 'erwartete_einnahmen' ? null : 'erwartete_einnahmen'))}
        />
      </div>

      {activeDrilldown ? (
        <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{activeDrilldownTitle}</div>
              <div className="text-xs text-slate-500 mt-1">{activeDrilldownRows.length} Einträge zur Verifikation</div>
            </div>
            <button type="button" onClick={() => setActiveDrilldown(null)} className="text-sm text-slate-500 hover:text-slate-800">
              Schließen
            </button>
          </div>
          {activeDrilldownRows.length === 0 ? (
            <div className="mt-4 text-sm text-slate-600">Keine passenden Einträge vorhanden.</div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {activeDrilldownRows.map((row) => (
                <div key={row.key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-semibold text-slate-900">{row.title}</div>
                  <div className="mt-1 text-sm text-slate-700">{row.subtitle}</div>
                  {row.meta ? <div className="mt-1 text-xs text-slate-500">{row.meta}</div> : null}
                  <div className="mt-3 flex items-center gap-2">
                    {row.invoiceId ? (
                      <button
                        type="button"
                        onClick={() => void onOpenInvoice(row.invoiceId!)}
                        className="px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-xs hover:bg-slate-800"
                      >
                        Belegeditor öffnen
                      </button>
                    ) : null}
                    {row.rentalId ? (
                      <button
                        type="button"
                        onClick={() => void onOpenRentalDetail(row.rentalId!)}
                        className="px-2.5 py-1.5 rounded-md border border-slate-300 text-xs hover:bg-white"
                      >
                        Vorgang öffnen
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className={`bg-white border rounded-xl p-4 shadow-sm h-full flex flex-col cursor-pointer transition-colors ${activeDrilldown === 'angezahlt' ? 'border-amber-400 ring-1 ring-amber-300' : 'border-slate-200 hover:border-amber-300'}`}
          onClick={() => setActiveDrilldown((c) => (c === 'angezahlt' ? null : 'angezahlt'))}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Aufträge angezahlt</div>
              <div className="mt-2 text-2xl font-bold text-amber-600">{ordersPaymentBuckets.partial.count}</div>
              <div className="mt-1 text-sm text-slate-700">
                Offen: {formatCurrency(ordersPaymentBuckets.partial.open)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {formatCurrency(ordersPaymentBuckets.partial.total)} gesamt / {formatCurrency(ordersPaymentBuckets.partial.paid)} angezahlt / {formatCurrency(ordersPaymentBuckets.partial.open)} Rest
              </div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">🕒</div>
          </div>
          <div className="mt-auto pt-4 border-t border-slate-100">
            <span className="text-sm font-medium text-amber-700">
              {activeDrilldown === 'angezahlt' ? 'Schließen ↑' : 'Details anzeigen ↓'}
            </span>
          </div>
        </div>
        <div
          className={`bg-white border rounded-xl p-4 shadow-sm h-full flex flex-col cursor-pointer transition-colors ${activeDrilldown === 'unbezahlt' ? 'border-rose-400 ring-1 ring-rose-300' : 'border-slate-200 hover:border-rose-300'}`}
          onClick={() => setActiveDrilldown((c) => (c === 'unbezahlt' ? null : 'unbezahlt'))}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Aufträge unbezahlt</div>
              <div className="mt-2 text-2xl font-bold text-rose-600">{ordersPaymentBuckets.unpaid.count}</div>
              <div className="mt-1 text-sm text-slate-700">
                Offen: {formatCurrency(ordersPaymentBuckets.unpaid.open)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {formatCurrency(ordersPaymentBuckets.unpaid.total)} gesamt / {formatCurrency(ordersPaymentBuckets.unpaid.paid)} angezahlt / {formatCurrency(ordersPaymentBuckets.unpaid.open)} Rest
              </div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center">⛔</div>
          </div>
          <div className="mt-auto pt-4 border-t border-slate-100">
            <span className="text-sm font-medium text-rose-700">
              {activeDrilldown === 'unbezahlt' ? 'Schließen ↑' : 'Details anzeigen ↓'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📅</span>
            <div className="text-sm font-semibold text-slate-900">Anstehende Termine</div>
          </div>
          <button type="button" onClick={onOpenOrders} className="text-sm font-medium text-emerald-700 hover:underline">
            Alle Aufträge →
          </button>
        </div>

        {upcomingAppointments.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-slate-500">
            <div className="text-3xl mb-2">🗓️</div>
            <div className="text-sm">Keine anstehenden Abhol- oder Rückgabetermine in den nächsten 14 Tagen</div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingAppointments.map((it) => {
              const c = customers.find((x) => x.id === it.rental.customerId);
              const label = c ? `${c.firstName} ${c.lastName}`.trim() : it.rental.customerId;
              const date = new Date(it.ts).toLocaleDateString('de-DE');
              return (
                <button
                  key={`${it.kind}:${monthKey(it.ts)}:${it.rental.id}`}
                  type="button"
                  onClick={() => void onOpenRental(it.rental.id)}
                  className="text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 p-3"
                >
                  <div className="text-xs text-slate-500">{it.kind} · {date}</div>
                  <div className="text-sm font-semibold text-slate-900">{it.rental.productType}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{label}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Umsatzvergleich {revenueComparison.prevYear} vs {revenueComparison.curYear}</div>
          <div className="mt-3 h-56">
            <Line data={chartData as any} options={chartOptions as any} />
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-lg">✨</span>
            <div className="text-sm font-semibold text-slate-900">Smart Insights</div>
          </div>
          {smartInsights.length === 0 ? (
            <div className="mt-3 text-sm text-slate-600">
              Keine kritischen Hinweise. Dashboard wirkt aktuell konsistent.
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {smartInsights.map((insight) => {
                const toneClasses =
                  insight.tone === 'rose'
                    ? 'bg-rose-50 border-rose-200'
                    : insight.tone === 'amber'
                      ? 'bg-amber-50 border-amber-200'
                      : insight.tone === 'sky'
                        ? 'bg-sky-50 border-sky-200'
                        : 'bg-emerald-50 border-emerald-200';
                return (
                  <div key={insight.key} className={`rounded-lg border p-3 ${toneClasses}`}>
                    <div className="text-sm font-semibold text-slate-900">{insight.title}</div>
                    <div className="mt-1 text-xs text-slate-600">{insight.text}</div>
                    {(insight.invoiceId || insight.rentalId) ? (
                      <div className="mt-2 flex items-center gap-2">
                        {insight.invoiceId ? (
                          <button
                            type="button"
                            onClick={() => void onOpenInvoice(insight.invoiceId!)}
                            className="px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-xs hover:bg-slate-800"
                          >
                            Belegeditor öffnen
                          </button>
                        ) : null}
                        {insight.rentalId ? (
                          <button
                            type="button"
                            onClick={() => void onOpenRentalDetail(insight.rentalId!)}
                            className="px-2.5 py-1.5 rounded-md border border-slate-300 text-xs hover:bg-white"
                          >
                            Vorgang öffnen
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

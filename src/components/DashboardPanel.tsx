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

function sumPaymentsForInvoice(payments: Payment[], invoiceId: string): number {
  const id = String(invoiceId || '').trim();
  if (!id) return 0;
  return payments
    .filter((p) => String(p.invoiceId || '').trim() === id)
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
  iconBgClass: string;
  icon: React.ReactNode;
  sublines?: string[];
}) {
  const { title, value, deltaText, deltaTone, iconBgClass, icon, sublines } = props;
  const toneClass =
    deltaTone === 'up' ? 'text-emerald-700' : deltaTone === 'down' ? 'text-rose-700' : 'text-slate-500';
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
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
          <span className="text-slate-400 font-normal">vs. letzter Monat</span>
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
}

export default function DashboardPanel(props: DashboardPanelProps) {
  const { customers, rentals, invoices, payments, onOpenRental, onOpenOrders } = props;
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

  const paymentsMonthTotal = useMemo(() => {
    return payments
      .filter((p) => {
        const ts = Number(p.receivedAt || p.createdAt || 0);
        return ts >= monthStart && ts < nextMonthStart;
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments, monthStart, nextMonthStart]);

  const paymentsPrevMonthTotal = useMemo(() => {
    return payments
      .filter((p) => {
        const ts = Number(p.receivedAt || p.createdAt || 0);
        return ts >= prevMonthStart && ts < monthStart;
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  }, [payments, prevMonthStart, monthStart]);

  const revenueDeltaPct = useMemo(() => {
    const prev = paymentsPrevMonthTotal;
    const cur = paymentsMonthTotal;
    if (prev <= 0 && cur > 0) return 100;
    if (prev <= 0) return 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10; // 1 decimal
  }, [paymentsPrevMonthTotal, paymentsMonthTotal]);

  const customerCount = customers.length;
  const customersThisMonth = useMemo(() => customers.filter((c) => c.createdAt >= monthStart && c.createdAt < nextMonthStart).length, [customers, monthStart, nextMonthStart]);
  const customersPrevMonth = useMemo(() => customers.filter((c) => c.createdAt >= prevMonthStart && c.createdAt < monthStart).length, [customers, prevMonthStart, monthStart]);
  const customersDelta = customersThisMonth - customersPrevMonth;

  const openRentalStatuses: RentalStatus[] = [
    'neu',
    'info_fehlt',
    'check_verfuegbarkeit',
    'angebot_gesendet',
    'angenommen',
    'rechnung_gestellt',
    'uebergabe_rueckgabe',
  ];
  const activeRentalsNow = useMemo(() => {
    return rentals.filter((r) => openRentalStatuses.includes(r.status) && toLocalDayStart(r.rentalStart) <= today && toLocalDayStart(r.rentalEnd) >= today).length;
  }, [rentals, today]);

  const activeRentalsPrevMonth = useMemo(() => {
    const ref = new Date();
    ref.setMonth(ref.getMonth() - 1);
    const refDay = toLocalDayStart(ref.getTime());
    return rentals.filter((r) => openRentalStatuses.includes(r.status) && toLocalDayStart(r.rentalStart) <= refDay && toLocalDayStart(r.rentalEnd) >= refDay).length;
  }, [rentals]);

  const activeRentalsDelta = activeRentalsNow - activeRentalsPrevMonth;

  const openOrdersCount = useMemo(() => {
    return rentals.filter((r) => ['angenommen', 'rechnung_gestellt', 'uebergabe_rueckgabe'].includes(r.status)).length;
  }, [rentals]);

  const openOrdersPrevMonth = useMemo(() => {
    // Heuristik: Vergleich nach Erstellungsmonat der Vorgänge
    const cur = rentals.filter((r) => ['angenommen', 'rechnung_gestellt', 'uebergabe_rueckgabe'].includes(r.status) && r.createdAt >= monthStart && r.createdAt < nextMonthStart).length;
    const prev = rentals.filter((r) => ['angenommen', 'rechnung_gestellt', 'uebergabe_rueckgabe'].includes(r.status) && r.createdAt >= prevMonthStart && r.createdAt < monthStart).length;
    return cur - prev;
  }, [rentals, monthStart, nextMonthStart, prevMonthStart]);

  const relevantInvoices = useMemo(() => {
    return invoices.filter((inv) => (inv.invoiceType === 'Auftrag' || inv.invoiceType === 'Rechnung') && inv.state !== 'storniert' && inv.state !== 'archiviert');
  }, [invoices]);

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

  const expectedRevenue = useMemo(() => {
    let total = 0;
    let open = 0;
    let count = 0;
    for (const inv of relevantInvoices) {
      const gross = Number(grossByInvoiceId[inv.id] || 0);
      const paid = Math.round(sumPaymentsForInvoice(payments, inv.id) * 100) / 100;
      const invOpen = Math.max(0, Math.round((gross - paid) * 100) / 100);
      if (gross <= 0) continue;
      if (invOpen <= 0) continue;
      count += 1;
      total += gross;
      open += invOpen;
    }
    total = Math.round(total * 100) / 100;
    open = Math.round(open * 100) / 100;
    return { total, open, count };
  }, [relevantInvoices, grossByInvoiceId, payments]);

  const expectedRevenueDeltaOrders = useMemo(() => {
    const cur = relevantInvoices.filter((inv) => inv.createdAt >= monthStart && inv.createdAt < nextMonthStart).length;
    const prev = relevantInvoices.filter((inv) => inv.createdAt >= prevMonthStart && inv.createdAt < monthStart).length;
    return cur - prev;
  }, [relevantInvoices, monthStart, nextMonthStart, prevMonthStart]);

  const ordersPaymentBuckets = useMemo(() => {
    const rows = relevantInvoices.map((inv) => {
      const gross = Number(grossByInvoiceId[inv.id] || 0);
      const paid = Math.round(sumPaymentsForInvoice(payments, inv.id) * 100) / 100;
      const open = Math.max(0, Math.round((gross - paid) * 100) / 100);
      return { inv, gross, paid, open };
    }).filter((x) => x.gross > 0 && x.open > 0);

    const partial = rows.filter((x) => x.paid > 0);
    const unpaid = rows.filter((x) => x.paid <= 0);

    const sum = (arr: typeof rows) => ({
      total: Math.round(arr.reduce((s, x) => s + x.gross, 0) * 100) / 100,
      paid: Math.round(arr.reduce((s, x) => s + x.paid, 0) * 100) / 100,
      open: Math.round(arr.reduce((s, x) => s + x.open, 0) * 100) / 100,
    });

    return {
      partial: { count: partial.length, ...sum(partial) },
      unpaid: { count: unpaid.length, ...sum(unpaid) },
      partialInvoices: partial.map((x) => x.inv),
      unpaidInvoices: unpaid.map((x) => x.inv),
    };
  }, [relevantInvoices, grossByInvoiceId, payments]);

  const upcomingAppointments = useMemo(() => {
    const in7 = today + 7 * 24 * 60 * 60 * 1000;
    const items: Array<{ kind: 'Übergabe' | 'Rückgabe'; ts: number; rental: RentalRequest }> = [];
    for (const r of rentals) {
      if (!openRentalStatuses.includes(r.status)) continue;
      const startDay = toLocalDayStart(r.rentalStart);
      const endDay = toLocalDayStart(r.rentalEnd);
      if (startDay >= today && startDay <= in7) items.push({ kind: 'Übergabe', ts: r.rentalStart, rental: r });
      if (endDay >= today && endDay <= in7) items.push({ kind: 'Rückgabe', ts: r.rentalEnd, rental: r });
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
    const curTotal = Math.round(cur.reduce((s, v) => s + v, 0) * 100) / 100;
    const prevTotal = Math.round(prev.reduce((s, v) => s + v, 0) * 100) / 100;

    return {
      labels: months,
      curYear: currentYear,
      prevYear: previousYear,
      cur,
      prev,
      curTotal,
      prevTotal,
    };
  }, [payments]);

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
          deltaText={`${revenueDeltaPct >= 0 ? '↗' : '↘'} ${Math.abs(revenueDeltaPct).toFixed(1)}%`}
          deltaTone={revenueDeltaPct >= 0 ? 'up' : 'down'}
          iconBgClass="bg-emerald-500 text-white"
          icon={<span className="text-lg font-bold">€</span>}
        />
        <KpiCard
          title="Aktive Kunden"
          value={`${customerCount}`}
          deltaText={`${customersDelta >= 0 ? '↗' : '↘'} ${customersDelta >= 0 ? '+' : ''}${customersDelta}`}
          deltaTone={customersDelta >= 0 ? 'up' : 'down'}
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
        />
        <KpiCard
          title="Offene Aufträge"
          value={`${openOrdersCount}`}
          deltaText={`${openOrdersPrevMonth >= 0 ? '↗' : '↘'} ${openOrdersPrevMonth >= 0 ? '+' : ''}${openOrdersPrevMonth}`}
          deltaTone={openOrdersPrevMonth >= 0 ? 'up' : 'down'}
          iconBgClass="bg-violet-500 text-white"
          icon={<span className="text-lg font-bold">🧾</span>}
        />
        <KpiCard
          title="Erwartete Einnahmen"
          value={formatCurrency(expectedRevenue.total)}
          deltaText={`${expectedRevenueDeltaOrders >= 0 ? '↗' : '↘'} ${expectedRevenueDeltaOrders >= 0 ? '+' : ''}${expectedRevenueDeltaOrders} Aufträge`}
          deltaTone={expectedRevenueDeltaOrders >= 0 ? 'up' : 'down'}
          iconBgClass="bg-sky-500 text-white"
          icon={<span className="text-lg font-bold">$</span>}
          sublines={[`Rest offen: ${formatCurrency(expectedRevenue.open)}`]}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
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
          <div className="mt-4 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onOpenOrders}
              className="text-sm font-medium text-amber-700 hover:underline"
            >
              Betroffene Aufträge anzeigen
            </button>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
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
          <div className="mt-4 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onOpenOrders}
              className="text-sm font-medium text-rose-700 hover:underline"
            >
              Betroffene Aufträge anzeigen
            </button>
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
            <div className="text-sm">Keine anstehenden Termine in den nächsten 7 Tagen</div>
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
          <div className="mt-3 text-sm text-slate-600">
            Kurz-Insights folgen (z.B. überfällige Rückgaben, offene Zahlungen, bevorstehende Übergaben).
          </div>
        </div>
      </div>
    </div>
  );
}

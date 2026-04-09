import { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import type { Invoice, Payment } from '../types';

interface EUeRProps {
  invoices: Invoice[];
  payments: Payment[];
}

interface EUeREntry {
  date: number;
  type: 'Einnahme' | 'Ausgabe';
  description: string;
  category: string;
  amount: number;
  invoiceNo?: string;
  taxAmount?: number;
}

export default function EinnahmenUeberschussRechnung({ invoices, payments }: EUeRProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    invoices.forEach(inv => {
      if (inv.invoiceDate) years.add(new Date(inv.invoiceDate).getFullYear());
    });
    payments.forEach(pay => {
      if (pay.receivedAt) years.add(new Date(pay.receivedAt).getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [invoices, payments]);

  const euerData = useMemo(() => {
    const entries: EUeREntry[] = [];

    payments
      .filter(p => {
        if (!p.receivedAt) return false;
        const year = new Date(p.receivedAt).getFullYear();
        return year === selectedYear;
      })
      .forEach(payment => {
        const invoice = invoices.find(inv => inv.id === payment.invoiceId);
        entries.push({
          date: payment.receivedAt || payment.createdAt,
          type: 'Einnahme',
          description: invoice ? `Zahlung ${invoice.invoiceNo}` : 'Zahlung',
          category: payment.kind || 'Sonstige Einnahme',
          amount: Number(payment.amount) || 0,
          invoiceNo: invoice?.invoiceNo,
          taxAmount: 0,
        });
      });

    return entries.sort((a, b) => a.date - b.date);
  }, [invoices, payments, selectedYear]);

  const summary = useMemo(() => {
    const einnahmen = euerData
      .filter(e => e.type === 'Einnahme')
      .reduce((sum, e) => sum + e.amount, 0);
    const ausgaben = euerData
      .filter(e => e.type === 'Ausgabe')
      .reduce((sum, e) => sum + e.amount, 0);
    return {
      einnahmen,
      ausgaben,
      gewinn: einnahmen - ausgaben,
    };
  }, [euerData]);

  const exportCSV = () => {
    const headers = ['Datum', 'Typ', 'Beschreibung', 'Kategorie', 'Betrag', 'Belegnummer'];
    const rows = euerData.map(e => [
      new Date(e.date).toLocaleDateString('de-DE'),
      e.type,
      e.description,
      e.category,
      e.amount.toFixed(2),
      e.invoiceNo || '',
    ]);
    const csv = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EÜR_${selectedYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Einnahmen-Überschuss-Rechnung (EÜR)</h2>
          <p className="text-sm text-slate-600 mt-1">Übersicht nach § 4 Abs. 3 EStG</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 border border-slate-300 rounded-md bg-white text-sm"
          >
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            <Download size={16} />
            CSV Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="text-sm font-medium text-emerald-900">Einnahmen</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">
            {summary.einnahmen.toFixed(2)} €
          </div>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
          <div className="text-sm font-medium text-rose-900">Ausgaben</div>
          <div className="text-2xl font-bold text-rose-700 mt-1">
            {summary.ausgaben.toFixed(2)} €
          </div>
        </div>
        <div className={[
          'border rounded-lg p-4',
          summary.gewinn >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'
        ].join(' ')}>
          <div className={[
            'text-sm font-medium',
            summary.gewinn >= 0 ? 'text-blue-900' : 'text-orange-900'
          ].join(' ')}>
            {summary.gewinn >= 0 ? 'Gewinn' : 'Verlust'}
          </div>
          <div className={[
            'text-2xl font-bold mt-1',
            summary.gewinn >= 0 ? 'text-blue-700' : 'text-orange-700'
          ].join(' ')}>
            {Math.abs(summary.gewinn).toFixed(2)} €
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                  Datum
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                  Typ
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                  Beschreibung
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                  Kategorie
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                  Belegnr.
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                  Betrag
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {euerData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    <FileText size={48} className="mx-auto mb-2 text-slate-300" />
                    <p>Keine Buchungen für {selectedYear}</p>
                  </td>
                </tr>
              ) : (
                euerData.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {new Date(entry.date).toLocaleDateString('de-DE')}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={[
                        'inline-flex px-2 py-1 rounded-full text-xs font-medium',
                        entry.type === 'Einnahme'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      ].join(' ')}>
                        {entry.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {entry.description}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {entry.category}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                      {entry.invoiceNo || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">
                      {entry.amount.toFixed(2)} €
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {euerData.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm font-bold text-slate-900">
                    Gesamt
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-slate-900">
                    {summary.gewinn.toFixed(2)} €
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Hinweis</h3>
        <p className="text-sm text-blue-800">
          Diese Übersicht basiert auf den erfassten Zahlungseingängen. Für eine vollständige EÜR müssen
          auch Betriebsausgaben erfasst werden. Die Darstellung dient nur zur Orientierung und ersetzt
          keine steuerliche Beratung.
        </p>
      </div>
    </div>
  );
}

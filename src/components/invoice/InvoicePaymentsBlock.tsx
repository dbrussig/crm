import { Payment } from '../../types';

interface InvoicePaymentsBlockProps {
  payments: Payment[];
  loading: boolean;
  total: number;
}

export default function InvoicePaymentsBlock({ payments, loading, total }: InvoicePaymentsBlockProps) {
  if (!payments.length && !loading) return null;

  return (
    <div className="mb-6 p-4 bg-emerald-50 rounded-lg border border-emerald-100">
      <h3 className="text-sm font-medium text-emerald-900 mb-2">Verknüpfte Zahlungen</h3>
      {loading ? (
        <div className="text-sm text-emerald-800">Zahlungen werden geladen…</div>
      ) : payments.length === 0 ? (
        <div className="text-sm text-emerald-800">Noch keine Zahlungen zugeordnet.</div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm text-emerald-900">
            {payments.length} Zahlung{payments.length === 1 ? '' : 'en'} • Summe {total.toFixed(2)} €
          </div>
          <div className="max-h-40 overflow-auto rounded border border-emerald-200 bg-white">
            {payments.map((p) => (
              <div key={p.id} className="px-3 py-2 text-sm border-b last:border-b-0 border-emerald-100">
                <div className="font-medium text-gray-900">{(Number(p.amount) || 0).toFixed(2)} € • {p.kind}</div>
                <div className="text-xs text-gray-600">
                  {new Date(p.receivedAt || p.createdAt).toLocaleDateString('de-DE')} • {p.method}{p.payerName ? ` • ${p.payerName}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

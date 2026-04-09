import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Euro, Calendar, Paperclip, RefreshCw, Download, Eye, X, Upload, ChevronRight, FileDown } from 'lucide-react';
import type { Invoice, Payment, Expense, ExpenseAttachment, RecurringInterval } from '../types';
import { getAllExpenses, createExpense, updateExpense, deleteExpense } from '../services/sqliteService';

interface EUeRProps {
  invoices: Invoice[];
  payments: Payment[];
  customers?: { id: string; firstName: string; lastName: string }[];
}

const YEARS = [2024, 2025, 2026, 2027, 2028];

function getRecurringMultiplier(interval?: RecurringInterval): number {
  switch (interval) {
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'halfyearly': return 2;
    case 'yearly': return 1;
    default: return 12;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const isPdf = (fileType: string) => fileType === 'application/pdf';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default function EinnahmenUeberschussRechnung({ invoices, payments, customers = [] }: EUeRProps) {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseAttachment, setExpenseAttachment] = useState<ExpenseAttachment | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ExpenseAttachment | null>(null);
  const [isFeeDrilldownOpen, setIsFeeDrilldownOpen] = useState(false);
  const [isRecurringChecked, setIsRecurringChecked] = useState(false);

  useEffect(() => { loadExpenses(); }, []);

  const loadExpenses = async () => {
    try {
      const loaded = await getAllExpenses();
      setExpenses(loaded);
    } catch (e) {
      console.error('Failed to load expenses', e);
    }
  };

  const customerMap = new Map(customers.map(c => [c.id, `${c.firstName} ${c.lastName}`.trim()]));

  // Einnahmen aus Rechnungen (nach Belegdatum)
  const incomes = invoices
    .filter(inv => {
      const t = inv.invoiceType;
      const s = inv.state;
      return (t === 'Rechnung' || t === 'Auftrag') && s !== 'storniert' && s !== 'entwurf';
    })
    .filter(inv => new Date(inv.invoiceDate).getFullYear() === selectedYear)
    .map(inv => ({
      invoiceId: inv.id,
      date: inv.invoiceDate,
      invoiceNo: inv.invoiceNo,
      customerName: customerMap.get(inv.companyId) || inv.buyerName || 'Unbekannt',
      amount: (() => {
        const items = (inv as any)._items;
        if (!items) return 0;
        return items.reduce((s: number, it: any) => s + (it.unitPrice || 0) * (it.quantity || 1), 0);
      })(),
    }))
    .sort((a, b) => b.date - a.date);

  // Direkt aus Payments (tatsächlich eingegangene Zahlungen)
  const incomePayments = payments
    .filter(p => new Date(p.receivedAt || p.createdAt).getFullYear() === selectedYear)
    .map(p => {
      const inv = invoices.find(i => i.id === p.invoiceId);
      const customerId = p.customerId || inv?.companyId || '';
      const customerName = customerMap.get(customerId) || inv?.buyerName || 'Unbekannt';
      return {
        paymentId: p.id,
        date: p.receivedAt || p.createdAt,
        invoiceNo: inv?.invoiceNo || '-',
        customerName,
        amount: Number(p.amount) || 0,
        fee: Number((p as any).fee) || 0,
        provider: (p as any).provider,
      };
    })
    .sort((a, b) => b.date - a.date);

  const totalIncome = incomePayments.reduce((s, p) => s + p.amount, 0);

  // Zahlungsgebühren
  const paymentFeesData = incomePayments.filter(p => p.fee > 0);
  const totalPaymentFees = paymentFeesData.reduce((s, p) => s + p.fee, 0);

  const yearExpenses = expenses
    .filter(e => new Date(e.date).getFullYear() === selectedYear)
    .sort((a, b) => {
      if (a.isRecurring && !b.isRecurring) return -1;
      if (!a.isRecurring && b.isRecurring) return 1;
      return b.date - a.date;
    });

  const totalExpensesBase = yearExpenses.reduce((s, e) => {
    if (e.isRecurring) return s + e.amount * getRecurringMultiplier(e.recurringInterval);
    return s + e.amount;
  }, 0);
  const totalExpenses = totalExpensesBase + totalPaymentFees;
  const balance = totalIncome - totalExpenses;

  // Expense Modal handlers
  const handleSaveExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const dateStr = fd.get('date') as string;
    const data = {
      date: new Date(dateStr).getTime(),
      amount: parseFloat(fd.get('amount') as string) || 0,
      description: (fd.get('description') as string)?.trim() || undefined,
      invoiceIssuer: (fd.get('invoiceIssuer') as string)?.trim() || undefined,
      isRecurring: fd.get('isRecurring') === 'on',
      recurringInterval: fd.get('isRecurring') === 'on'
        ? (fd.get('recurringInterval') as RecurringInterval)
        : undefined,
      attachment: expenseAttachment || editingExpense?.attachment || undefined,
    };
    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, data);
      } else {
        await createExpense(data);
      }
      setIsExpenseModalOpen(false);
      setEditingExpense(null);
      setExpenseAttachment(null);
      setIsRecurringChecked(false);
      await loadExpenses();
    } catch (err) {
      console.error('Error saving expense', err);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Ausgabe wirklich löschen?')) return;
    await deleteExpense(id);
    await loadExpenses();
  };

  const openCreate = () => {
    setEditingExpense(null);
    setExpenseAttachment(null);
    setIsRecurringChecked(false);
    setIsExpenseModalOpen(true);
  };

  const openEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setExpenseAttachment(exp.attachment || null);
    setIsRecurringChecked(exp.isRecurring);
    setIsExpenseModalOpen(true);
  };

  const processFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) { alert('Datei zu groß (max. 5MB)'); return; }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) { alert('Nur PDF und Bilder erlaubt'); return; }
    const reader = new FileReader();
    reader.onload = () => setExpenseAttachment({ fileName: file.name, fileType: file.type, fileSize: file.size, dataUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  const handleExportPaymentFeesPDF = async () => {
    if (paymentFeesData.length === 0) return;
    const { jsPDF: jsPDFCls } = await import('jspdf');
    const doc = new jsPDFCls();
    doc.setFontSize(16); doc.text('Zahlungsgebühren', 20, 20);
    doc.setFontSize(10); doc.text(`Jahr: ${selectedYear}`, 20, 28);
    let y = 42;
    paymentFeesData.forEach(entry => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(9);
      doc.text(format(new Date(entry.date), 'dd.MM.yyyy'), 20, y);
      doc.text(entry.invoiceNo || '-', 55, y);
      doc.text(entry.customerName.substring(0, 25), 85, y);
      doc.text(`${entry.fee.toFixed(2)} €`, 170, y);
      y += 8;
    });
    y += 4; doc.setFontSize(11);
    doc.text(`Summe: ${totalPaymentFees.toFixed(2)} €`, 20, y);
    doc.save(`zahlungsgebuehren-${selectedYear}.pdf`);
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Einnahmenüberschussrechnung</h1>
      </div>

      {/* Jahr-Selector */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200 sm:static sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:border-0">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {YEARS.map(year => (
            <button key={year} onClick={() => setSelectedYear(year)}
              className={cn(
                'flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                selectedYear === year
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              )}
            >{year}</button>
          ))}
        </div>
      </div>

      {/* Summenkarten */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
            <div><div className="text-xs text-slate-500">Einnahmen</div>
              <div className="text-lg font-bold text-emerald-600">{totalIncome.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg"><TrendingDown className="h-5 w-5 text-red-600" /></div>
            <div><div className="text-xs text-slate-500">Betriebsausgaben</div>
              <div className="text-lg font-bold text-red-600">{totalExpenses.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</div>
            </div>
          </div>
        </div>
        <div className={cn('bg-white rounded-xl border p-4 shadow-sm', balance >= 0 ? 'border-emerald-200' : 'border-red-200')}>
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', balance >= 0 ? 'bg-emerald-50' : 'bg-red-50')}>
              <Euro className={cn('h-5 w-5', balance >= 0 ? 'text-emerald-600' : 'text-red-600')} />
            </div>
            <div><div className="text-xs text-slate-500">{balance >= 0 ? 'Überschuss' : 'Verlust'}</div>
              <div className={cn('text-lg font-bold', balance >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                {balance.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabellen */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        {/* Einnahmen */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              <h2 className="text-base sm:text-lg font-semibold text-slate-900">Einnahmen</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">Zahlungseingänge {selectedYear}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Datum</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Rechnung</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Kunde</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Betrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {incomePayments.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-sm">Keine Zahlungen für {selectedYear}</td></tr>
                ) : (
                  incomePayments.map(entry => (
                    <tr key={entry.paymentId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-900 whitespace-nowrap">{format(new Date(entry.date), 'dd.MM.yyyy', { locale: de })}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{entry.invoiceNo || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-900">{entry.customerName}</td>
                      <td className="px-4 py-3 text-sm font-medium text-right whitespace-nowrap">{entry.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {incomePayments.length > 0 && (
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-sm font-medium text-slate-700">Summe Einnahmen</td>
                    <td className="px-4 py-3 text-sm font-bold text-emerald-600 text-right">{totalIncome.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Betriebsausgaben */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-slate-400" />
                <h2 className="text-base sm:text-lg font-semibold text-slate-900">Betriebsausgaben</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">Wiederkehrende werden hochgerechnet</p>
            </div>
            <button onClick={openCreate}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              <Plus className="h-4 w-4 mr-1" /> Neu
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Datum</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Steller</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Beschreibung</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Betrag</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {totalPaymentFees > 0 && (
                  <tr className="bg-amber-50">
                    <td className="px-4 py-3 text-sm text-slate-400">-</td>
                    <td className="px-4 py-3 text-sm text-amber-700 font-medium">SumUp / PayPal</td>
                    <td className="px-4 py-3 text-sm text-amber-700">
                      <button onClick={() => setIsFeeDrilldownOpen(true)} className="flex items-center gap-1 hover:underline">
                        Zahlungsgebühren {selectedYear} <ChevronRight className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-amber-700 font-bold text-right">{totalPaymentFees.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={handleExportPaymentFeesPDF} className="p-2 rounded-md text-amber-600 hover:bg-amber-100" title="PDF Export">
                        <FileDown className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )}
                {yearExpenses.length === 0 && totalPaymentFees === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">Keine Betriebsausgaben für {selectedYear}</td></tr>
                ) : (
                  yearExpenses.map(expense => (
                    <tr key={expense.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-900 whitespace-nowrap">
                        {expense.isRecurring
                          ? <span className="text-blue-500 flex items-center gap-1"><RefreshCw className="h-3 w-3" />{expense.recurringInterval === 'monthly' ? 'monatlich' : expense.recurringInterval === 'quarterly' ? 'vierteljährlich' : expense.recurringInterval === 'halfyearly' ? 'halbjährlich' : 'jährlich'}</span>
                          : format(new Date(expense.date), 'dd.MM.yyyy', { locale: de })}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 font-medium">{expense.invoiceIssuer || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-[140px]">{expense.description || '-'}</span>
                          {expense.attachment && (
                            <div className="flex items-center gap-1">
                              <button onClick={() => setPreviewAttachment(expense.attachment!)} className="text-blue-600 hover:text-blue-700" title="Vorschau">
                                <Eye className="h-4 w-4" />
                              </button>
                              <a href={expense.attachment.dataUrl} download={expense.attachment.fileName} className="text-emerald-600 hover:text-emerald-700" title={expense.attachment.fileName}>
                                <Download className="h-4 w-4" />
                              </a>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-right whitespace-nowrap">{expense.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(expense)} className="p-2 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDeleteExpense(expense.id)} className="p-2 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {yearExpenses.length > 0 && (
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-sm font-medium text-slate-700">Summe Betriebsausgaben</td>
                    <td className="px-4 py-3 text-sm font-bold text-red-600 text-right">{totalExpenses.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Ausgaben-Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">{editingExpense ? 'Ausgabe bearbeiten' : 'Neue Betriebsausgabe'}</h2>
              <button onClick={() => { setIsExpenseModalOpen(false); setEditingExpense(null); setExpenseAttachment(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Datum</label>
                <input type="date" name="date" required
                  defaultValue={editingExpense ? new Date(editingExpense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                  className="mt-1 block w-full h-10 rounded-md border border-slate-300 px-3 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Betrag (€)</label>
                <input type="number" name="amount" step="0.01" min="0" required
                  defaultValue={editingExpense?.amount || ''}
                  className="mt-1 block w-full h-10 rounded-md border border-slate-300 px-3 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Rechnungssteller</label>
                <input type="text" name="invoiceIssuer" defaultValue={editingExpense?.invoiceIssuer || ''} placeholder="z.B. Amazon, Telekom ..."
                  className="mt-1 block w-full h-10 rounded-md border border-slate-300 px-3 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Beschreibung</label>
                <textarea name="description" rows={2} defaultValue={editingExpense?.description || ''} placeholder="z.B. Büromaterial, Software ..."
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-sm resize-none" />
              </div>
              <div className="flex items-start gap-3">
                <input type="checkbox" name="isRecurring" id="isRecurring" checked={isRecurringChecked} onChange={e => setIsRecurringChecked(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600" />
                <div className="flex-1">
                  <label htmlFor="isRecurring" className="text-sm font-medium text-slate-700 cursor-pointer">Wiederkehrend</label>
                  {isRecurringChecked && (
                    <select name="recurringInterval" defaultValue={editingExpense?.recurringInterval || 'monthly'}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                      <option value="monthly">Monatlich</option>
                      <option value="quarterly">Vierteljährlich</option>
                      <option value="halfyearly">Halbjährlich</option>
                      <option value="yearly">Jährlich</option>
                    </select>
                  )}
                  <p className="text-xs text-slate-500 mt-1">Betrag wird auf Jahressumme hochgerechnet</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Beleg (PDF/Bild)</label>
                {expenseAttachment ? (
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    {isPdf(expenseAttachment.fileType)
                      ? <div className="h-8 w-8 bg-red-100 rounded flex items-center justify-center flex-shrink-0"><span className="text-red-600 text-xs font-bold">PDF</span></div>
                      : <img src={expenseAttachment.dataUrl} alt="Vorschau" className="h-8 w-8 object-cover rounded flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{expenseAttachment.fileName}</p>
                      <p className="text-xs text-slate-500">{formatFileSize(expenseAttachment.fileSize)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setPreviewAttachment(expenseAttachment)} className="p-1.5 text-slate-400 hover:text-emerald-600 rounded"><Eye className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setExpenseAttachment(null)} className="p-1.5 text-slate-400 hover:text-red-600 rounded"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={e => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
                    onClick={() => document.getElementById('eur-file-input')?.click()}
                    className={cn('relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                      isDragOver ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50')}
                  >
                    <input id="eur-file-input" type="file" accept=".pdf,image/*"
                      onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                    <Upload className={cn('h-8 w-8 mx-auto mb-2', isDragOver ? 'text-emerald-500' : 'text-slate-400')} />
                    <p className="text-sm text-slate-600"><span className="font-medium">Datei hierher ziehen</span> oder klicken</p>
                    <p className="text-xs text-slate-400">PDF oder Bild, max. 5MB</p>
                  </div>
                )}
              </div>
              <div className="flex flex-row-reverse gap-2 pt-2">
                <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">Speichern</button>
                <button type="button" onClick={() => { setIsExpenseModalOpen(false); setEditingExpense(null); setExpenseAttachment(null); }}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Abbrechen</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Beleg-Vorschau Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700 truncate">{previewAttachment.fileName}</span>
              </div>
              <div className="flex items-center gap-2">
                <a href={previewAttachment.dataUrl} download={previewAttachment.fileName}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700">
                  <Download className="h-4 w-4" /> Download
                </a>
                <button onClick={() => setPreviewAttachment(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="p-4">
              {isPdf(previewAttachment.fileType)
                ? <iframe src={previewAttachment.dataUrl} className="w-full h-[60vh]" title="PDF-Vorschau" />
                : <img src={previewAttachment.dataUrl} alt="Vorschau" className="max-w-full max-h-[60vh] mx-auto object-contain" />}
            </div>
          </div>
        </div>
      )}

      {/* Zahlungsgebühren Drilldown */}
      {isFeeDrilldownOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-slate-900">Zahlungsgebühren {selectedYear}</h2>
              <button onClick={() => setIsFeeDrilldownOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Datum</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Rechnung</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Kunde</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Betrag</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Gebühr</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paymentFeesData.length === 0
                    ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Keine Gebühren</td></tr>
                    : paymentFeesData.map((entry, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm">{format(new Date(entry.date), 'dd.MM.yyyy', { locale: de })}</td>
                        <td className="px-4 py-3 text-sm">{entry.invoiceNo || '-'}</td>
                        <td className="px-4 py-3 text-sm">{entry.customerName}</td>
                        <td className="px-4 py-3 text-sm text-right">{entry.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</td>
                        <td className="px-4 py-3 text-sm text-amber-600 font-medium text-right">{entry.fee.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</td>
                      </tr>
                    ))}
                </tbody>
                {paymentFeesData.length > 0 && (
                  <tfoot className="bg-slate-50">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-sm font-medium text-slate-700">Summe</td>
                      <td className="px-4 py-3 text-sm font-bold text-amber-600 text-right">{totalPaymentFees.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

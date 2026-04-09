import { RefObject } from 'react';
import { ArrowRight, ChevronDown, Download, Eye, FileText, Mail, Save, Send } from 'lucide-react';
import { InvoiceState } from '../../types';

interface InvoiceActionsProps {
  canSave: boolean;
  isDirty: boolean;
  state: InvoiceState;
  invoiceId?: string;
  depositReceivedEnabled: boolean;
  depositReceivedAmount: number;
  onDepositReceivedEnabledChange: (enabled: boolean) => void;
  onDepositReceivedAmountChange: (amount: number) => void;
  onSave: () => void;
  onSend?: () => void;
  onPreviewPdf: () => void;
  onSavePdf: () => void;
  onMailCustomer: () => void;
  onDownloadHtml: () => void;
  onWorkflowAction: (action: 'convert' | 'reissue' | 'storno') => void;
  canConvert: boolean;
  convertLabel?: string;
  canReissue: boolean;
  canStorno: boolean;
  moreActionsOpen: boolean;
  onMoreActionsToggle: () => void;
  moreActionsWrapRef: RefObject<HTMLDivElement | null>;
  depositReceivedAmountRef: RefObject<HTMLInputElement | null>;
  primaryBtnClass: string;
  secondaryBtnClass: string;
}

export default function InvoiceActions({
  canSave,
  state,
  invoiceId,
  depositReceivedEnabled,
  depositReceivedAmount,
  onDepositReceivedEnabledChange,
  onDepositReceivedAmountChange,
  onSave,
  onSend,
  onPreviewPdf,
  onSavePdf,
  onMailCustomer,
  onDownloadHtml,
  onWorkflowAction,
  canConvert,
  convertLabel,
  canReissue,
  canStorno,
  moreActionsOpen,
  onMoreActionsToggle,
  moreActionsWrapRef,
  depositReceivedAmountRef,
  primaryBtnClass,
  secondaryBtnClass,
}: InvoiceActionsProps) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-slate-200 bg-white/95 px-4 pb-4 pt-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">

        {/* Linke Seite: primäre Aktionen */}
        <div className="flex flex-wrap gap-2">
          <button onClick={onSave} className={primaryBtnClass} title="Beleg speichern" disabled={!canSave}>
            <Save size={14} aria-hidden="true" /> Speichern
          </button>

          {/* Workflow-Fortschritt: primärer Pfad – prominent neben Speichern */}
          {canConvert && (
            <button
              type="button"
              onClick={() => onWorkflowAction('convert')}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              title={convertLabel || 'Nächster Workflow-Schritt'}
            >
              <ArrowRight size={14} aria-hidden="true" />
              {convertLabel || 'Weiter'}
            </button>
          )}

          {onSend && invoiceId && state === 'entwurf' && (
            <button onClick={onSend} className={secondaryBtnClass} title="Belegstatus auf gesendet setzen">
              <Send size={14} aria-hidden="true" /> Senden
            </button>
          )}

          {/* Kautionsbestätigung für bezahlte Rechnungen */}
          {state === ('bezahlt' as InvoiceState) && (
            <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md bg-white">
              <button
                type="button"
                onClick={() => {
                  onDepositReceivedEnabledChange(!depositReceivedEnabled);
                  if (!depositReceivedEnabled) {
                    setTimeout(() => depositReceivedAmountRef.current?.focus(), 0);
                  }
                }}
                className={`px-2 py-1 rounded text-sm border ${
                  depositReceivedEnabled
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
                aria-pressed={depositReceivedEnabled}
                title="Fügt in der Rechnung einen Hinweis hinzu, dass die Kaution dankend erhalten wurde."
              >
                Kautionsbestätigung
              </button>
              <input
                ref={depositReceivedAmountRef}
                type="number"
                step="0.01"
                min="0"
                className="w-28 px-2 py-1 border border-gray-300 rounded text-sm"
                placeholder="Wert"
                value={depositReceivedAmount || ''}
                onChange={(e) => onDepositReceivedAmountChange(Number(e.target.value))}
                disabled={!depositReceivedEnabled}
                aria-label="Kaution Wert in Euro"
              />
            </div>
          )}
        </div>

        {/* Rechte Seite: sekundäre Aktionen */}
        <div className="flex items-center gap-2">
          <button onClick={onPreviewPdf} className={secondaryBtnClass} title="PDF Vorschau öffnen">
            <Eye size={14} aria-hidden="true" /> Vorschau
          </button>

          {/* Mehr Aktionen Dropdown */}
          <div className="relative" ref={moreActionsWrapRef}>
            <button
              type="button"
              onClick={onMoreActionsToggle}
              className={secondaryBtnClass}
              title="Weitere Aktionen"
              aria-haspopup="menu"
              aria-expanded={moreActionsOpen}
            >
              Mehr... <ChevronDown size={14} aria-hidden="true" />
            </button>

            {moreActionsOpen && (
              <div
                className="absolute right-0 bottom-full mb-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onSavePdf()}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                  title="PDF lokal speichern"
                >
                  <FileText size={14} aria-hidden="true" /> PDF speichern
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onMailCustomer()}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                  title="Öffnet Gmail-Entwurf"
                >
                  <Mail size={14} aria-hidden="true" /> Per Mail senden
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onDownloadHtml()}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                  title="Druckbare HTML-Datei herunterladen"
                >
                  <Download size={14} aria-hidden="true" /> HTML herunterladen
                </button>

                {canReissue && (
                  <>
                    <div className="border-t border-slate-200 my-1" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onWorkflowAction('reissue')}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                    >
                      Neu ausstellen (Reissue)
                    </button>
                  </>
                )}
                {canStorno && (
                  <>
                    <div className="border-t border-slate-200 my-1" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onWorkflowAction('storno')}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Stornieren
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

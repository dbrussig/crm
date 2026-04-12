/**
 * KanbanCard Component
 * Draggable Card für Kanban Board
 * Zeigt Vorgang-Details auf einen Blick
 *
 * Performance-Optimized mit React.memo
 */

import { Invoice, RentalRequest, RentalStatus } from '../types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { memo, useRef, useState } from 'react';
import { saveInvoicePdfViaPrintDialog } from '../services/pdfExportService';
import { openInvoiceCompose, type EmailSendResult } from '../services/invoiceEmailService';
import ConfirmModal from './ConfirmModal';

interface KanbanCardProps {
  rental: RentalRequest;
  customerName?: string;
  customerEmail?: string;
  latestInvoice?: Invoice;
  onEditLatestInvoice?: (invoiceId: string) => void;
  onClick: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  isTransitioning?: boolean;
}

/**
 * Custom comparison function for React.memo
 * Only re-renders if critical props changed
 */
const arePropsEqual = (prevProps: KanbanCardProps, nextProps: KanbanCardProps): boolean => {
  return (
    prevProps.rental.id === nextProps.rental.id &&
    prevProps.rental.updatedAt === nextProps.rental.updatedAt &&
    prevProps.rental.status === nextProps.rental.status &&
    prevProps.rental.productType === nextProps.rental.productType &&
    prevProps.rental.rentalStart === nextProps.rental.rentalStart &&
    prevProps.rental.rentalEnd === nextProps.rental.rentalEnd &&
    prevProps.rental.availabilityStatus === nextProps.rental.availabilityStatus &&
    prevProps.rental.priceSnapshot === nextProps.rental.priceSnapshot &&
    prevProps.rental.deposit === nextProps.rental.deposit &&
    (prevProps.rental.priceOverride?.overridePrice ?? null) === (nextProps.rental.priceOverride?.overridePrice ?? null) &&
    prevProps.customerName === nextProps.customerName &&
    prevProps.customerEmail === nextProps.customerEmail &&
    prevProps.latestInvoice?.id === nextProps.latestInvoice?.id &&
    prevProps.latestInvoice?.invoiceDate === nextProps.latestInvoice?.invoiceDate &&
    prevProps.latestInvoice?.state === nextProps.latestInvoice?.state &&
    prevProps.onEditLatestInvoice === nextProps.onEditLatestInvoice &&
    prevProps.canMoveLeft === nextProps.canMoveLeft &&
    prevProps.canMoveRight === nextProps.canMoveRight &&
    prevProps.isTransitioning === nextProps.isTransitioning
  );
};

export const KanbanCard = memo<KanbanCardProps>(({ rental, customerName, customerEmail, latestInvoice, onEditLatestInvoice, onClick, onMoveLeft, onMoveRight, canMoveLeft, canMoveRight, isTransitioning }) => {
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const showError = (text: string) => setNotice({ tone: 'error', text });
  const showInfo = (text: string) => setNotice({ tone: 'info', text });

  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  } | null>(null);

  const requestConfirm = (opts: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  }) => {
    setConfirmModal(opts);
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
    });
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rental.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Status Badge
  const getStatusColor = (status: RentalStatus) => {
    const colors: Record<RentalStatus, string> = {
      neu: 'bg-blue-100 text-blue-800 border-blue-200',
      info_fehlt: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      check_verfuegbarkeit: 'bg-purple-100 text-purple-800 border-purple-200',
      angebot_gesendet: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      angenommen: 'bg-green-100 text-green-800 border-green-200',
      rechnung_gestellt: 'bg-cyan-100 text-cyan-800 border-cyan-200',
      uebergabe_rueckgabe: 'bg-teal-100 text-teal-800 border-teal-200',
      abgeschlossen: 'bg-gray-100 text-gray-800 border-gray-200',
      archiviert: 'bg-slate-100 text-slate-700 border-slate-200',
      abgelehnt: 'bg-red-100 text-red-800 border-red-200',
      storniert: 'bg-red-100 text-red-800 border-red-200',
      noshow: 'bg-orange-100 text-orange-800 border-orange-200',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: RentalStatus) => {
    const labels: Record<RentalStatus, string> = {
      neu: 'Neu',
      info_fehlt: 'Info fehlt',
      check_verfuegbarkeit: 'Verfügbarkeit prüfen',
      angebot_gesendet: 'Angebot gesendet',
      angenommen: 'Angenommen',
      rechnung_gestellt: 'Rechnung gestellt',
      uebergabe_rueckgabe: 'Übergabe/Rückgabe',
      abgeschlossen: 'Abgeschlossen',
      archiviert: 'Archiviert',
      abgelehnt: 'Abgelehnt',
      storniert: 'Storniert',
      noshow: 'No-Show',
    };
    return labels[status] || status;
  };

  // Availability Badge
  const getAvailabilityBadge = () => {
    if (!rental.availabilityStatus) return null;

    const badges = {
      frei: 'bg-green-100 text-green-800 border-green-200',
      belegt: 'bg-red-100 text-red-800 border-red-200',
      unklar: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    };

    const labels = {
      frei: '✅ Frei',
      belegt: '❌ Belegt',
      unklar: '❓ Unklar',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${badges[rental.availabilityStatus]}`}>
        {labels[rental.availabilityStatus]}
      </span>
    );
  };

  // Format dates
  const formatDate = (timestamp?: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // Calculate duration
  const getDuration = () => {
    if (!rental.rentalStart || !rental.rentalEnd) return '-';
    const start = new Date(rental.rentalStart);
    const end = new Date(rental.rentalEnd);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return `${days} Tag${days > 1 ? 'e' : ''}`;
  };

  // Calculate missing info count
  const missingCount = rental.missingInfo?.length || 0;
  const effectivePrice = rental.priceOverride ? rental.priceOverride.overridePrice : (rental.priceSnapshot || 0);
  const daysToStart = Math.ceil((Number(rental.rentalStart || 0) - Date.now()) / (1000 * 60 * 60 * 24));
  const needsImmediateAttention =
    missingCount > 0 ||
    ((rental.status === 'angebot_gesendet' || rental.status === 'angenommen') && latestInvoice?.state === 'entwurf') ||
    (daysToStart >= 0 && daysToStart <= 3 && rental.status !== 'abgeschlossen' && rental.status !== 'archiviert');
  const attentionHint = (() => {
    if (missingCount > 0) return 'Fehlende Angaben ergänzen';
    if ((rental.status === 'angebot_gesendet' || rental.status === 'angenommen') && latestInvoice?.state === 'entwurf') {
      return 'Beleg ist noch Entwurf';
    }
    if (daysToStart >= 0 && daysToStart <= 3 && rental.status !== 'abgeschlossen' && rental.status !== 'archiviert') {
      return 'Termin in den nächsten 3 Tagen';
    }
    return '';
  })();
  const getInvoiceStateBadge = () => {
    if (!latestInvoice) return null;
    const map: Record<string, { label: string; className: string }> = {
      entwurf: { label: 'Entwurf', className: 'bg-gray-100 text-gray-700 border-gray-200' },
      gesendet: { label: 'Gesendet', className: 'bg-blue-100 text-blue-700 border-blue-200' },
      angenommen: { label: 'Angenommen', className: 'bg-green-100 text-green-700 border-green-200' },
      storniert: { label: 'Storniert', className: 'bg-red-100 text-red-700 border-red-200' },
    };
    const info = map[String(latestInvoice.state || '').toLowerCase()] || map.entwurf;
    return (
      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${info.className}`}>
        {info.label}
      </span>
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`
        relative bg-white rounded-lg shadow-sm border
        ${needsImmediateAttention ? 'border-amber-300' : 'border-gray-200'}
        hover:shadow-md hover:border-blue-300
        cursor-pointer transition-all duration-200
        ${isDragging ? 'ring-2 ring-blue-500' : ''}
      `}
    >
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          cancelLabel={confirmModal.cancelLabel}
          danger={confirmModal.danger}
          onConfirm={() => {
            const resolve = confirmResolveRef.current;
            confirmResolveRef.current = null;
            setConfirmModal(null);
            resolve?.(true);
          }}
          onCancel={() => {
            const resolve = confirmResolveRef.current;
            confirmResolveRef.current = null;
            setConfirmModal(null);
            resolve?.(false);
          }}
        />
      )}

      {/* Loading Overlay */}
      {isTransitioning && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" aria-hidden="true"></div>
            <span className="text-xs text-slate-600 font-medium">Wird verschoben...</span>
          </div>
        </div>
      )}

      {notice && (
        <div
          className={[
            'm-2 rounded-lg border px-3 py-2 text-xs whitespace-pre-line',
            notice.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-slate-200 bg-slate-50 text-slate-800',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-2">
            <div>{notice.text}</div>
            <button
              className="text-slate-500 hover:text-slate-800"
              onClick={(e) => {
                e.stopPropagation();
                setNotice(null);
              }}
              aria-label="Hinweis schließen"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-start justify-between">
          {/* Kunde & Produkt */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {customerName || 'Unbekannt'}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getStatusColor(rental.status)}`}>
                {getStatusLabel(rental.status)}
              </span>
            </div>

            <div className="text-xs text-gray-600">
              {rental.productType}
            </div>
          </div>

          {/* Availability Badge */}
          {rental.availabilityStatus && getAvailabilityBadge()}
        </div>
        {needsImmediateAttention ? (
          <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            ⚡ {attentionHint}
          </div>
        ) : null}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        {/* Mietzeitraum */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Zeitraum:</span>
          <span className="font-medium text-gray-900">
            {formatDate(rental.rentalStart)} - {formatDate(rental.rentalEnd)}
          </span>
        </div>

        {/* Dauer */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-600">Dauer:</span>
          <span className="font-medium text-gray-900">{getDuration()}</span>
        </div>

        {/* Preis (wenn verfügbar) */}
        {effectivePrice > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Preis:</span>
            <span className="font-semibold text-green-700" title={rental.priceOverride ? 'Manuell geändert' : undefined}>
              {effectivePrice.toFixed(2)} €
            </span>
          </div>
        )}

        {/* Kaution (wenn verfügbar) */}
        {rental.deposit && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600">Kaution:</span>
            <span className="font-medium text-gray-900">
              {rental.deposit.toFixed(2)} €
            </span>
          </div>
        )}

        {/* Missing Info Warning */}
        {missingCount > 0 && (
          <div className="flex items-start gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
            <span className="text-yellow-600">⚠️</span>
            <div className="flex-1">
              <span className="text-xs font-medium text-yellow-800">
                {missingCount} fehlende Info{missingCount > 1 ? 's' : ''}
              </span>
              {missingCount <= 3 && rental.missingInfo && (
                <div className="mt-1 text-xs text-yellow-700">
                  {rental.missingInfo.slice(0, 3).join(', ')}
                  {missingCount > 3 && '...'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Belegnummer (wenn verfügbar) */}
        {rental.googleEventId && (
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <span>📅</span>
            <span>Kalender Event</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 rounded-b-lg">
        {latestInvoice ? (
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {onEditLatestInvoice ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditLatestInvoice(latestInvoice.id);
                  }}
                  className="text-[11px] text-blue-700 hover:underline truncate"
                  aria-label={`Beleg ${latestInvoice.invoiceNo || latestInvoice.id} im Editor öffnen`}
                  title="Beleg im Editor öffnen"
                >
                  Beleg: {latestInvoice.invoiceType} {latestInvoice.invoiceNo || '(ohne Nummer)'}
                </button>
              ) : (
                <span className="text-[11px] text-gray-600 truncate">
                  Beleg: {latestInvoice.invoiceType} {latestInvoice.invoiceNo || '(ohne Nummer)'}
                </span>
              )}
              {getInvoiceStateBadge()}
            </div>
            <div className="flex items-center gap-1">
              {onEditLatestInvoice ? (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditLatestInvoice(latestInvoice.id);
                  }}
                  className="px-2 py-0.5 text-[11px] rounded border border-gray-300 hover:bg-white"
                  aria-label={`Beleg ${latestInvoice.invoiceNo} bearbeiten`}
                  title="Beleg bearbeiten"
                >
                  ✏️
                </button>
              ) : null}
              {onEditLatestInvoice ? (
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditLatestInvoice(latestInvoice.id);
                  }}
                  className="px-2 py-0.5 text-[11px] rounded border border-gray-300 hover:bg-white"
                  aria-label={`Beleg ${latestInvoice.invoiceNo || latestInvoice.id} im Editor öffnen`}
                  title="Beleg im Editor öffnen"
                >
                  👁️
                </button>
              ) : null}
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  void saveInvoicePdfViaPrintDialog(latestInvoice);
                }}
                className="px-2 py-0.5 text-[11px] rounded border border-gray-300 hover:bg-white"
                aria-label={`Beleg ${latestInvoice.invoiceNo} als PDF speichern`}
                title="PDF speichern"
              >
                📄
              </button>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={async (e) => {
                  e.stopPropagation();
                  const to = String(customerEmail || '').trim();
                  if (!to) {
                    showError('Keine Kunden-E-Mail hinterlegt.');
                    return;
                  }
                  const result = await openInvoiceCompose({
                    invoice: latestInvoice,
                    toEmail: to,
                    customerName: customerName || latestInvoice.buyerName || '',
                    preferGmail: true,
                  });
                  if (result.type === 'sent' || result.type === 'warning') {
                    showInfo(result.message);
                  } else if (result.type === 'fallback') {
                    const ok = await requestConfirm({
                      title: 'SMTP-Versand fehlgeschlagen',
                      message: `${result.error}\n\nStattdessen Entwurf im Browser öffnen?`,
                      confirmLabel: 'Browser öffnen',
                      cancelLabel: 'Abbrechen',
                    });
                    if (ok) {
                      const url = result.preferGmail === false ? result.links.mailtoUrl : result.links.gmailUrl;
                      const win = window.open(url, '_blank');
                      if (!win) window.location.href = url;
                    }
                  }
                }}
                className="px-2 py-0.5 text-[11px] rounded border border-gray-300 hover:bg-white"
                aria-label={`Beleg ${latestInvoice.invoiceNo} per E-Mail senden`}
                title="Per Mail senden"
              >
                ✉️
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between">
          {/* Keyboard Navigation Buttons */}
          <div className="flex items-center gap-1" role="group" aria-label="Status ändern">
            {onMoveLeft && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveLeft();
                }}
                disabled={!canMoveLeft}
                className="p-1 text-gray-600 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed hover:bg-gray-200 rounded transition-colors"
                aria-label="Nach links verschieben"
                title="Nach links verschieben (←)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {onMoveRight && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveRight();
                }}
                disabled={!canMoveRight}
                className="p-1 text-gray-600 hover:text-blue-600 disabled:text-gray-300 disabled:cursor-not-allowed hover:bg-gray-200 rounded transition-colors"
                aria-label="Nach rechts verschieben"
                title="Nach rechts verschieben (→)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

          {/* ID & Date */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{new Date(rental.createdAt).toLocaleDateString('de-DE')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}, arePropsEqual);

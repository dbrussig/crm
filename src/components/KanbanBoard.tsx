/**
 * KanbanBoard Component
 * 7-Spalten Workflow: Neu → Info fehlt → Check Verfügbarkeit → Angebot gesendet → Angenommen → Übergabe/Rückgabe → Abgeschlossen
 * Mit Drag-and-Drop und validierten Transitions
 *
 * Accessibility:
 * - ARIA-Labels für alle Spalten und Karten
 * - Keyboard-Navigation für Drag-and-Drop
 * - Screenreader-Announcements bei Status-Changes
 */

import { useState, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { RentalRequest, RentalStatus, Customer, Invoice } from '../types';
import { KanbanCard } from './KanbanCard';
import {
  canTransitionStatus,
  fetchAllRentalRequests,
  getRentalStatusLabel,
  transitionStatus,
} from '../services/rentalService';
import { fetchAllInvoices } from '../services/invoiceService';
import { announceToScreenreader } from '../utils/accessibility.tsx';

interface KanbanBoardProps {
  customers: Customer[];
  onCardClick: (rental: RentalRequest) => void;
  onOpenInvoice?: (invoiceId: string) => void;
}

const COLUMNS: Array<{
  status: RentalStatus;
  label: string;
  description: string;
  shellClass: string;
  headerClass: string;
  countClass: string;
  emptyClass: string;
}> = [
  {
    status: 'neu',
    label: 'Neu',
    description: 'Neue Anfragen',
    shellClass: 'bg-blue-50 border-blue-200',
    headerClass: 'text-blue-900',
    countClass: 'bg-blue-100 text-blue-800 border-blue-200',
    emptyClass: 'text-blue-500',
  },
  {
    status: 'info_fehlt',
    label: 'Info fehlt',
    description: 'Fehlende Informationen sammeln',
    shellClass: 'bg-orange-50 border-orange-200',
    headerClass: 'text-orange-900',
    countClass: 'bg-orange-100 text-orange-800 border-orange-200',
    emptyClass: 'text-orange-500',
  },
  {
    status: 'check_verfuegbarkeit',
    label: 'Verfügbarkeit prüfen',
    description: 'Kalender und Ressourcen prüfen',
    shellClass: 'bg-amber-50 border-amber-200',
    headerClass: 'text-amber-900',
    countClass: 'bg-amber-100 text-amber-800 border-amber-200',
    emptyClass: 'text-amber-600',
  },
  {
    status: 'angebot_gesendet',
    label: 'Angebot gesendet',
    description: 'Angebot an Kunde gesendet',
    shellClass: 'bg-violet-50 border-violet-200',
    headerClass: 'text-violet-900',
    countClass: 'bg-violet-100 text-violet-800 border-violet-200',
    emptyClass: 'text-violet-500',
  },
  {
    status: 'angenommen',
    label: 'Angenommen',
    description: 'Auftrag bestätigt',
    shellClass: 'bg-emerald-50 border-emerald-200',
    headerClass: 'text-emerald-900',
    countClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    emptyClass: 'text-emerald-500',
  },
  {
    status: 'uebergabe_rueckgabe',
    label: 'Übergabe/Rückgabe',
    description: 'Geräte übergeben',
    shellClass: 'bg-teal-50 border-teal-200',
    headerClass: 'text-teal-900',
    countClass: 'bg-teal-100 text-teal-800 border-teal-200',
    emptyClass: 'text-teal-600',
  },
  {
    status: 'abgeschlossen',
    label: 'Abgeschlossen',
    description: 'Vorgang abgeschlossen',
    shellClass: 'bg-slate-100 border-slate-200',
    headerClass: 'text-slate-900',
    countClass: 'bg-slate-200 text-slate-800 border-slate-300',
    emptyClass: 'text-slate-500',
  },
];

// Helper: Get adjacent status for keyboard navigation
const getAdjacentStatus = (currentStatus: RentalStatus, direction: 'left' | 'right'): RentalStatus | null => {
  const currentIndex = COLUMNS.findIndex(col => col.status === currentStatus);
  if (currentIndex === -1) return null;

  const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= COLUMNS.length) return null;

  return COLUMNS[targetIndex].status;
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ customers, onCardClick, onOpenInvoice }) => {
  const [rentals, setRentals] = useState<RentalRequest[]>([]);
  const [latestInvoiceByRentalId, setLatestInvoiceByRentalId] = useState<Record<string, Invoice>>({});
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'liste'>('kanban');

  const mapLatestInvoicesByRental = (invoices: Invoice[]): Record<string, Invoice> => {
    const byRental: Record<string, Invoice> = {};
    for (const inv of invoices) {
      const key = String(inv.rentalRequestId || '').trim();
      if (!key) continue;
      const current = byRental[key];
      if (!current || Number(inv.invoiceDate || 0) > Number(current.invoiceDate || 0)) {
        byRental[key] = inv;
      }
    }
    return byRental;
  };

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 10,
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 250,
      tolerance: 5,
    },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  // Load rentals
  useEffect(() => {
    const loadRentals = async () => {
      setLoading(true);
      try {
        const loaded = await fetchAllRentalRequests();
        setRentals(loaded);
        const allInvoices = await fetchAllInvoices();
        setLatestInvoiceByRentalId(mapLatestInvoicesByRental(allInvoices));
      } catch (error) {
        console.error('Failed to load rental requests:', error);
      } finally {
        setLoading(false);
      }
    };

    loadRentals();
  }, []);

  // Get rentals for column
  const getColumnRentals = (status: RentalStatus) => {
    return rentals
      .filter((r) => r.status === status)
      .sort((a, b) => {
        const aStart = Number(a.rentalStart || 0);
        const bStart = Number(b.rentalStart || 0);
        if (aStart !== bStart) return aStart - bStart; // upcoming first
        return Number(b.createdAt || 0) - Number(a.createdAt || 0); // newest first as tie-breaker
      });
  };

  // Get customer name
  const getCustomerName = (customerId: string) => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return 'Unbekannt';
    const full = `${(customer.firstName || '').trim()} ${(customer.lastName || '').trim()}`.trim();
    if (full) return full;
    if (customer.email?.trim()) return customer.email.trim();
    return 'Unbekannt';
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const activeId = event.activeId as string;
    setActiveId(activeId);

    // Screenreader-Announcement
    const rental = rentals.find((r) => r.id === activeId);
    if (rental) {
      announceToScreenreader(`Ziehen gestartet: ${rental.productType}`);
    }
  };

  // Handle drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;
    if (active.id === over.id) return;

    const activeRental = rentals.find((r) => r.id === active.id);
    if (!activeRental) return;

    // Extract target status from column ID
    const targetStatus = over.id as RentalStatus;
    if (!canTransitionStatus(activeRental.status, targetStatus)) {
      const errorMessage = `Der Schritt ist nicht möglich: erst den nächsten Workflow-Schritt von "${getRentalStatusLabel(activeRental.status)}" aus wählen.`;
      alert(errorMessage);
      announceToScreenreader(`Fehler: ${errorMessage}`, 'assertive');
      setActiveId(null);
      return;
    }

    // Validate transition
    try {
      await transitionStatus(activeRental.id, targetStatus);

      // Reload rentals
      const updated = await fetchAllRentalRequests();
      setRentals(updated);
      const allInvoices = await fetchAllInvoices();
      setLatestInvoiceByRentalId(mapLatestInvoicesByRental(allInvoices));

      // Screenreader-Announcement
      announceToScreenreader(
        `Vorgang ${activeRental.productType} erfolgreich nach ${getRentalStatusLabel(targetStatus)} verschoben`
      );
    } catch (error: any) {
      console.error('Transition failed:', error);

      // Show error to user
      const errorMessage = error.error || 'Status-Transition nicht erlaubt';
      alert(errorMessage);

      // Screenreader-Announcement
      announceToScreenreader(
        `Fehler: ${errorMessage}`,
        'assertive'
      );

      // Reset rentals (no change)
      return;
    }

    setActiveId(null);
  };

  // Handle keyboard navigation (Move left/right)
  const handleMoveCard = async (rentalId: string, direction: 'left' | 'right') => {
    const rental = rentals.find((r) => r.id === rentalId);
    if (!rental) return;

    const targetStatus = getAdjacentStatus(rental.status, direction);
    if (!targetStatus) return;
    if (!canTransitionStatus(rental.status, targetStatus)) {
      const errorMessage = `Der Schritt ist nicht möglich: erst den nächsten Workflow-Schritt von "${getRentalStatusLabel(rental.status)}" aus wählen.`;
      alert(errorMessage);
      announceToScreenreader(`Fehler: ${errorMessage}`, 'assertive');
      return;
    }

    try {
      await transitionStatus(rentalId, targetStatus);

      // Reload rentals
      const updated = await fetchAllRentalRequests();
      setRentals(updated);
      const allInvoices = await fetchAllInvoices();
      setLatestInvoiceByRentalId(mapLatestInvoicesByRental(allInvoices));

      // Screenreader-Announcement
      announceToScreenreader(
        `Vorgang ${rental.productType} erfolgreich nach ${getRentalStatusLabel(targetStatus)} verschoben`
      );
    } catch (error: any) {
      console.error('Transition failed:', error);

      // Show error to user
      const errorMessage = error.error || 'Status-Transition nicht erlaubt';
      alert(errorMessage);

      // Screenreader-Announcement
      announceToScreenreader(
        `Fehler: ${errorMessage}`,
        'assertive'
      );
    }
  };

  // Check if card can move left/right
  const canMoveCard = (status: RentalStatus, direction: 'left' | 'right'): boolean => {
    const targetStatus = getAdjacentStatus(status, direction);
    if (!targetStatus) return false;
    return canTransitionStatus(status, targetStatus);
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" aria-hidden="true"></div>
          <p className="text-gray-600">Lade Vorgänge...</p>
        </div>
      </div>
    );
  }

  // Count per column
  const getColumnCount = (status: RentalStatus) => {
    return rentals.filter((r) => r.status === status).length;
  };

  const sortedForList = [...rentals].sort((a, b) => {
    const aStart = Number(a.rentalStart || 0);
    const bStart = Number(b.rentalStart || 0);
    if (aStart !== bStart) return aStart - bStart;
    return Number(b.createdAt || 0) - Number(a.createdAt || 0);
  });

  const formatDate = (ts?: number) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleDateString('de-DE');
  };

  const getDuration = (start?: number, end?: number) => {
    if (!start || !end) return '-';
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    return `${Math.max(1, days)} Tag${days > 1 ? 'e' : ''}`;
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">Ansicht</div>
        <div className="inline-flex rounded-md border border-slate-200 overflow-hidden">
          <button
            type="button"
            className={['px-3 py-1.5 text-xs', viewMode === 'kanban' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'].join(' ')}
            onClick={() => setViewMode('kanban')}
          >
            Kanban
          </button>
          <button
            type="button"
            className={['px-3 py-1.5 text-xs border-l border-slate-200', viewMode === 'liste' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'].join(' ')}
            onClick={() => setViewMode('liste')}
          >
            Liste
          </button>
        </div>
      </div>

      {viewMode === 'liste' ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-auto h-full">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2">Start</th>
                <th className="text-left px-3 py-2">Kunde</th>
                <th className="text-left px-3 py-2">Produkt</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Dauer</th>
                <th className="text-left px-3 py-2">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {sortedForList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    Keine Vorgänge vorhanden.
                  </td>
                </tr>
              ) : (
                sortedForList.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">{formatDate(r.rentalStart)}</td>
                    <td className="px-3 py-2">{getCustomerName(r.customerId)}</td>
                    <td className="px-3 py-2">{r.productType}</td>
                    <td className="px-3 py-2">{getRentalStatusLabel(r.status)}</td>
                    <td className="px-3 py-2">{getDuration(r.rentalStart, r.rentalEnd)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="px-2 py-1 rounded border border-slate-200 text-xs hover:bg-slate-100"
                        onClick={() => onCardClick(r)}
                      >
                        Öffnen
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Live-Region für Screenreader-Announcements */}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
            id="kanban-announcements"
          />

          <div className="flex h-full bg-gray-100 overflow-x-auto" aria-label="Kanban Board mit 7 Spalten">
            {COLUMNS.map((column) => {
              const columnRentals = getColumnRentals(column.status);
              const count = getColumnCount(column.status);

              return (
                <div
                  key={column.status}
                  id={column.status}
                  className={`
                    flex-shrink-0 w-80 mr-4 rounded-lg border
                    flex flex-col max-h-full
                    ${column.shellClass}
                  `}
                  role="region"
                  aria-label={`${column.label} - ${count} Vorgänge`}
                  aria-describedby={`${column.status}-description`}
                >
                  {/* Column Header */}
                  <div className="p-4 border-b border-black/5">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className={`font-semibold ${column.headerClass}`} id={`${column.status}-title`}>
                        {column.label}
                      </h3>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold border ${column.countClass}`}
                        aria-label={`${count} Vorgänge in dieser Spalte`}
                      >
                        {count}
                      </span>
                    </div>
                    <p
                      className="text-xs text-slate-600"
                      id={`${column.status}-description`}
                    >
                      {column.description}
                    </p>
                  </div>

                  {/* Column Content */}
                  <div
                    className="flex-1 overflow-y-auto p-2 space-y-2"
                    role="list"
                    aria-label={`Vorgänge in ${column.label}`}
                  >
                    {columnRentals.map((rental) => (
                      <KanbanCard
                        key={rental.id}
                        rental={rental}
                        customerName={getCustomerName(rental.customerId)}
                        customerEmail={customers.find((c) => c.id === rental.customerId)?.email || ''}
                        latestInvoice={latestInvoiceByRentalId[rental.id]}
                        onEditLatestInvoice={onOpenInvoice}
                        onClick={() => onCardClick(rental)}
                        onMoveLeft={() => handleMoveCard(rental.id, 'left')}
                        onMoveRight={() => handleMoveCard(rental.id, 'right')}
                        canMoveLeft={canMoveCard(rental.status, 'left')}
                        canMoveRight={canMoveCard(rental.status, 'right')}
                      />
                    ))}

                    {columnRentals.length === 0 && (
                      <div className={`text-center py-8 text-sm ${column.emptyClass}`}>
                        Keine Vorgänge
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Drag Overlay */}
            <DragOverlay>
              {activeId ? (
                <div className="w-80 opacity-50">
                  <KanbanCard
                    rental={rentals.find((r) => r.id === activeId)!}
                    customerName={getCustomerName(rentals.find((r) => r.id === activeId)?.customerId || '')}
                    customerEmail={customers.find((c) => c.id === rentals.find((r) => r.id === activeId)?.customerId)?.email || ''}
                    latestInvoice={latestInvoiceByRentalId[activeId]}
                    onEditLatestInvoice={onOpenInvoice}
                    onClick={() => {}}
                    onMoveLeft={undefined}
                    onMoveRight={undefined}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </div>
        </DndContext>
      )}
    </div>
  );
};

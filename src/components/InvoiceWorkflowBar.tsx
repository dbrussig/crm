import { ArrowRight, CheckCircle2, Circle, Dot } from 'lucide-react';
import { InvoiceType } from '../types';

interface InvoiceWorkflowBarProps {
  currentType: InvoiceType;
  nextActionLabel?: string;
  onAdvance?: () => void;
  disabled?: boolean;
}

const STEPS: InvoiceType[] = ['Angebot', 'Auftrag', 'Rechnung'];

export default function InvoiceWorkflowBar({
  currentType,
  nextActionLabel,
  onAdvance,
  disabled = false,
}: InvoiceWorkflowBarProps) {
  const currentIndex = Math.max(0, STEPS.indexOf(currentType));
  const canAdvance = Boolean(onAdvance && nextActionLabel && currentIndex < STEPS.length - 1);

  return (
    <div className="rounded-md border border-indigo-100 bg-indigo-50 p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
        <ArrowRight size={14} aria-hidden="true" />
        Workflow
      </div>
      <div className="mb-3 flex items-center gap-2 text-sm">
        {STEPS.map((step, idx) => {
          const done = idx < currentIndex;
          const active = idx === currentIndex;
          return (
            <div key={step} className="flex items-center gap-2">
              <span className={done ? 'text-emerald-600' : active ? 'text-indigo-700' : 'text-slate-400'}>
                {done ? <CheckCircle2 size={16} aria-hidden="true" /> : active ? <Dot size={18} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
              </span>
              <span className={active ? 'font-semibold text-indigo-900' : done ? 'text-emerald-700' : 'text-slate-500'}>
                {step}
              </span>
              {idx < STEPS.length - 1 && <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
      {canAdvance ? (
        <button
          type="button"
          onClick={onAdvance}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          title={nextActionLabel}
        >
          <ArrowRight size={14} aria-hidden="true" />
          {nextActionLabel}
        </button>
      ) : (
        <div className="text-xs text-slate-600">Finaler Schritt erreicht.</div>
      )}
    </div>
  );
}

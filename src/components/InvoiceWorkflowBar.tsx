import { Check } from 'lucide-react';
import type { InvoiceType } from '../types';

interface InvoiceWorkflowBarProps {
  currentType: InvoiceType;
  nextActionLabel?: string;
  onAdvance?: () => void;
  disabled?: boolean;
}

const STEPS: { id: InvoiceType; label: string }[] = [
  { id: 'Angebot', label: 'Angebot' },
  { id: 'Auftrag', label: 'Auftrag' },
  { id: 'Rechnung', label: 'Rechnung' },
];

export default function InvoiceWorkflowBar({
  currentType,
  nextActionLabel,
  onAdvance,
  disabled = false,
}: InvoiceWorkflowBarProps) {
  const currentIndex = Math.max(0, STEPS.findIndex((s) => s.id === currentType));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between relative">
        {/* Hintergrundlinie */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200">
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${(currentIndex / (STEPS.length - 1)) * 100}%` }}
          />
        </div>

        {STEPS.map((step, index) => {
          const isActive = index === currentIndex;
          const isCompleted = index < currentIndex;

          return (
            <div key={step.id} className="flex flex-col items-center gap-2 relative z-10">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all text-sm font-medium ${
                  isCompleted
                    ? 'bg-indigo-500 text-white'
                    : isActive
                    ? 'bg-indigo-500 text-white ring-4 ring-indigo-100'
                    : 'bg-white border-2 border-gray-300 text-gray-400'
                }`}
              >
                {isCompleted ? <Check className="w-5 h-5" aria-hidden="true" /> : <span>{index + 1}</span>}
              </div>
              <span
                className={`text-xs font-medium ${
                  isActive ? 'text-indigo-600' : isCompleted ? 'text-gray-700' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

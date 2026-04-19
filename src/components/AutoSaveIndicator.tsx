import LoaderCircle from 'lucide-react/dist/esm/icons/loader-circle.js';
import { AutoSaveState } from '../hooks/useAutoSave';

interface AutoSaveIndicatorProps {
  state: AutoSaveState;
}

export default function AutoSaveIndicator({ state }: AutoSaveIndicatorProps) {
  if (state === 'idle') return null;

  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
        <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
        Speichert...
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
      <span aria-hidden="true">✓</span>
      Entwurf gespeichert
    </span>
  );
}

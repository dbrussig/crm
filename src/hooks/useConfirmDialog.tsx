import { useRef, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';

interface ConfirmModalOpts {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export function useConfirmDialog() {
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [modal, setModal] = useState<ConfirmModalOpts | null>(null);

  const requestConfirm = (opts: ConfirmModalOpts): Promise<boolean> => {
    setModal(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  };

  const handleConfirm = () => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setModal(null);
    resolve?.(true);
  };

  const handleCancel = () => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setModal(null);
    resolve?.(false);
  };

  const confirmDialog = modal ? (
    <ConfirmModal
      title={modal.title}
      message={modal.message}
      confirmLabel={modal.confirmLabel}
      cancelLabel={modal.cancelLabel}
      danger={modal.danger}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { requestConfirm, confirmDialog };
}

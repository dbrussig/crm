import { useEffect, useMemo, useRef, useState } from 'react';
import type { AccessoryCategory, RentalAccessory, RelingType } from '../types';
import { createAccessory, fetchAllAccessories, modifyAccessory, removeAccessory } from '../services/accessoryService';
import ConfirmModal from './ConfirmModal';

const CATEGORY_OPTIONS: AccessoryCategory[] = ['Bundle', 'Dachträger', 'Fußsatz', 'Querträger', 'Kit', 'Sonstiges'];
const RELING_OPTIONS: RelingType[] = ['offen', 'geschlossen', 'keine'];

function normalizeKey(v: string): string {
  return String(v || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function formatDate(ts?: number): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('de-DE');
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error || new Error('Datei konnte nicht gelesen werden.'));
    fr.readAsDataURL(file);
  });
}

async function resizeImageDataUrl(
  dataUrl: string,
  opts: { maxDim: number; mime: 'image/jpeg' | 'image/png'; quality: number }
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
    el.src = dataUrl;
  });
  const ratio = Math.min(1, opts.maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * ratio));
  const h = Math.max(1, Math.round(img.height * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar.');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL(opts.mime, opts.quality);
}

type AccessoryForm = {
  name: string;
  category: AccessoryCategory;
  inventoryKey: string;
  brand: string;
  model: string;
  lengthCm: string;
  notes: string;
  photoDataUrl: string;
  compatibleRelingTypes: RelingType[];
  minVehicleWidthCm: string;
  maxVehicleWidthCm: string;
  isActive: boolean;
};

const INITIAL_FORM: AccessoryForm = {
  name: '',
  category: 'Bundle',
  inventoryKey: '',
  brand: '',
  model: '',
  lengthCm: '',
  notes: '',
  photoDataUrl: '',
  compatibleRelingTypes: [],
  minVehicleWidthCm: '',
  maxVehicleWidthCm: '',
  isActive: true,
};

export default function Zubehoer() {
  const [items, setItems] = useState<RentalAccessory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
  const [category, setCategory] = useState<'alle' | AccessoryCategory>('alle');
  const [activeOnly, setActiveOnly] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RentalAccessory | null>(null);
  const [form, setForm] = useState<AccessoryForm>(INITIAL_FORM);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((it) => (category === 'alle' ? true : it.category === category))
      .filter((it) => (activeOnly ? it.isActive : true))
      .filter((it) => {
        if (!q) return true;
        const hay = `${it.name} ${it.category} ${it.inventoryKey} ${it.brand || ''} ${it.model || ''} ${it.notes || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [items, category, activeOnly, search]);

  async function load() {
    setLoading(true);
    try {
      const allItems = await fetchAllAccessories();
      setItems(allItems);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(INITIAL_FORM);
    setPhotoError(null);
    setModalOpen(true);
  }

  function openEdit(it: RentalAccessory) {
    setEditing(it);
    setForm({
      name: it.name || '',
      category: it.category || 'Bundle',
      inventoryKey: it.inventoryKey || '',
      brand: it.brand || '',
      model: it.model || '',
      lengthCm: it.lengthCm ? String(it.lengthCm) : '',
      notes: it.notes || '',
      photoDataUrl: it.photoDataUrl || '',
      compatibleRelingTypes: [...(it.compatibleRelingTypes || [])],
      minVehicleWidthCm: it.minVehicleWidthCm ? String(it.minVehicleWidthCm) : '',
      maxVehicleWidthCm: it.maxVehicleWidthCm ? String(it.maxVehicleWidthCm) : '',
      isActive: Boolean(it.isActive),
    });
    setPhotoError(null);
    setModalOpen(true);
  }

  async function handleItemPhotoChange(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      setPhotoError('Bitte eine Bilddatei auswählen.');
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const raw = await readAsDataUrl(file);
      const normalized = await resizeImageDataUrl(raw, {
        maxDim: 1600,
        mime: 'image/jpeg',
        quality: 0.85,
      });
      setForm((p) => ({ ...p, photoDataUrl: normalized }));
    } catch (e: any) {
      setPhotoError(e?.message || 'Bild konnte nicht verarbeitet werden.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function toggleReling(reling: RelingType) {
    setForm((prev) => {
      const isSelected = prev.compatibleRelingTypes.includes(reling);
      return { ...prev, compatibleRelingTypes: isSelected ? [] : [reling] };
    });
  }

  async function save() {
    const now = Date.now();
    const name = form.name.trim();
    const isEdit = Boolean(editing);
    const inventoryKey = normalizeKey(form.inventoryKey || (isEdit ? '' : form.name));
    if (!name) {
      showError('Bitte einen Namen eintragen.');
      return;
    }
    const payload: Record<string, unknown> = {
      name,
      category: form.category,
      inventoryKey,
      brand: form.brand.trim() || (isEdit ? null : undefined),
      model: form.model.trim() || (isEdit ? null : undefined),
      lengthCm: form.lengthCm ? Number(form.lengthCm) : (isEdit ? null : undefined),
      notes: form.notes.trim() || (isEdit ? null : undefined),
      photoDataUrl: form.photoDataUrl || (isEdit ? null : undefined),
      compatibleRelingTypes: form.compatibleRelingTypes.length ? form.compatibleRelingTypes : (isEdit ? null : undefined),
      minVehicleWidthCm: form.minVehicleWidthCm ? Number(form.minVehicleWidthCm) : (isEdit ? null : undefined),
      maxVehicleWidthCm: form.maxVehicleWidthCm ? Number(form.maxVehicleWidthCm) : (isEdit ? null : undefined),
      isActive: form.isActive,
    };

    try {
      if (editing) {
        await modifyAccessory(editing.id, payload);
      } else {
        await createAccessory({
          id: `acc_${now}`,
          ...payload,
          name,
          category: form.category,
          inventoryKey,
          isActive: form.isActive,
          createdAt: now,
          updatedAt: now,
        });
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      showError(e?.message || 'Speichern fehlgeschlagen.');
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Zubehör wird geladen...
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {notice && (
        <div
          className={[
            'rounded-xl border px-4 py-3 text-sm whitespace-pre-line',
            notice.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-slate-200 bg-white text-slate-800',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-3">
            <div>{notice.text}</div>
            <button
              className="text-slate-600 hover:text-slate-900"
              onClick={() => setNotice(null)}
              aria-label="Hinweis schließen"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Zubehör</h2>
        </div>
        <button
          type="button"
          className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
          onClick={openCreate}
        >
          + Zubehör anlegen
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="md:col-span-2 w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
            placeholder="Suchen (Name, Schlüssel, Marke, Modell)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as 'alle' | AccessoryCategory)}
            aria-label="Kategorie filtern"
            title="Kategorie filtern"
          >
            <option value="alle">Alle Kategorien</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            nur aktiv
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Keine Zubehör-Einträge gefunden.</div>
        )}

        {filtered.map((item) => {
          return (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="grid grid-cols-1 lg:grid-cols-[120px_1fr] gap-4">
                <div>
                  {item.photoDataUrl ? (
                    <img
                      src={item.photoDataUrl}
                      alt={item.name}
                      className="w-[120px] h-[90px] object-cover rounded-md border border-slate-200"
                    />
                  ) : (
                    <div className="w-[120px] h-[90px] rounded-md border border-dashed border-slate-300 text-xs text-slate-400 grid place-items-center">
                      kein Foto
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold text-slate-900">{item.name}</div>
                      <div className="text-xs text-slate-500">
                        {item.category} · Schlüssel: <span className="font-mono">{item.inventoryKey}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.brand || '-'} {item.model || ''} {item.lengthCm ? `· ${item.lengthCm} cm` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={[
                          'px-2 py-1 rounded-full text-xs',
                          item.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
                        ].join(' ')}
                      >
                        {item.isActive ? 'aktiv' : 'inaktiv'}
                      </span>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
                        onClick={() => openEdit(item)}
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-md border border-red-200 text-red-700 text-sm hover:bg-red-50"
                        onClick={async () => {
                          const ok = await requestConfirm({
                            title: 'Löschen bestätigen',
                            message: `Zubehör "${item.name}" wirklich löschen?`,
                            confirmLabel: 'Löschen',
                            cancelLabel: 'Abbrechen',
                            danger: true,
                          });
                          if (!ok) return;
                          await removeAccessory(item.id);
                          await load();
                        }}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>

                  <div className="text-sm text-slate-700">{item.notes || 'Keine Notizen'}</div>

                  <div className="rounded-md border border-slate-200 p-3">
                    <div className="text-xs font-semibold text-slate-700 mb-2">Kompatibilität</div>
                    <div className="text-xs text-slate-600">
                      Reling: {(item.compatibleRelingTypes || []).length ? item.compatibleRelingTypes?.join(', ') : 'nicht gesetzt'}
                    </div>
                    <div className="text-xs text-slate-600">
                      Fahrzeugbreite: {item.minVehicleWidthCm || '-'} bis {item.maxVehicleWidthCm || '-'} cm
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{editing ? 'Zubehör bearbeiten' : 'Zubehör anlegen'}</h3>
              <button type="button" className="text-slate-400 hover:text-slate-600" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
              <select
                className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as AccessoryCategory }))}
                aria-label="Kategorie wählen"
                title="Kategorie wählen"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                placeholder="Inventar-/Bundle-Schlüssel (z.B. THULE-OPEN-710410+712300)"
                value={form.inventoryKey}
                onChange={(e) => setForm((p) => ({ ...p, inventoryKey: e.target.value }))}
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
                aktiv
              </label>
              <input
                type="number"
                className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                placeholder="Länge (cm)"
                value={form.lengthCm}
                onChange={(e) => setForm((p) => ({ ...p, lengthCm: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                  placeholder="Breite min (cm)"
                  value={form.minVehicleWidthCm}
                  onChange={(e) => setForm((p) => ({ ...p, minVehicleWidthCm: e.target.value }))}
                />
                <input
                  type="number"
                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                  placeholder="Breite max (cm)"
                  value={form.maxVehicleWidthCm}
                  onChange={(e) => setForm((p) => ({ ...p, maxVehicleWidthCm: e.target.value }))}
                />
              </div>

              <div className="md:col-span-2">
                <textarea
                  className="w-full min-h-[90px] px-3 py-2 rounded-md border border-slate-200 text-sm"
                  placeholder="Notizen"
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </div>

              <div className="md:col-span-2 rounded-md border border-slate-200 p-3">
                <div className="text-sm font-medium text-slate-800 mb-2">Relingtyp</div>
                <div className="flex flex-wrap gap-2">
                  {RELING_OPTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={[
                        'px-3 py-1.5 rounded-md border text-xs',
                        form.compatibleRelingTypes.includes(r)
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
                      ].join(' ')}
                      onClick={() => toggleReling(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2 rounded-md border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-800">Foto</div>
                  {photoBusy && <span className="text-xs text-slate-500">wird verarbeitet...</span>}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <span className="px-3 py-1.5 rounded-md border border-slate-200 text-sm bg-white hover:bg-slate-50 text-slate-700">
                      {photoBusy ? 'Wird geladen…' : 'Foto auswählen'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => { void handleItemPhotoChange(e.target.files); e.currentTarget.value = ''; }}
                      disabled={photoBusy}
                    />
                  </label>
                  {form.photoDataUrl && (
                    <button
                      type="button"
                      className="px-2 py-1 rounded-md border border-slate-200 text-xs hover:bg-slate-50"
                      onClick={() => setForm((p) => ({ ...p, photoDataUrl: '' }))}
                    >
                      Foto entfernen
                    </button>
                  )}
                </div>
                {photoError && <div className="mt-2 text-xs text-red-700">{photoError}</div>}
                {form.photoDataUrl && (
                  <img src={form.photoDataUrl} alt="Vorschau" className="mt-3 w-44 h-28 object-cover rounded-md border border-slate-200" />
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" className="px-3 py-2 rounded-md border border-slate-200 text-sm" onClick={() => setModalOpen(false)}>
                Abbrechen
              </button>
              <button type="button" className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm" onClick={() => void save()}>
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

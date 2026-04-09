/**
 * Vermietungsgegenstände
 *
 * Ziel: Übersichtlichere Verwaltung der Miet-Items (ohne WebSync/Calendar-Load).
 * Fokus: Was habe ich an Dachboxen, Fahrradträgern, Heckboxen, Hüpfburgen?
 *
 * Hinweis: Kalender-Ansicht ist als eigener Menüpunkt "Kalender" vorhanden.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProductType, Resource } from '../types';
import { fetchAllResources, createResource, modifyResource, removeResource } from '../services/resourceService';
import ConfirmModal from './ConfirmModal';

type CategoryId = 'alle' | 'dachboxen' | 'fahrradtraeger' | 'heckboxen' | 'huepfburgen';

const CATEGORIES: Array<{ id: CategoryId; label: string; icon: string; types: ProductType[] }> = [
  { id: 'alle', label: 'Alle', icon: '📋', types: ['Dachbox XL', 'Dachbox L', 'Dachbox M', 'Fahrradträger', 'Heckbox', 'Hüpfburg'] },
  { id: 'dachboxen', label: 'Dachboxen', icon: '📦', types: ['Dachbox XL', 'Dachbox L', 'Dachbox M'] },
  { id: 'fahrradtraeger', label: 'Fahrradträger', icon: '🚴', types: ['Fahrradträger'] },
  { id: 'heckboxen', label: 'Heckboxen', icon: '🚗', types: ['Heckbox'] },
  { id: 'huepfburgen', label: 'Hüpfburgen', icon: '🏰', types: ['Hüpfburg'] },
];

function euro(n: number | undefined) {
  const v = Number(n || 0);
  if (!Number.isFinite(v) || v <= 0) return '-';
  return `${v.toFixed(2)} €`;
}

function defaultDepositForType(type: ProductType): number {
  if (type === 'Heckbox' || type === 'Dachbox XL' || type === 'Dachbox L' || type === 'Dachbox M') return 150;
  return 0;
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
  if (!ctx) throw new Error('Canvas nicht verfuegbar.');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL(opts.mime, opts.quality);
}

export default function Stammdaten() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<CategoryId>('alle');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    name: string;
    type: ProductType;
    dailyRate: number;
    deposit: number;
    isActive: boolean;
    googleCalendarId: string;
    itemPhotoDataUrl: string;
  }>({
    name: '',
    type: 'Dachbox XL',
    dailyRate: 0,
    deposit: 150,
    isActive: true,
    googleCalendarId: '',
    itemPhotoDataUrl: '',
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAllResources();
      setResources(res);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const byType = new Map<ProductType, number>();
    for (const t of CATEGORIES[0].types) byType.set(t, 0);
    for (const r of resources) {
      if (!r.isActive) continue;
      byType.set(r.type, (byType.get(r.type) || 0) + 1);
    }
    const byCategory = new Map<CategoryId, number>();
    for (const c of CATEGORIES) {
      byCategory.set(
        c.id,
        c.types.reduce((sum, t) => sum + (byType.get(t) || 0), 0)
      );
    }
    return { byType, byCategory };
  }, [resources]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cat = CATEGORIES.find((c) => c.id === category) || CATEGORIES[0];
    return resources
      .filter((r) => cat.types.includes(r.type))
      .filter((r) => {
        if (!q) return true;
        const hay = `${r.name || ''} ${r.type} ${r.googleCalendarId || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        // Active first, then by type/name
        const aa = a.isActive ? 1 : 0;
        const bb = b.isActive ? 1 : 0;
        if (aa !== bb) return bb - aa;
        const at = a.type.localeCompare(b.type);
        if (at !== 0) return at;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [resources, category, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, Resource[]> = {};
    for (const r of filtered) {
      const key = r.type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [filtered]);

  function openCreate() {
    setEditing(null);
    setForm({
      name: '',
      type: 'Dachbox XL',
      dailyRate: 0,
      deposit: 150,
      isActive: true,
      googleCalendarId: '',
      itemPhotoDataUrl: '',
    });
    setPhotoError(null);
    setModalOpen(true);
  }

  function openEdit(r: Resource) {
    setEditing(r);
    setForm({
      name: r.name || '',
      type: r.type,
      dailyRate: Number(r.dailyRate || 0),
      deposit: Number(r.deposit ?? defaultDepositForType(r.type)),
      isActive: Boolean(r.isActive),
      googleCalendarId: r.googleCalendarId || '',
      itemPhotoDataUrl: r.itemPhotoDataUrl || '',
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
      setForm((p) => ({ ...p, itemPhotoDataUrl: normalized }));
    } catch (e: any) {
      setPhotoError(e?.message || 'Bild konnte nicht verarbeitet werden.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    if (!form.name.trim()) {
      showError('Bitte einen Namen eingeben.');
      return;
    }
    try {
      if (editing) {
        await modifyResource(editing.id, {
          name: form.name.trim(),
          type: form.type,
          dailyRate: Number(form.dailyRate || 0),
          deposit: Number(form.deposit || 0),
          isActive: Boolean(form.isActive),
          googleCalendarId: form.googleCalendarId.trim(),
          itemPhotoDataUrl: form.itemPhotoDataUrl,
        });
      } else {
        const now = Date.now();
        const r: Resource = {
          id: `resource_${now}`,
          name: form.name.trim(),
          type: form.type,
          itemPhotoDataUrl: form.itemPhotoDataUrl,
          googleCalendarId: form.googleCalendarId.trim(),
          isActive: Boolean(form.isActive),
          createdAt: now,
          dailyRate: Number(form.dailyRate || 0),
          deposit: Number(form.deposit || 0),
        };
        await createResource(r);
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      showError(e?.message || String(e));
    }
  }

  async function toggleActive(r: Resource) {
    try {
      await modifyResource(r.id, { isActive: !r.isActive });
      setResources((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: !r.isActive } : x)));
    } catch (e: any) {
      showError(e?.message || String(e));
    }
  }

  async function deleteItem(r: Resource) {
    const ok = await requestConfirm({
      title: 'Löschen bestätigen',
      message: `Vermietungsgegenstand wirklich entfernen?\n\n${r.name}`,
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen',
      danger: true,
    });
    if (!ok) return;
    try {
      await removeResource(r.id);
      await load();
    } catch (e: any) {
      showError(e?.message || String(e));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-sm text-slate-600">Lade Vermietungsgegenstände…</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
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
            'mb-4 rounded-xl border px-4 py-3 text-sm whitespace-pre-line',
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Artikel</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
            onClick={() => load()}
            title="Neu laden"
          >
            Aktualisieren
          </button>
          <button
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
            onClick={openCreate}
          >
            + Neu
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="mt-4 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={[
                'px-3 py-2 rounded-full border text-sm transition',
                category === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50',
              ].join(' ')}
              onClick={() => setCategory(c.id)}
            >
              <span className="mr-2" aria-hidden="true">{c.icon}</span>
              {c.label}
              <span className={['ml-2 text-xs px-2 py-0.5 rounded-full', category === c.id ? 'bg-white/20' : 'bg-slate-100 text-slate-600'].join(' ')}>
                {counts.byCategory.get(c.id) || 0}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            className="flex-1 px-3 py-2 rounded-md border border-slate-200 text-sm"
            placeholder="Suchen (Name, Typ, Kalender-Referenz)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Vermietungsgegenstände suchen"
          />
          <button
            className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
            onClick={() => setSearch('')}
            disabled={!search}
          >
            Reset
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600 space-y-2">
          <div>Keine Vermietungsgegenstände gefunden.</div>
          <div className="text-xs">Lege den ersten Gegenstand an oder passe den Suchfilter an.</div>
          <div>
            <button
              type="button"
              onClick={openCreate}
              className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
            >
              + Gegenstand anlegen
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800">
                  {type}
                  <span className="ml-2 text-xs text-slate-500">({items.length})</span>
                </div>
                <div className="text-xs text-slate-500">
                  Aktiv: {items.filter((x) => x.isActive).length}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((r) => (
                  <div key={r.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      {r.itemPhotoDataUrl ? (
                        <img
                          src={r.itemPhotoDataUrl}
                          alt={`Foto ${r.name}`}
                          className="w-14 h-14 rounded-lg object-cover border border-slate-200 bg-slate-100"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg border border-amber-300 bg-amber-50 text-[11px] text-amber-800 flex items-center justify-center text-center px-1">
                          Kein Foto
                        </div>
                      )}
                      <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-slate-900 truncate">{r.name}</div>
                        {!r.isActive && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">
                            inaktiv
                          </span>
                        )}
                        {r.googleCalendarId?.trim() ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600" title="Kalender-Referenz gesetzt">
                            📅
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-3">
                        <span><span className="text-slate-500">Preis:</span> {euro(r.dailyRate)}</span>
                        <span><span className="text-slate-500">Kaution:</span> {euro(r.deposit)}</span>
                      </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
                        onClick={() => toggleActive(r)}
                        title={r.isActive ? 'Deaktivieren' : 'Aktivieren'}
                      >
                        {r.isActive ? 'Deaktivieren' : 'Aktivieren'}
                      </button>
                      <button
                        className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
                        onClick={() => openEdit(r)}
                        title="Bearbeiten"
                      >
                        Bearbeiten
                      </button>
                      <button
                        className="px-3 py-2 rounded-md border border-red-200 text-sm text-red-700 hover:bg-red-50"
                        onClick={() => deleteItem(r)}
                        title="Entfernen"
                      >
                        Entfernen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500">Artikel</div>
                <div className="text-lg font-semibold text-slate-900">{editing ? 'Bearbeiten' : 'Neu anlegen'}</div>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <label className="text-sm block">
                <div className="text-xs font-medium text-slate-700 mb-1">Name *</div>
                <input
                  className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="z.B. Dachbox XL #2"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm block">
                  <div className="text-xs font-medium text-slate-700 mb-1">Typ</div>
                  <select
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
                    value={form.type}
                    onChange={(e) => {
                      const next = e.target.value as ProductType;
                      setForm((p) => ({
                        ...p,
                        type: next,
                        deposit: p.deposit || defaultDepositForType(next),
                      }));
                    }}
                  >
                    <option value="Dachbox XL">Dachbox XL</option>
                    <option value="Dachbox L">Dachbox L</option>
                    <option value="Dachbox M">Dachbox M</option>
                    <option value="Fahrradträger">Fahrradträger</option>
                    <option value="Heckbox">Heckbox</option>
                    <option value="Hüpfburg">Hüpfburg</option>
                  </select>
                </label>

                <label className="text-sm block">
                  <div className="text-xs font-medium text-slate-700 mb-1">Aktiv</div>
                  <select
                    className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
                    value={form.isActive ? 'ja' : 'nein'}
                    onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.value === 'ja' }))}
                  >
                    <option value="ja">Ja</option>
                    <option value="nein">Nein</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm block">
                  <div className="text-xs font-medium text-slate-700 mb-1">Tagespreis (EUR)</div>
                  <input
                    className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                    type="number"
                    step="0.01"
                    value={form.dailyRate || ''}
                    onChange={(e) => setForm((p) => ({ ...p, dailyRate: Number(e.target.value || 0) }))}
                  />
                </label>
                <label className="text-sm block">
                  <div className="text-xs font-medium text-slate-700 mb-1">Kaution (EUR)</div>
                  <input
                    className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm"
                    type="number"
                    step="0.01"
                    value={form.deposit || ''}
                    onChange={(e) => setForm((p) => ({ ...p, deposit: Number(e.target.value || 0) }))}
                    placeholder={String(defaultDepositForType(form.type))}
                  />
                </label>
              </div>

              <div className="text-sm block">
                <div className="text-xs font-medium text-slate-700 mb-1">Foto</div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <span className="px-3 py-2 rounded-md border border-slate-200 text-sm bg-white hover:bg-slate-50 text-slate-700">
                    {photoBusy ? 'Wird geladen…' : 'Foto auswählen'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      void handleItemPhotoChange(e.target.files);
                      e.currentTarget.value = '';
                    }}
                    disabled={photoBusy}
                  />
                </label>
                <div className="mt-1 text-xs text-slate-500">
                  Dieses Foto wird zur klaren Unterscheidung des Vermietungsgegenstands genutzt.
                </div>
                {photoError && <div className="mt-2 text-xs text-red-600">{photoError}</div>}
                {form.itemPhotoDataUrl && (
                  <div className="mt-2">
                    <img
                      src={form.itemPhotoDataUrl}
                      alt="Vorschau Vermietungsgegenstand"
                      className="w-28 h-28 rounded-lg object-cover border border-slate-200 bg-slate-100"
                    />
                    <button
                      type="button"
                      className="mt-2 px-3 py-1.5 rounded-md border border-slate-200 text-xs hover:bg-slate-50"
                      onClick={() => setForm((p) => ({ ...p, itemPhotoDataUrl: '' }))}
                    >
                      Foto entfernen
                    </button>
                  </div>
                )}
              </div>

              <details className="rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm text-slate-700 select-none">Erweitert</summary>
                <div className="mt-3">
                  <label className="text-sm block">
                    <div className="text-xs font-medium text-slate-700 mb-1">Kalender-Referenz (optional)</div>
                    <input
                      className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm font-mono"
                      value={form.googleCalendarId}
                      onChange={(e) => setForm((p) => ({ ...p, googleCalendarId: e.target.value }))}
                      placeholder="z.B. primary"
                    />
                    <div className="mt-1 text-xs text-slate-500">
                      Wird für Verfügbarkeitsprüfung genutzt. Kalenderliste siehst du im Menüpunkt „Kalender“.
                    </div>
                  </label>
                </div>
              </details>
            </div>

            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                className="px-4 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
                onClick={() => setModalOpen(false)}
              >
                Abbrechen
              </button>
              <button
                className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
                onClick={() => save()}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

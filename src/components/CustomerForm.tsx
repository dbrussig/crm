import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Customer } from '../types';
import { formatDisplayRef } from '../utils/displayId';
import { useAutoSave } from '../hooks/useAutoSave';
import AutoSaveIndicator from './AutoSaveIndicator';

interface CustomerFormProps {
  customer?: Customer;
  allCustomers?: Customer[];
  onSubmit: (customer: Customer) => void;
  onCancel: () => void;
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  // Avoid call stack issues for very large files.
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  return `data:${file.type};base64,${base64}`;
}

async function resizeImageDataUrl(
  dataUrl: string,
  opts: { maxDim: number; mime: 'image/jpeg' | 'image/png'; quality: number }
): Promise<string> {
  const img = new Image();
  img.decoding = 'async';
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
  });

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return dataUrl;

  const scale = Math.min(1, opts.maxDim / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, tw, th);

  return canvas.toDataURL(opts.mime, opts.quality);
}

const CustomerForm: React.FC<CustomerFormProps> = ({ customer, allCustomers = [], onSubmit, onCancel }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState<Partial<Customer>>(
    customer || {
      salutation: undefined,
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      address: {
        street: '',
        city: '',
        zipCode: '',
        country: 'Deutschland',
      },
      contactDate: Date.now(),
      notes: '',
      roofRailPhotoDataUrl: undefined,
      roofRailPhotoDataUrls: undefined,
      assignedVehicleMake: '',
      assignedVehicleModel: '',
      assignedHsn: '',
      assignedTsn: '',
      assignedRelingType: 'unklar',
      assignedRoofRackInventoryKey: '',
      roofRackDecisionNote: '',
    }
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const baselineRef = useRef('');
  const draftStorageKey = useMemo(() => `customer-form-draft:${customer?.id || 'new'}`, [customer?.id]);
  const isDirty = useMemo(() => JSON.stringify(formData) !== baselineRef.current, [formData]);

  useEffect(() => {
    if (customer) return;
    try {
      const raw = sessionStorage.getItem(draftStorageKey);
      if (!raw) {
        baselineRef.current = JSON.stringify(formData);
        return;
      }
      const parsed = JSON.parse(raw);
      setFormData((prev) => ({ ...prev, ...parsed }));
      baselineRef.current = JSON.stringify({ ...formData, ...parsed });
    } catch {
      baselineRef.current = JSON.stringify(formData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id, draftStorageKey]);

  useEffect(() => {
    if (!customer) return;
    baselineRef.current = JSON.stringify(formData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  const { saveState: draftSaveState } = useAutoSave({
    data: formData,
    onSave: async (data) => {
      sessionStorage.setItem(draftStorageKey, JSON.stringify(data));
    },
    isDirty,
    condition: true,
    delay: 1200,
  });

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName?.trim()) {
      newErrors.firstName = 'Vorname ist Pflichtfeld';
    }
    if (!formData.lastName?.trim()) {
      newErrors.lastName = 'Nachname ist Pflichtfeld';
    } else if (formData.firstName && formData.lastName) {
      // Check for duplicate names when creating new customer
      const trimmedFirst = formData.firstName.trim().toLowerCase();
      const trimmedLast = formData.lastName.trim().toLowerCase();
      const duplicate = allCustomers.find(
        c => c.firstName.toLowerCase() === trimmedFirst && c.lastName.toLowerCase() === trimmedLast && c.id !== customer?.id
      );
      if (duplicate) {
        newErrors.lastName = `Ein Kunde mit diesem Namen existiert bereits (Ref: ${formatDisplayRef(duplicate.id, 'KND')})`;
      }
    }

    if (!formData.email?.trim()) {
      newErrors.email = 'E-Mail ist Pflichtfeld';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Ungültiges E-Mail-Format';
    }
    if (!formData.phone?.trim()) {
      newErrors.phone = 'Telefonnummer ist Pflichtfeld';
    } else if (!/^[\d\s+\-()\/]+$/.test(formData.phone)) {
      newErrors.phone = 'Ungültiges Telefonformat';
    }
    if (!formData.address?.street?.trim()) newErrors['address.street'] = 'Straße ist Pflichtfeld';
    if (!formData.address?.city?.trim()) newErrors['address.city'] = 'Ort ist Pflichtfeld';
    if (!formData.address?.zipCode?.trim()) {
      newErrors['address.zipCode'] = 'PLZ ist Pflichtfeld';
    } else if (!/^\d{4,5}$/.test(formData.address.zipCode)) {
      newErrors['address.zipCode'] = 'Ungültiges PLZ-Format (4-5 Ziffern)';
    }
    if (!formData.contactDate) newErrors.contactDate = 'Kontaktdatum ist Pflichtfeld';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const now = Date.now();
    const customerData: Customer = {
      id: customer?.id || now.toString(),
      salutation: formData.salutation,
      firstName: formData.firstName!.trim(),
      lastName: formData.lastName!.trim(),
      email: formData.email!.trim(),
      phone: formData.phone!.trim(),
      address: {
        street: formData.address!.street!.trim(),
        city: formData.address!.city!.trim(),
        zipCode: formData.address!.zipCode!.trim(),
        country: formData.address!.country || 'Deutschland',
      },
      contactDate: formData.contactDate!,
      createdAt: customer?.createdAt || now,
      updatedAt: now,
      notes: formData.notes?.trim() || undefined,
      roofRailPhotoDataUrls: Array.isArray(formData.roofRailPhotoDataUrls)
        ? formData.roofRailPhotoDataUrls.filter(Boolean)
        : (formData.roofRailPhotoDataUrl ? [formData.roofRailPhotoDataUrl] : undefined),
      roofRailPhotoDataUrl:
        (Array.isArray(formData.roofRailPhotoDataUrls) && formData.roofRailPhotoDataUrls.filter(Boolean)[0]) ||
        formData.roofRailPhotoDataUrl ||
        undefined,
      assignedVehicleMake: String(formData.assignedVehicleMake || '').trim() || undefined,
      assignedVehicleModel: String(formData.assignedVehicleModel || '').trim() || undefined,
      assignedHsn: String(formData.assignedHsn || '').trim() || undefined,
      assignedTsn: String(formData.assignedTsn || '').trim() || undefined,
      assignedRelingType: (formData.assignedRelingType as any) || undefined,
      assignedRoofRackInventoryKey: String(formData.assignedRoofRackInventoryKey || '').trim() || undefined,
      roofRackDecisionNote: String(formData.roofRackDecisionNote || '').trim() || undefined,
      roofRackDecisionUpdatedAt:
        String(formData.assignedRoofRackInventoryKey || '').trim() ||
        String(formData.assignedRelingType || '').trim() ||
        String(formData.assignedHsn || '').trim() ||
        String(formData.assignedTsn || '').trim()
          ? now
          : undefined,
    };

    sessionStorage.removeItem(draftStorageKey);
    onSubmit(customerData);
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleAddressChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      address: { ...prev!.address!, [field]: value }
    }));
    // Clear error for this field
    const errorKey = `address.${field}`;
    if (errors[errorKey]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[errorKey];
        return newErrors;
      });
    }
  };

  const ensurePhotoArray = (prev: Partial<Customer>): string[] => {
    const urls = Array.isArray(prev.roofRailPhotoDataUrls) ? prev.roofRailPhotoDataUrls.filter(Boolean) : [];
    if (urls.length) return urls;
    return prev.roofRailPhotoDataUrl ? [prev.roofRailPhotoDataUrl] : [];
  };

  const handlePhotoSelected = async (files?: FileList | null) => {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      const list = files ? Array.from(files) : [];
      if (!list.length) return;

      const normalizedUrls: string[] = [];
      for (const file of list) {
        if (!file.type?.startsWith('image/')) continue;
        const raw = await fileToDataUrl(file);
        // Normalize: keep it reasonably sized for IndexedDB JSON storage.
        const normalized = await resizeImageDataUrl(raw, { maxDim: 1600, mime: 'image/jpeg', quality: 0.85 });
        normalizedUrls.push(normalized);
      }

      if (!normalizedUrls.length) {
        setPhotoError('Bitte mindestens eine Bilddatei waehlen (JPG/PNG/HEIC etc.).');
        return;
      }

      setFormData((prev) => {
        const cur = ensurePhotoArray(prev);
        const next = [...cur, ...normalizedUrls].slice(0, 12); // avoid unbounded growth
        return {
          ...prev,
          roofRailPhotoDataUrls: next.length ? next : undefined,
          roofRailPhotoDataUrl: next[0] || undefined,
        };
      });
    } catch (e: any) {
      setPhotoError(e?.message || 'Foto konnte nicht verarbeitet werden.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const fieldCls = 'h-9 w-full px-3 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const fieldErrCls = 'h-9 w-full px-3 border border-red-300 bg-red-50 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400';
  const labelCls = 'block text-xs font-medium text-slate-500 mb-1';
  const labelPrimaryCls = 'block text-xs font-medium text-slate-700 mb-1';

  const photos = Array.isArray(formData.roofRailPhotoDataUrls)
    ? formData.roofRailPhotoDataUrls.filter(Boolean)
    : (formData.roofRailPhotoDataUrl ? [formData.roofRailPhotoDataUrl] : []);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <div className="p-5 space-y-4 overflow-y-auto">

        {/* 1. Kontaktdaten */}
        <section>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Kontakt</p>
          {/* Zeile 1: Anrede / Vorname / Nachname */}
          <div className="grid grid-cols-12 gap-2 mb-2">
            <div className="col-span-2">
              <label className={labelCls}>Anrede</label>
              <select
                value={formData.salutation || ''}
                onChange={(e) => handleChange('salutation', e.target.value || undefined)}
                className={fieldCls}
              >
                <option value="">–</option>
                <option value="Herr">Herr</option>
                <option value="Frau">Frau</option>
                <option value="Divers">Divers</option>
              </select>
            </div>
            <div className="col-span-5">
              <label className={labelPrimaryCls}>Vorname <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => handleChange('firstName', e.target.value)}
                className={errors.firstName ? fieldErrCls : fieldCls}
                placeholder="Max"
                autoFocus
              />
              {errors.firstName && <p className="mt-0.5 text-xs text-red-600">{errors.firstName}</p>}
            </div>
            <div className="col-span-5">
              <label className={labelPrimaryCls}>Nachname <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => handleChange('lastName', e.target.value)}
                className={errors.lastName ? fieldErrCls : fieldCls}
                placeholder="Mustermann"
              />
              {errors.lastName && <p className="mt-0.5 text-xs text-red-600">{errors.lastName}</p>}
            </div>
          </div>
          {/* Zeile 2: Telefon / E-Mail */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelPrimaryCls}>Telefon <span className="text-red-500">*</span></label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className={errors.phone ? fieldErrCls : fieldCls}
                placeholder="+49 123 4567890"
              />
              {errors.phone && <p className="mt-0.5 text-xs text-red-600">{errors.phone}</p>}
            </div>
            <div>
              <label className={labelCls}>E-Mail <span className="text-red-500">*</span></label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className={errors.email ? fieldErrCls : fieldCls}
                placeholder="beispiel@email.de"
              />
              {errors.email && <p className="mt-0.5 text-xs text-red-600">{errors.email}</p>}
            </div>
          </div>
        </section>

        {/* 2. Fahrzeug & Dachträger + Reling-Foto */}
        <section className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Fahrzeug & Dachträger</p>
            <span className="text-[10px] text-slate-400">HSN/TSN oder Reling-Foto</span>
          </div>
          <div className="p-3 space-y-2">
            {/* Marke + Modell */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Marke</label>
                <input
                  type="text"
                  value={formData.assignedVehicleMake || ''}
                  onChange={(e) => handleChange('assignedVehicleMake', e.target.value)}
                  className={fieldCls}
                  placeholder="z.B. VW"
                />
              </div>
              <div>
                <label className={labelCls}>Modell</label>
                <input
                  type="text"
                  value={formData.assignedVehicleModel || ''}
                  onChange={(e) => handleChange('assignedVehicleModel', e.target.value)}
                  className={fieldCls}
                  placeholder="z.B. Passat Variant"
                />
              </div>
            </div>
            {/* HSN / TSN / Reling / Dachträger */}
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-2">
                <label className={labelCls}>HSN</label>
                <input
                  type="text"
                  value={formData.assignedHsn || ''}
                  onChange={(e) => handleChange('assignedHsn', e.target.value)}
                  className={fieldCls}
                  placeholder="0000"
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>TSN</label>
                <input
                  type="text"
                  value={formData.assignedTsn || ''}
                  onChange={(e) => handleChange('assignedTsn', e.target.value)}
                  className={fieldCls}
                  placeholder="000"
                />
              </div>
              <div className="col-span-3">
                <label className={labelCls}>Reling</label>
                <select
                  value={formData.assignedRelingType || 'unklar'}
                  onChange={(e) => handleChange('assignedRelingType', e.target.value)}
                  className={fieldCls}
                >
                  <option value="unklar">Unklar</option>
                  <option value="offen">Offen</option>
                  <option value="geschlossen">Geschlossen</option>
                  <option value="keine">Keine</option>
                </select>
              </div>
              <div className="col-span-5">
                <label className={labelCls}>Dachträger-Schlüssel</label>
                <input
                  type="text"
                  value={formData.assignedRoofRackInventoryKey || ''}
                  onChange={(e) => handleChange('assignedRoofRackInventoryKey', e.target.value)}
                  className={fieldCls}
                  placeholder="z.B. THULE-OPEN-710410"
                />
              </div>
            </div>
            {/* Entscheidungsnotiz */}
            <div>
              <label className={labelCls}>Entscheidungsnotiz</label>
              <textarea
                value={formData.roofRackDecisionNote || ''}
                onChange={(e) => handleChange('roofRackDecisionNote', e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                placeholder="z.B. HSN/TSN geprüft, offene Reling per Foto bestätigt."
              />
            </div>
            {/* Reling-Foto – integriert */}
            <div className="pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls}>Reling-Foto <span className="text-slate-300">(optional)</span></label>
                <div className="flex items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePhotoSelected(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoBusy}
                    className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-300 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {photos.length ? 'Hinzufügen' : 'Hochladen'}
                  </button>
                  {photos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, roofRailPhotoDataUrls: undefined, roofRailPhotoDataUrl: undefined }))}
                      disabled={photoBusy}
                      className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 bg-white text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      Alle entfernen
                    </button>
                  )}
                </div>
              </div>
              {photoError && <p className="text-xs text-red-600 mb-1">{photoError}</p>}
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((url, idx) => (
                    <div key={idx} className="rounded-md overflow-hidden border border-slate-200 bg-white">
                      <img
                        src={url}
                        alt={idx === 0 ? 'Reling-Hauptfoto' : `Reling-Foto ${idx + 1}`}
                        className="w-full h-24 object-cover"
                        loading="lazy"
                      />
                      <div className="px-1.5 py-1 flex items-center justify-between gap-1">
                        <span className="text-[10px] text-slate-400">{idx === 0 ? 'Hauptfoto' : `Foto ${idx + 1}`}</span>
                        <div className="flex gap-1">
                          {idx !== 0 && (
                            <button
                              type="button"
                              className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 hover:bg-slate-50"
                              onClick={() => setFormData((prev) => {
                                const cur = ensurePhotoArray(prev);
                                const next = cur.slice();
                                const [picked] = next.splice(idx, 1);
                                next.unshift(picked);
                                return { ...prev, roofRailPhotoDataUrls: next, roofRailPhotoDataUrl: next[0] };
                              })}
                            >
                              Haupt
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 hover:bg-red-50 text-red-500"
                            onClick={() => setFormData((prev) => {
                              const cur = ensurePhotoArray(prev);
                              const next = cur.filter((_, i) => i !== idx);
                              return { ...prev, roofRailPhotoDataUrls: next.length ? next : undefined, roofRailPhotoDataUrl: next[0] || undefined };
                            })}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 3. Adresse */}
        <section>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Adresse</p>
          <div className="space-y-2">
            <div>
              <input
                type="text"
                value={formData.address?.street}
                onChange={(e) => handleAddressChange('street', e.target.value)}
                className={errors['address.street'] ? fieldErrCls : fieldCls}
                placeholder="Straße und Hausnummer *"
              />
              {errors['address.street'] && <p className="mt-0.5 text-xs text-red-600">{errors['address.street']}</p>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <input
                  type="text"
                  value={formData.address?.zipCode}
                  onChange={(e) => handleAddressChange('zipCode', e.target.value)}
                  className={errors['address.zipCode'] ? fieldErrCls : fieldCls}
                  placeholder="PLZ *"
                />
                {errors['address.zipCode'] && <p className="mt-0.5 text-xs text-red-600">{errors['address.zipCode']}</p>}
              </div>
              <div className="col-span-2">
                <input
                  type="text"
                  value={formData.address?.city}
                  onChange={(e) => handleAddressChange('city', e.target.value)}
                  className={errors['address.city'] ? fieldErrCls : fieldCls}
                  placeholder="Ort *"
                />
                {errors['address.city'] && <p className="mt-0.5 text-xs text-red-600">{errors['address.city']}</p>}
              </div>
            </div>
            <select
              value={formData.address?.country}
              onChange={(e) => handleAddressChange('country', e.target.value)}
              className={fieldCls}
            >
              <option value="Deutschland">Deutschland</option>
              <option value="Österreich">Österreich</option>
              <option value="Schweiz">Schweiz</option>
              <option value="Frankreich">Frankreich</option>
              <option value="Luxemburg">Luxemburg</option>
            </select>
          </div>
        </section>

        {/* 4. Kontaktdatum + Notizen */}
        <section>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Weitere Angaben</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className={labelCls}>Erstkontakt <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={formData.contactDate ? new Date(formData.contactDate).toISOString().split('T')[0] : ''}
                onChange={(e) => handleChange('contactDate', new Date(e.target.value).getTime())}
                className={errors.contactDate ? fieldErrCls : fieldCls}
              />
              {errors.contactDate && <p className="mt-0.5 text-xs text-red-600">{errors.contactDate}</p>}
            </div>
          </div>
          <div>
            <label className={labelCls}>Interne Notizen</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={2}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="Optionale interne Notizen..."
            />
          </div>
        </section>
      </div>

      {/* Sticky Aktionsleiste */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 bg-white sticky bottom-0">
        <AutoSaveIndicator state={draftSaveState} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-slate-300 text-slate-600 font-medium rounded-md hover:bg-slate-50 transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-sm bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-md transition-colors shadow-sm"
          >
            {customer ? 'Speichern' : 'Kunde anlegen'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default CustomerForm;

/**
 * MessageToRentalWorkflow Component
 * Modal-Flow: Nachricht → Vorgang erstellen
 * 3 Schritte: Kunde wählen → Daten prüfen → Vorgang erstellen
 */

import { useState } from 'react';
import { ProductType, Customer } from '../types';

interface MessageToRentalWorkflowProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    customerId: string;
    productType: ProductType;
    rentalStart: number;
    rentalEnd: number;
    message: string;
    channel: string;
    vehicleData?: {
      make?: string;
      model?: string;
      widthMm?: number;
      hsn?: string;
      tsn?: string;
      relingType?: string;
      ahkPresent?: 'ja' | 'nein' | 'unklar';
    };
  }) => void;
  customers: Customer[];
  initialData: {
    message: string;
    channel: string;
    suggestedProductType?: ProductType;
    extractedDates?: {
      start?: number;
      end?: number;
    };
    extractedVehicle?: {
      make?: string;
      model?: string;
    };
  };
}

type Step = 1 | 2 | 3;

export const MessageToRentalWorkflow: React.FC<MessageToRentalWorkflowProps> = ({
  isOpen,
  onClose,
  onCreate,
  customers,
  initialData,
}) => {
  const [step, setStep] = useState<Step>(1);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);

  // Schritt 2: Daten
  const [productType, setProductType] = useState<ProductType>(
    initialData.suggestedProductType || 'Dachbox XL'
  );
  const [rentalStart, setRentalStart] = useState<string>(
    initialData.extractedDates?.start
      ? new Date(initialData.extractedDates.start).toISOString().substring(0, 10)
      : ''
  );
  const [rentalEnd, setRentalEnd] = useState<string>(
    initialData.extractedDates?.end
      ? new Date(initialData.extractedDates.end).toISOString().substring(0, 10)
      : ''
  );

  // Fahrzeugdaten
  const [vehicleMake, setVehicleMake] = useState<string>(
    initialData.extractedVehicle?.make || ''
  );
  const [vehicleModel, setVehicleModel] = useState<string>(
    initialData.extractedVehicle?.model || ''
  );
  const [vehicleWidthMm, setVehicleWidthMm] = useState<string>('');
  const [hsn, setHsn] = useState<string>('');
  const [tsn, setTsn] = useState<string>('');
  const [relingType, setRelingType] = useState<string>('offen');
  const [ahkPresent, setAhkPresent] = useState<'ja' | 'nein' | 'unklar'>('unklar');

  // Validierung
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset bei Öffnen
  useState(() => {
    if (isOpen) {
      setStep(1);
      setSelectedCustomerId('');
      setShowNewCustomerForm(false);
      setErrors({});
    }
  });

  // Wenn nicht offen, nichts rendern
  if (!isOpen) return null;

  // Kunde filtern
  const filteredCustomers = customers.filter((customer) => {
    if (!selectedCustomerId) return true;
    return customer.id === selectedCustomerId;
  });

  // Step 1: Kunde wählen
  const renderStep1 = () => (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Schritt 1: Kunde wählen</h3>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Existierenden Kunden wählen
        </label>
        <select
          value={selectedCustomerId}
          onChange={(e) => {
            setSelectedCustomerId(e.target.value);
            setShowNewCustomerForm(false);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">-- Kunde wählen --</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.lastName}, {customer.firstName} ({customer.email})
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <div className="flex items-center mb-2">
          <span className="text-sm text-gray-500">oder</span>
          <div className="flex-1 h-px bg-gray-300 ml-2"></div>
        </div>

        <button
          onClick={() => setShowNewCustomerForm(true)}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
        >
          + Neuen Kunden anlegen
        </button>
      </div>

      {/* Platzhalter für NewCustomerForm */}
      {showNewCustomerForm && (
        <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-md">
          <p className="text-sm text-gray-600">
            Hier würde das NewCustomerForm Component erscheinen...
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
        >
          Abbrechen
        </button>
        <button
          onClick={() => {
            if (!selectedCustomerId && !showNewCustomerForm) {
              setErrors({ customer: 'Bitte wählen Sie einen Kunden aus oder legen Sie einen neuen an.' });
              return;
            }
            setErrors({});
            setStep(2);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
        >
          Weiter →
        </button>
      </div>

      {errors.customer && (
        <p className="mt-2 text-sm text-red-600">{errors.customer}</p>
      )}
    </div>
  );

  // Step 2: Daten prüfen
  const renderStep2 = () => (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Schritt 2: Daten prüfen & ergänzen</h3>

      {/* Nachricht (readonly) */}
      <div className="mb-4 p-3 bg-gray-50 rounded-md">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Original-Nachricht
        </label>
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{initialData.message}</p>
      </div>

      {/* Produkt */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Produkt *
        </label>
        <select
          value={productType}
          onChange={(e) => setProductType(e.target.value as ProductType)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="Dachbox XL">Dachbox XL</option>
          <option value="Dachbox L">Dachbox L</option>
          <option value="Dachbox M">Dachbox M</option>
          <option value="Fahrradträger">Fahrradträger</option>
          <option value="Heckbox">Heckbox</option>
          <option value="Hüpfburg">Hüpfburg</option>
        </select>
      </div>

      {/* Mietzeitraum */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mietstart *
          </label>
          <input
            type="date"
            value={rentalStart}
            onChange={(e) => setRentalStart(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mietende *
          </label>
          <input
            type="date"
            value={rentalEnd}
            onChange={(e) => setRentalEnd(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Fahrzeugdaten (nur bei Dachbox) */}
      {(productType === 'Dachbox XL' || productType === 'Dachbox L' || productType === 'Dachbox M') && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Fahrzeugdaten</h4>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="block text-xs text-gray-700 mb-1">Marke</label>
              <input
                type="text"
                value={vehicleMake}
                onChange={(e) => setVehicleMake(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-1">Modell</label>
              <input
                type="text"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="block text-xs text-gray-700 mb-1">HSN</label>
              <input
                type="text"
                value={hsn}
                onChange={(e) => setHsn(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-700 mb-1">TSN</label>
              <input
                type="text"
                value={tsn}
                onChange={(e) => setTsn(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
          </div>

          <div className="mb-2">
            <label className="block text-xs text-gray-700 mb-1">Fahrzeugbreite (mm, optional)</label>
            <input
              type="number"
              value={vehicleWidthMm}
              onChange={(e) => setVehicleWidthMm(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              placeholder="z.B. 1180"
            />
            <div className="text-[11px] text-gray-500 mt-1">
              Auto-Auswahl: bis 1180 mm =&gt; 712200, sonst Standard 712300.
            </div>
          </div>

          <div className="mb-2">
            <label className="block text-xs text-gray-700 mb-1">Relingart</label>
            <select
              value={relingType}
              onChange={(e) => setRelingType(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            >
              <option value="offen">Offen</option>
              <option value="geschlossen">Geschlossen</option>
              <option value="unklar">Unklar</option>
            </select>
          </div>
        </div>
      )}

      {/* AHK (nur bei Heckbox/Fahrradträger) */}
      {(productType === 'Heckbox' || productType === 'Fahrradträger') && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <h4 className="text-sm font-medium text-green-900 mb-2">AHK vorhanden?</h4>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAhkPresent('ja')}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${
                ahkPresent === 'ja'
                  ? 'bg-green-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Ja
            </button>
            <button
              type="button"
              onClick={() => setAhkPresent('nein')}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${
                ahkPresent === 'nein'
                  ? 'bg-red-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Nein
            </button>
            <button
              type="button"
              onClick={() => setAhkPresent('unklar')}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${
                ahkPresent === 'unklar'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Unklar
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between gap-2 mt-6">
        <button
          onClick={() => setStep(1)}
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
        >
          ← Zurück
        </button>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
          >
            Abbrechen
          </button>
          <button
            onClick={() => {
              // Validierung
              const newErrors: Record<string, string> = {};

              if (!rentalStart) newErrors.rentalStart = 'Mietstart erforderlich';
              if (!rentalEnd) newErrors.rentalEnd = 'Mietende erforderlich';

              if ((productType === 'Dachbox XL' || productType === 'Dachbox L' || productType === 'Dachbox M') && !vehicleMake) {
                newErrors.vehicleMake = 'Fahrzeugmarke erforderlich';
              }

              if ((productType === 'Heckbox' || productType === 'Fahrradträger') && ahkPresent === 'unklar') {
                newErrors.ahkPresent = 'AHK-Status erforderlich';
              }

              if (Object.keys(newErrors).length > 0) {
                setErrors(newErrors);
                return;
              }

              setErrors({});
              setStep(3);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            Weiter →
          </button>
        </div>
      </div>

      {Object.values(errors).length > 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800 font-medium">Bitte korrigieren Sie folgende Fehler:</p>
          <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
            {Object.entries(errors).map(([key, error]) => (
              <li key={key}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  // Step 3: Zusammenfassung
  const renderStep3 = () => (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Schritt 3: Zusammenfassung</h3>

      <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-md">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Vorgangs-Daten</h4>

        <div className="space-y-2 text-sm">
          <div>
            <span className="font-medium">Kunde:</span>{' '}
            {customers.find((c) => c.id === selectedCustomerId)?.firstName}{' '}
            {customers.find((c) => c.id === selectedCustomerId)?.lastName}
          </div>

          <div>
            <span className="font-medium">Produkt:</span> {productType}
          </div>

          <div>
            <span className="font-medium">Mietzeitraum:</span>{' '}
            {rentalStart && new Date(rentalStart).toLocaleDateString('de-DE')} bis{' '}
            {rentalEnd && new Date(rentalEnd).toLocaleDateString('de-DE')}
          </div>

          {(vehicleMake || vehicleModel) && (
            <div>
              <span className="font-medium">Fahrzeug:</span> {vehicleMake} {vehicleModel}
            </div>
          )}
          {vehicleWidthMm && (
            <div>
              <span className="font-medium">Fahrzeugbreite:</span> {vehicleWidthMm} mm
            </div>
          )}

          {(hsn || tsn) && (
            <div>
              <span className="font-medium">HSN/TSN:</span> {hsn} / {tsn}
            </div>
          )}

          {ahkPresent !== 'unklar' && (
            <div>
              <span className="font-medium">AHK:</span>{' '}
              {ahkPresent === 'ja' ? 'Ja' : 'Nein'}
            </div>
          )}

          <div className="pt-2 border-t border-gray-300">
            <span className="font-medium">Kanal:</span> {initialData.channel}
          </div>
        </div>
      </div>

      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-sm text-yellow-800">
          ✓ Der Vorgang wird mit Status <strong>neu</strong> erstellt.
        </p>
        <p className="text-sm text-yellow-800">
          ✓ Sie können ihn danach im Kanban-Board weiterbearbeiten.
        </p>
      </div>

      <div className="flex justify-between gap-2 mt-6">
        <button
          onClick={() => setStep(2)}
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
        >
          ← Zurück
        </button>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
          >
            Abbrechen
          </button>
          <button
            onClick={() => {
              onCreate({
                customerId: selectedCustomerId,
                productType,
                rentalStart: new Date(rentalStart).getTime(),
                rentalEnd: new Date(rentalEnd).getTime(),
                message: initialData.message,
                channel: initialData.channel,
                vehicleData: {
                  make: vehicleMake,
                  model: vehicleModel,
                  widthMm: Number(vehicleWidthMm || 0) || undefined,
                  hsn,
                  tsn,
                  relingType,
                  ahkPresent,
                },
              });

              // Reset & Close
              setStep(1);
              setSelectedCustomerId('');
              setShowNewCustomerForm(false);
              onClose();
            }}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold"
          >
            ✓ Vorgang erstellen
          </button>
        </div>
      </div>
    </div>
  );

  // Modal rendern
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Vorgang erstellen</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <span className="sr-only">Schließen</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress Steps */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  1
                </div>
                <span className="ml-2 text-sm font-medium">Kunde</span>
              </div>

              <div className="flex-1 h-1 mx-4 bg-gray-200">
                <div
                  className={`h-full ${step >= 2 ? 'bg-blue-600' : 'bg-gray-200'}`}
                  style={{ width: step >= 2 ? '100%' : '0%' }}
                ></div>
              </div>

              <div className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  2
                </div>
                <span className="ml-2 text-sm font-medium">Daten</span>
              </div>

              <div className="flex-1 h-1 mx-4 bg-gray-200">
                <div
                  className={`h-full ${step >= 3 ? 'bg-blue-600' : 'bg-gray-200'}`}
                  style={{ width: step >= 3 ? '100%' : '0%' }}
                ></div>
              </div>

              <div className="flex items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  3
                </div>
                <span className="ml-2 text-sm font-medium">Fertig</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
      </div>
    </div>
  );
};

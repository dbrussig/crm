import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { RENTAL_PRODUCTS, type RentalProduct } from '../config/rentalCatalog';

export default function PriceManagement() {
  const [products, setProducts] = useState<RentalProduct[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProducts(JSON.parse(JSON.stringify(RENTAL_PRODUCTS)));
  }, []);

  const handlePriceChange = (productIndex: number, durationIndex: number, newPrice: string) => {
    const updated = [...products];
    updated[productIndex].durations[durationIndex].price = parseFloat(newPrice) || 0;
    setProducts(updated);
    setSaved(false);
  };

  const handleSave = () => {
    const code = `export const RENTAL_PRODUCTS: RentalProduct[] = ${JSON.stringify(products, null, 2)};`;
    console.log('Neue Preise (bitte in rentalCatalog.ts einfügen):', code);
    
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rental-products-updated.txt';
    a.click();
    URL.revokeObjectURL(url);
    
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Preispflege</h2>
          <p className="text-sm text-slate-600 mt-1">
            Preise für Vermietungsprodukte anpassen
          </p>
        </div>
        <button
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Save size={16} />
          {saved ? 'Gespeichert!' : 'Export & Speichern'}
        </button>
      </div>

      <div className="space-y-4">
        {products.map((product, pIdx) => (
          <div key={product.key} className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="font-semibold text-slate-900 mb-3">{product.label}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {product.durations.map((duration, dIdx) => (
                <div key={`${product.key}-${dIdx}`}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {duration.label}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={duration.price}
                      onChange={(e) => handlePriceChange(pIdx, dIdx, e.target.value)}
                      step="0.01"
                      min="0"
                      className="w-full pl-3 pr-8 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                      €
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800">
          <strong>Hinweis:</strong> Nach dem Speichern wird eine Datei heruntergeladen. 
          Die Änderungen müssen manuell in <code className="bg-amber-100 px-1 rounded">src/config/rentalCatalog.ts</code> eingefügt werden.
        </p>
      </div>
    </div>
  );
}

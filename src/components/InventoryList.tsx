import React from 'react';
import { Product, RoofType } from '../types';

interface InventoryListProps {
  products: Product[];
  roofType: RoofType;
}

const InventoryList: React.FC<InventoryListProps> = ({ products, roofType }) => {
  if (products.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-slate-200 shadow-sm">
        <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-lg font-medium text-slate-900">Keine passenden Träger gefunden</h3>
        <p className="text-slate-500 mt-2">
          Leider haben wir für den Dachtyp "{roofType}" aktuell keine Artikel im direkten Bestand.
        </p>
      </div>
    );
  }

  // Group products by bundleId
  const bundledProducts = products.filter(p => p.bundleId);
  const standaloneProducts = products.filter(p => !p.bundleId);

  // Create bundle groups
  const bundleGroups = bundledProducts.reduce((groups, product) => {
    const bundleId = product.bundleId!;
    if (!groups[bundleId]) {
      groups[bundleId] = [];
    }
    groups[bundleId].push(product);
    return groups;
  }, {} as Record<string, typeof products>);

  return (
    <div>
      <h3 className="text-2xl font-bold text-slate-800 mb-6">Passende Produkte im Bestand</h3>

      {/* Bundles Section */}
      {Object.keys(bundleGroups).length > 0 && (
        <div className="mb-8">
          <h4 className="text-xl font-bold text-slate-700 mb-4 flex items-center gap-2">
            <span>📦</span> Komplettsysteme & Zusammengehörige Teile
          </h4>
          <div className="space-y-6">
            {Object.values(bundleGroups).map((bundle) => {
              const completeBundle = bundle.find(p => p.isCompleteBundle);
              const parts = bundle.filter(p => !p.isCompleteBundle);

              if (completeBundle) {
                // Show as complete bundle
                return (
                  <div key={completeBundle.id} className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border-2 border-amber-300 overflow-hidden shadow-md hover:shadow-lg transition-shadow">
                    <div className="p-4 bg-amber-100 border-b border-amber-200">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">✅</span>
                        <div>
                          <h5 className="text-lg font-bold text-amber-900">Komplettsystem - Alles enthalten!</h5>
                          <p className="text-sm text-amber-700">Fußpunkte + Träger in einem Set</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="md:w-1/3">
                          <img
                            src={completeBundle.imageUrl}
                            alt={completeBundle.name}
                            className="w-full h-40 object-cover rounded-lg shadow-sm"
                          />
                        </div>
                        <div className="md:w-2/3">
                          <h6 className="text-xl font-bold text-slate-800 mb-2">{completeBundle.name}</h6>
                          <p className="text-slate-600 mb-4">{completeBundle.description}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-3xl font-bold text-slate-900">{completeBundle.price.toFixed(2)} €</span>
                            <button className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition-colors shadow-sm">
                              Komplettsystem wählen
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              } else {
                // Show as parts bundle
                return (
                  <div key={bundle[0].bundleId} className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border-2 border-blue-200 overflow-hidden shadow-md">
                    <div className="p-3 bg-blue-100 border-b border-blue-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🔧</span>
                        <h5 className="text-base font-bold text-blue-900">Zusammengehöriges System: {parts.length} Teile</h5>
                        <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded-full ml-auto">Alle Teile erforderlich!</span>
                      </div>
                    </div>
                    <div className="p-5">
                      <p className="text-sm text-blue-800 mb-4 bg-blue-50 p-3 rounded-lg border border-blue-200">
                        ⚠️ <strong>Achtung:</strong> Diese Produkte funktionieren nur in Kombination! Sie benötigen alle {parts.length} Teile für eine funktionierende Dachträger-Lösung.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {parts.sort((a, b) => (a.bundlePartNumber || 0) - (b.bundlePartNumber || 0)).map((part) => (
                          <div key={part.id} className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden border border-slate-200">
                            <div className="h-32 overflow-hidden bg-slate-100 relative">
                              <img
                                src={part.imageUrl}
                                alt={part.name}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
                                Teil {part.bundlePartNumber}/{parts.length}
                              </div>
                            </div>
                            <div className="p-4">
                              <h6 className="text-sm font-bold text-slate-800 mb-1">{part.name}</h6>
                              <p className="text-xs text-slate-600 mb-3">{part.description}</p>
                              <div className="flex items-center justify-between">
                                <span className="text-lg font-bold text-slate-900">{part.price.toFixed(2)} €</span>
                                <span className="text-xs text-slate-500">Auf Lager: {part.stock}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 pt-4 border-t border-blue-200 text-center">
                        <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors">
                          Alle {parts.length} Teile wählen ({parts.reduce((sum, p) => sum + p.price, 0).toFixed(2)} €)
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </div>
      )}

      {/* Standalone Products */}
      {standaloneProducts.length > 0 && (
        <div>
          <h4 className="text-xl font-bold text-slate-700 mb-4 flex items-center gap-2">
            <span>📋</span> Weitere Produkte
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {standaloneProducts.map((product) => (
              <div key={product.id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-slate-200 overflow-hidden flex flex-col">
                <div className="h-48 overflow-hidden bg-slate-100 relative group">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                    {product.recommendation && (
                      <span className="bg-amber-400 text-amber-900 text-xs font-bold px-2.5 py-0.5 rounded border border-amber-500 shadow-sm">
                        ⭐ {product.recommendation}
                      </span>
                    )}
                    {product.stock > 0 ? (
                      <span className="bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-0.5 rounded border border-green-200">
                        Auf Lager ({product.stock})
                      </span>
                    ) : (
                      <span className="bg-red-100 text-red-800 text-xs font-semibold px-2.5 py-0.5 rounded border border-red-200">
                        Ausverkauft
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 flex-grow flex flex-col">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{product.manufacturer}</div>
                  <h4 className="text-lg font-bold text-slate-800 mb-2 leading-tight">{product.name}</h4>

                  {product.warning && (
                    <div className="mb-3 p-2 bg-red-50 border-l-4 border-red-500 rounded-r">
                      <p className="text-xs font-semibold text-red-700 flex items-start gap-1">
                        <span>⚠️</span>
                        <span>{product.warning}</span>
                      </p>
                    </div>
                  )}

                  {product.description && (
                    <p className="text-sm text-slate-600 mb-3 leading-snug">{product.description}</p>
                  )}

                  <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-2xl font-bold text-slate-900">{product.price.toFixed(2)} €</span>
                    <button
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        product.stock > 0
                          ? 'bg-slate-900 text-white hover:bg-slate-800'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                      disabled={product.stock === 0}
                    >
                      Auswählen
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryList;

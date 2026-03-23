import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

// Specific types for the catalog data provided by user
interface CatalogProduct {
  id: number;
  name: string;
  brand: string;
  type: string;
  length: number | null;
  load: number | null;
  spec: string;
  features: string[];
  desc: string;
  status: string;
  images: string[]; // Added images array
}

const CATALOG_DATA: CatalogProduct[] = [
  {
      id: 1,
      name: "Fischer Relingträger Topline L",
      brand: "Fischer",
      type: "Offen",
      length: 135,
      load: 90,
      spec: "45 x 28 mm",
      features: ["Vormontiert", "Inkl. Schloss", "Offene Reling"],
      desc: "Geeignet für Fahrradträger, Dachboxen oder Skihalter. Einfache Montage ohne Werkzeug.",
      status: "Komplettset",
      images: [
          "/product-images/fischer-topline-l-main.jpg",
          "/product-images/fischer-topline-l-application.jpg"
      ]
  },
  {
      id: 2,
      name: "Fischer Relingträger Topline XL",
      brand: "Fischer",
      type: "Offen",
      length: 120,
      load: 90,
      spec: "45 x 28 mm",
      features: ["Vormontiert", "Inkl. Schloss", "Offene Reling"],
      desc: "Kompaktere Variante des Topline L. Ideal für schmalere Fahrzeuge mit offener Reling.",
      status: "Komplettset",
      images: [
          "/product-images/fischer-topline-xl-main.jpg",
          "/product-images/fischer-topline-xl-application.jpg"
      ]
  },
  {
      id: 3,
      name: "Thule 712300 SquareBar",
      brand: "Thule",
      type: "Komponente",
      length: 127,
      load: null,
      spec: "Stahl",
      features: ["Nur Barren", "SquareBar Classic"],
      desc: "Einzelne Vierkantrohre aus Stahl mit schwarzem Kunststoffüberzug. Fußsatz separat benötigt.",
      status: "Komponente",
      images: [
          "/product-images/thule-squarebar-127.png"
      ]
  },
  {
      id: 4,
      name: "Thule 712200 SquareBar",
      brand: "Thule",
      type: "Komponente",
      length: 118,
      load: null,
      spec: "Stahl",
      features: ["Nur Barren", "SquareBar Classic"],
      desc: "Kürzere Variante (1180mm). Klassisches Vierkantprofil für maximale Belastbarkeit.",
      status: "Komponente",
      images: [
          "/product-images/thule-squarebar-118.png"
      ]
  },
  {
      id: 14,
      name: "Thule 710410 Fußpunkte für Reling",
      brand: "Thule",
      type: "Komponente",
      length: null,
      load: 75,
      spec: "Fußpunkte-Set",
      features: ["Erforderlich für SquareBar", "4 Fußpunkte", "Abschließbar"],
      desc: "Komplettset mit 4 Fußpunkten für offene Relinge. Erforderlich für Thule SquareBar 712200/712300.",
      status: "Komponente",
      images: [
          "/product-images/thule-710410-foot-pack.jpg"
      ]
  },
  {
      id: 8,
      name: "Owen Dachträger 3.0 Pro Silber",
      brand: "Owen",
      type: "Geschlossen",
      length: 120,
      load: 90,
      spec: "Aluminium",
      features: ["2 min Montage", "TÜV & GS", "Abschließbar"],
      desc: "Universal für geschlossene & bündige Reling. Hochwertiges Silber-Finish, aerodynamische Form.",
      status: "Komplettset",
      images: [
          "/product-images/owen-3-0-pro-silver-1.webp",
          "/product-images/owen-3-0-pro-silver-4.webp"
      ]
  },
  {
      id: 9,
      name: "Owen 3.0 Universal (Alu)",
      brand: "Owen",
      type: "Geschlossen",
      length: 120,
      load: 90,
      spec: "Aluminium",
      features: ["Bündige Schiene", "Geschlossene Reling"],
      desc: "Standard Alu-Relingträger universal. Leichte Bauweise bei hoher Stabilität.",
      status: "Komplettset",
      images: [
          "/product-images/owen-3-0-universal-black-1.png",
          "/product-images/owen-3-0-universal-black-2.png"
      ]
  },
  {
      id: 11,
      name: "Owen Dachträger 3.0 Pro Schwarz",
      brand: "Owen",
      type: "Geschlossen",
      length: 135,
      load: 90,
      spec: "Aluminium Black",
      features: ["2 min Montage", "TÜV & GS", "Schwarz"],
      desc: "Längere Version (135cm) für breitere Fahrzeuge. Edler Stealth Look in mattem Schwarz.",
      status: "Komplettset",
      images: [
          "/product-images/owen-3-0-pro-black-1.webp",
          "/product-images/owen-3-0-pro-black-2.webp"
      ]
  },
  {
      id: 13,
      name: "VEVOR Dachträger Universal",
      brand: "VEVOR",
      type: "Offen",
      length: 132,
      load: 90,
      spec: "Ø 28-68 mm Rohr",
      features: ["Verstellbar 19-113cm", "Für erhöhte Schienen"],
      desc: "Robuster Universalträger für klassische offene Relings. Sehr flexibel einstellbar.",
      status: "Komplettset",
      images: [
          "/product-images/vevor-cross-bar-main.webp",
          "/product-images/vevor-cross-bar-f1.webp",
          "/product-images/vevor-cross-bar-f4.webp",
          "/product-images/vevor-cross-bar-f5.webp"
      ]
  }
];

const CatalogPage: React.FC = () => {
  const [filters, setFilters] = useState({ brand: 'all', type: 'all' });
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  // Filter Logic
  const filteredProducts = CATALOG_DATA.filter(p => {
    const brandMatch = filters.brand === 'all' || p.brand === filters.brand;
    const typeMatch = filters.type === 'all' || 
                      (filters.type === 'Offen' && p.type === 'Offen') ||
                      (filters.type === 'Geschlossen' && p.type === 'Geschlossen') ||
                      (filters.type === 'Komponente' && p.type === 'Komponente');
    return brandMatch && typeMatch;
  });

  // Chart Logic
  useEffect(() => {
    if (chartRef.current) {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      const lengthData = CATALOG_DATA.filter(p => p.length !== null).sort((a,b) => (a.length || 0) - (b.length || 0));
      
      chartInstance.current = new Chart(chartRef.current, {
        type: 'bar',
        data: {
          labels: lengthData.map(p => p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name),
          datasets: [{
            label: 'Barrenlänge (cm)',
            data: lengthData.map(p => p.length),
            backgroundColor: lengthData.map(p => {
              if(p.brand === 'Thule') return 'rgba(59, 130, 246, 0.7)'; // Blue
              if(p.brand === 'Fischer') return 'rgba(16, 185, 129, 0.7)'; // Green
              if(p.brand === 'Owen') return 'rgba(245, 158, 11, 0.7)'; // Amber
              return 'rgba(100, 116, 139, 0.7)';
            }),
            borderColor: 'transparent',
            borderRadius: 4,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: false,
              min: 100,
              title: { display: true, text: 'Länge in cm' }
            },
            x: {
              ticks: { maxRotation: 45, minRotation: 45 }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const idx = context.dataIndex;
                  return lengthData[idx].length + ' cm - ' + lengthData[idx].brand;
                }
              }
            }
          }
        }
      });
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, []);

  // Keyboard Navigation for Gallery
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedProduct) return;
      
      if (e.key === 'ArrowRight') {
        nextImage();
      } else if (e.key === 'ArrowLeft') {
        prevImage();
      } else if (e.key === 'Escape') {
        closeDetails();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProduct, activeImageIndex]);

  const openDetails = (product: CatalogProduct) => {
      setSelectedProduct(product);
      setActiveImageIndex(0);
  };

  const closeDetails = () => {
      setSelectedProduct(null);
  };

  const nextImage = () => {
    if (!selectedProduct) return;
    setActiveImageIndex((prev) => (prev + 1) % selectedProduct.images.length);
  };

  const prevImage = () => {
    if (!selectedProduct) return;
    setActiveImageIndex((prev) => (prev - 1 + selectedProduct.images.length) % selectedProduct.images.length);
  };

  const getIcon = (type: string) => {
    if (type === 'Offen') return <span className="text-2xl">🪜</span>;
    if (type === 'Geschlossen') return <span className="text-2xl">🚅</span>;
    return <span className="text-2xl">🔧</span>;
  };

  return (
    <div className="space-y-12 animate-fade-in-up">
      
      {/* Intro Section */}
      <section className="text-center max-w-3xl mx-auto space-y-4">
        <h2 className="text-3xl font-bold text-slate-900">Gesamtkatalog & Bestand</h2>
        <p className="text-slate-600 leading-relaxed">
          Stöbern Sie durch das komplette Inventar. Nutzen Sie die Filter oder klicken Sie auf "Details", 
          um Bilder und technische Spezifikationen zu sehen.
        </p>
      </section>

      {/* Chart Section */}
      <section className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
        <div className="mb-6">
          <h3 className="text-xl font-bold text-slate-800 mb-2">Analyse: Barrenlängen</h3>
          <p className="text-sm text-slate-500">
            Übersicht der verfügbaren Längen im Sortiment.
          </p>
        </div>
        <div className="w-full max-w-4xl mx-auto h-[350px]">
          <canvas ref={chartRef}></canvas>
        </div>
      </section>

      {/* Catalog & Filter Section */}
      <section>
        <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-6 gap-4">
          <div>
            <h3 className="text-2xl font-bold text-slate-800">Produktkatalog</h3>
            <p className="text-sm text-slate-500">{filteredProducts.length} Ergebnisse gefunden</p>
          </div>
          
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <select 
              value={filters.brand} 
              onChange={(e) => setFilters(prev => ({...prev, brand: e.target.value}))}
              className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-auto"
            >
              <option value="all">Alle Marken</option>
              <option value="Fischer">Fischer</option>
              <option value="Thule">Thule</option>
              <option value="Owen">Owen</option>
              <option value="VEVOR">VEVOR</option>
            </select>
            <select 
              value={filters.type}
              onChange={(e) => setFilters(prev => ({...prev, type: e.target.value}))}
              className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-auto"
            >
              <option value="all">Alle Reling-Typen</option>
              <option value="Offen">Offene Reling</option>
              <option value="Geschlossen">Geschlossene Reling</option>
              <option value="Komponente">Einzelkomponente</option>
            </select>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map(p => (
              <div key={p.id} 
                className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden flex flex-col justify-between transition-all hover:translate-y-[-2px] hover:shadow-lg cursor-pointer group"
                onClick={() => openDetails(p)}
              >
                {/* Card Image */}
                <div className="h-48 overflow-hidden bg-slate-100 relative">
                   <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                   <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded-lg shadow-sm">
                     {getIcon(p.type)}
                   </div>
                   {/* Gallery Indicator Badge */}
                   {p.images.length > 1 && (
                     <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur text-white text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                       <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                       </svg>
                       {p.images.length}
                     </div>
                   )}
                </div>

                <div className="p-5 flex flex-col flex-grow">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-blue-600 uppercase tracking-wide bg-blue-50 px-2 py-0.5 rounded">{p.brand}</span>
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 leading-tight mb-2 group-hover:text-blue-600 transition-colors">{p.name}</h4>
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                        {p.load && <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-semibold">⚖️ {p.load}kg</span>}
                        {p.length && <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-semibold">📏 {p.length}cm</span>}
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-semibold">
                            {p.status === 'Komplettset' ? '✅ Set' : '🧩 Teil'}
                        </span>
                    </div>
                    
                    <button 
                      className="mt-auto w-full py-2 px-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors flex justify-center items-center gap-2"
                    >
                        Details & Bilder <span>📸</span>
                    </button>
                </div>
              </div>
          ))}
        </div>
      </section>

      {/* Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={closeDetails}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div>
                        <span className="text-xs font-bold text-blue-600 uppercase">{selectedProduct.brand}</span>
                        <h3 className="text-xl font-bold text-slate-800 leading-none">{selectedProduct.name}</h3>
                    </div>
                    <button onClick={closeDetails} className="p-2 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto overflow-x-hidden flex-1">
                    <div className="flex flex-col lg:flex-row h-full">
                        
                        {/* Left: Gallery */}
                        <div className="lg:w-3/5 bg-slate-50 p-6 flex flex-col justify-center">
                            <div className="aspect-video bg-white rounded-lg shadow-sm border border-slate-200 mb-4 overflow-hidden flex items-center justify-center relative group">
                                <img 
                                    src={selectedProduct.images[activeImageIndex]} 
                                    alt="Product Detail" 
                                    className="w-full h-full object-contain"
                                />
                                
                                {/* Navigation Arrows */}
                                {selectedProduct.images.length > 1 && (
                                  <>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); prevImage(); }}
                                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-slate-800 p-2 rounded-full shadow-md backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                                      title="Vorheriges Bild (Pfeil Links)"
                                    >
                                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); nextImage(); }}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-slate-800 p-2 rounded-full shadow-md backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                                      title="Nächstes Bild (Pfeil Rechts)"
                                    >
                                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </button>
                                  </>
                                )}
                            </div>
                            
                            {/* Thumbnails */}
                            {selectedProduct.images.length > 1 && (
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                    {selectedProduct.images.map((img, idx) => (
                                        <button 
                                            key={idx}
                                            onClick={() => setActiveImageIndex(idx)}
                                            className={`w-20 h-20 shrink-0 rounded-md overflow-hidden border-2 transition-all ${activeImageIndex === idx ? 'border-blue-500 opacity-100' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                        >
                                            <img src={img} className="w-full h-full object-cover" alt="thumbnail" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Right: Details */}
                        <div className="lg:w-2/5 p-8 bg-white flex flex-col">
                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-100 pb-2 mb-3">Beschreibung</h4>
                                    <p className="text-slate-600 leading-relaxed">{selectedProduct.desc}</p>
                                </div>

                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-100 pb-2 mb-3">Spezifikationen</h4>
                                    <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                                        <div>
                                            <span className="block text-slate-400 text-xs">Typ</span>
                                            <span className="font-medium text-slate-800">{selectedProduct.type}</span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 text-xs">Umfang</span>
                                            <span className="font-medium text-slate-800">{selectedProduct.status}</span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 text-xs">Länge</span>
                                            <span className="font-medium text-slate-800">{selectedProduct.length ? selectedProduct.length + ' cm' : 'N/A'}</span>
                                        </div>
                                        <div>
                                            <span className="block text-slate-400 text-xs">Max. Last</span>
                                            <span className="font-medium text-slate-800">{selectedProduct.load ? selectedProduct.load + ' kg' : 'N/A'}</span>
                                        </div>
                                        <div className="col-span-2">
                                            <span className="block text-slate-400 text-xs">Profil/Info</span>
                                            <span className="font-medium text-slate-800">{selectedProduct.spec}</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-100 pb-2 mb-3">Features</h4>
                                    <ul className="space-y-2">
                                        {selectedProduct.features.map((f, i) => (
                                            <li key={i} className="flex items-start text-sm text-slate-600">
                                                <svg className="w-4 h-4 text-green-500 mr-2 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            <div className="mt-8 pt-6 border-t border-slate-100">
                                <a 
                                  href={`https://www.google.com/search?q=${encodeURIComponent(selectedProduct.name + ' preis')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="block w-full text-center bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                                >
                                    Preise & Verfügbarkeit prüfen
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default CatalogPage;
import React from 'react';

interface ConfiguratorLink {
  name: string;
  url: string;
  description: string;
  domain: string;
}

const LINKS: ConfiguratorLink[] = [
  {
    name: 'Alu-Dachtraeger.de',
    url: 'https://www.alu-dachtraeger.de/konfigurator/',
    description: 'Konfigurator zum Selber-Bauen von Dachträgern – einfach und schnell. Passend für dein Auto.',
    domain: 'alu-dachtraeger.de'
  },
  {
    name: 'Thule',
    url: 'https://www.thule.com/de-de/roof-rack',
    description: 'Thule bietet einen Premium-Konfigurator, um den perfekten Dachträger für dein Fahrzeug zu finden.',
    domain: 'thule.com'
  },
  {
    name: 'ATU Dachträger Finder',
    url: 'https://www.atu.de/dachtraeger-konfigurator-flr.html',
    description: 'Thule-Dachträger-Finder mit Konfigurator – profitiere vom Gratisversand in ATU-Filialen.',
    domain: 'atu.de'
  },
  {
    name: 'Dachträgerexperte',
    url: 'https://www.dachtraegerexperte.de/',
    description: 'Vollständiger Konfigurator für passgenaue Empfehlungen – für alle Fahrzeugmodelle.',
    domain: 'dachtraegerexperte.de'
  },
  {
    name: 'Transportsysteme24',
    url: 'https://www.transportsysteme24.de/',
    description: 'Konfigurator für Dachträger – maßgeschneiderte Empfehlungen basierend auf deinem Fahrzeug.',
    domain: 'transportsysteme24.de'
  },
  {
    name: 'Rameder',
    url: 'https://www.rameder.de/',
    description: 'Umfangreicher Konfigurator mit Fahrzeugauswahl über Marke, Modell und Baujahr.',
    domain: 'rameder.de'
  },
  {
    name: 'Dachbox.de',
    url: 'https://www.dachbox.de/',
    description: 'Spezialist für Dachboxen und Träger. Konfigurator mit Fahrzeugauswahl über Marke, Modell und Baujahr.',
    domain: 'dachbox.de'
  },
  {
    name: 'Bertelshofer',
    url: 'https://www.bertelshofer.com/',
    description: 'HSN/TSN-Eingabe möglich – HSN aus Feld 2.1 und die ersten drei Zeichen der TSN aus Feld 2.2.',
    domain: 'bertelshofer.com'
  },
  {
    name: 'Interpack24',
    url: 'https://www.interpack24.de/',
    description: 'Konfigurator für Dachträger mit passgenauen Empfehlungen für diverse Marken.',
    domain: 'interpack24.de'
  },
  {
    name: 'Scheibenwischer.com',
    url: 'https://www.scheibenwischer.com/',
    description: 'Zubehör-Spezialist mit Konfigurator für Dachträger – maßgeschneiderte Empfehlungen.',
    domain: 'scheibenwischer.com'
  }
];

const ConfiguratorList: React.FC = () => {
  return (
    <div className="animate-fade-in-up space-y-8">
      <section className="text-center max-w-3xl mx-auto space-y-4">
        <h2 className="text-3xl font-bold text-slate-900">Externe Konfiguratoren</h2>
        <p className="text-slate-600 leading-relaxed">
          Falls Sie in unserem Bestand nicht fündig wurden, helfen Ihnen diese externen Anbieter weiter. 
          Klicken Sie auf einen Anbieter, um dessen Konfigurator in einem neuen Tab zu öffnen.
        </p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {LINKS.map((link, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between hover:shadow-md transition-shadow duration-200">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-lg shrink-0">
                  {link.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 leading-tight">{link.name}</h3>
                  <span className="text-xs text-slate-400">{link.domain}</span>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-6 min-h-[60px]">
                {link.description}
              </p>
            </div>
            
            <a 
              href={link.url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="group flex items-center justify-center w-full py-2.5 px-4 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium text-sm hover:border-blue-500 hover:text-blue-600 transition-colors"
            >
              Zum Konfigurator
              <svg className="w-4 h-4 ml-2 text-slate-400 group-hover:text-blue-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        ))}
      </div>
      
      <div className="mt-8 p-4 bg-blue-50 rounded-lg text-center text-sm text-blue-800 border border-blue-100">
        Hinweis: Dies sind externe Links. Wir übernehmen keine Haftung für die Inhalte der verlinkten Seiten.
      </div>
    </div>
  );
};

export default ConfiguratorList;
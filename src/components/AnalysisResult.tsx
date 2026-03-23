import React from 'react';
import { RoofAnalysisResult, RoofType } from '../types';

interface AnalysisResultProps {
  result: RoofAnalysisResult;
  vehiclePhotoUrl?: string;
}

const AnalysisResult: React.FC<AnalysisResultProps> = ({ result, vehiclePhotoUrl }) => {
  // Helper to determine icon based on roof type
  const getIcon = (type: RoofType) => {
    switch (type) {
      case RoofType.OPEN_RAILS:
        return (
          // Visualisierung: Erhöhte Reling mit sichtbarem Abstand zum Dach (wie Seat Arona Bild)
          <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24">
            {/* Dachlinie (dezent grau) */}
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2 18c1.5-4 5-7 10-7s8.5 3 10 7" className="text-slate-300" />
            {/* Die Reling (blau, schwebend) */}
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 7h12" className="text-blue-600" />
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 7v4" className="text-blue-600" />
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 7v4" className="text-blue-600" />
          </svg>
        );
      case RoofType.FLUSH_RAILS:
        return (
          // Visualisierung: Integrierte Reling (liegt direkt auf)
          <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24">
            {/* Dachlinie */}
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2 18c1.5-4 5-7 10-7s8.5 3 10 7" className="text-slate-300" />
            {/* Die Reling (blau, direkt aufliegend) */}
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 10c2-1 4-1 6-1s4 0 6 1" className="text-blue-600" />
          </svg>
        );
      case RoofType.FIXED_POINTS:
        return (
          <svg className="w-14 h-14 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
             {/* Pfeile zeigen auf Punkte */}
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 8v2m4-2v2m4-2v2" className="opacity-50" />
          </svg>
        );
      case RoofType.NORMAL_ROOF:
        return (
          <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24">
             <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h18M3 16h18m-9-4v4" className="text-blue-600"/>
             <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2 9c2-2 6-3 10-3s8 1 10 3" className="text-slate-300" />
          </svg>
        );
      default:
        return (
          <svg className="w-14 h-14 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const confidencePercentage = Math.round(result.confidence * 100);
  const confidenceColor = confidencePercentage > 80 ? 'text-green-600' : confidencePercentage > 50 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8 shadow-sm animate-fade-in-up">
      {vehiclePhotoUrl && (
        <figure className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm mb-5">
          <img 
            src={vehiclePhotoUrl} 
            alt={`Fahrzeugreferenz für Dachtyp ${result.roofType}`} 
            className="w-full h-64 object-cover sm:h-72 md:h-80"
            loading="lazy"
          />
        </figure>
      )}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
        {/* Icon Container with clearer visual separation */}
        <div className="bg-white p-4 rounded-2xl shadow-sm shrink-0 border border-blue-100">
          {getIcon(result.roofType)}
        </div>
        
        <div className="flex-grow w-full text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-between gap-2 mb-2">
            <h3 className="text-lg font-bold text-slate-800">Ermittelter Dachtyp</h3>
            <div className="flex items-center text-xs font-medium bg-white/80 px-2 py-1 rounded border border-blue-100">
              <span className="text-slate-500">Deep Research Score:</span>
              <span className={`ml-1 font-bold ${confidenceColor}`}>{confidencePercentage}%</span>
            </div>
          </div>
          
          <p className="text-2xl font-bold text-blue-700 mb-2 tracking-tight">{result.roofType}</p>
          <p className="text-slate-700 mb-4 leading-relaxed">{result.reasoning}</p>
          
          {/* Technical Note */}
          <div className="bg-white/60 rounded-lg p-4 border border-blue-100 mb-4 text-left">
            <h4 className="flex items-center text-sm font-bold text-slate-800 mb-2">
              <svg className="w-4 h-4 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Technischer Hinweis zur Montage:
            </h4>
            <p className="text-slate-600 text-sm">
              {result.compatibleSystemsDescription}
            </p>
          </div>

          {/* Research Sources / Grounding */}
          {result.webSources && result.webSources.length > 0 && (
            <div className="border-t border-blue-200 pt-3 text-left">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                Online Quellen & Verifizierung
              </h4>
              <div className="flex flex-wrap gap-2">
                {result.webSources.map((source, index) => (
                  <a 
                    key={index} 
                    href={source.uri} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center text-xs bg-white text-blue-600 border border-blue-100 hover:border-blue-300 px-2 py-1 rounded transition-colors truncate max-w-[200px]"
                    title={source.title}
                  >
                    <span className="truncate mr-1">{source.title}</span>
                    <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalysisResult;
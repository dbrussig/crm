import React from 'react';
import { HistoryEntry } from '../types';

interface HistoryPageProps {
  history: HistoryEntry[];
  onLoadEntry: (entry: HistoryEntry) => void;
  onDeleteEntry: (id: string) => void;
}

const HistoryPage: React.FC<HistoryPageProps> = ({ history, onLoadEntry, onDeleteEntry }) => {
  
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200 border-dashed animate-fade-in-up">
        <span className="text-4xl mb-4">📜</span>
        <h3 className="text-lg font-bold text-slate-800">Kein Verlauf vorhanden</h3>
        <p className="text-slate-500 mt-2 text-center max-w-md">
          Sobald Sie Fahrzeugabfragen durchführen, erscheinen diese hier automatisch in Ihrer Historie.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <section className="text-center max-w-3xl mx-auto space-y-4">
        <h2 className="text-3xl font-bold text-slate-900">Suchverlauf</h2>
        <p className="text-slate-600 leading-relaxed">
          Historie Ihrer getätigten Abfragen. Nutzen Sie diese Liste, um schnell auf vergangene Fahrzeugkonfigurationen zuzugreifen.
        </p>
      </section>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Datum</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Kunde / Ref</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Foto</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Fahrzeug</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Notiz</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Aktionen</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {history.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {new Date(entry.timestamp).toLocaleDateString('de-DE', { 
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    {entry.vehicleData.customerName || <span className="text-slate-300 italic">-</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    {entry.vehiclePhotoUrl ? (
                      <div className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
                        <img 
                          src={entry.vehiclePhotoUrl} 
                          alt={`${entry.vehicleData.make} ${entry.vehicleData.model}`} 
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                    <div className="font-bold">{entry.vehicleData.make} {entry.vehicleData.model}</div>
                    <div className="text-xs text-slate-500">BJ: {entry.vehicleData.year} 
                        {entry.vehicleData.hsn && ` | ${entry.vehicleData.hsn}/${entry.vehicleData.tsn}`}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                    {entry.vehicleData.notes || <span className="text-slate-300 italic">-</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                        onClick={() => onLoadEntry(entry)}
                        className="text-blue-600 hover:text-blue-900 mr-4 font-bold inline-flex items-center"
                        title="Daten in Formular laden"
                    >
                        <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Laden
                    </button>
                    <button 
                        onClick={() => onDeleteEntry(entry.id)}
                        className="text-red-500 hover:text-red-700 inline-flex items-center"
                        title="Eintrag löschen"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HistoryPage;
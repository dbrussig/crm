import React, { useState } from 'react';
import { executeQuery } from '../services/sqliteService';

const SQLDebugPanel: React.FC = () => {
  const [query, setQuery] = useState('SELECT * FROM customers');
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleExecute = async () => {
    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const queryResults = await executeQuery(query);
      const rows = Array.isArray(queryResults.result)
        ? (queryResults.result as Record<string, unknown>[])
        : [];
      setResults(rows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const exampleQueries = [
    'SELECT * FROM customers',
    'SELECT COUNT(*) as count FROM customers',
    'SELECT name, email, company FROM customers ORDER BY name',
    "SELECT * FROM customers WHERE company IS NOT NULL",
    'SELECT * FROM customers WHERE salutation = "Herr"',
  ];

  return (
    <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-sm">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-slate-300">🔍 SQL Debug Console</h4>
        <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">SQLite</span>
      </div>

      <div className="space-y-2 mb-4">
        <label className="text-xs text-slate-400">Beispiel-Queries:</label>
        <div className="flex flex-wrap gap-2">
          {exampleQueries.map((example, index) => (
            <button
              key={index}
              onClick={() => setQuery(example)}
              className="text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded border border-slate-700"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-slate-400">SQL Query:</label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-20 bg-slate-800 text-slate-100 p-2 rounded border border-slate-700 focus:border-blue-500 focus:outline-none"
          placeholder="SELECT * FROM customers WHERE..."
        />
        <button
          onClick={handleExecute}
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white py-2 rounded font-medium"
        >
          {isLoading ? '⏳ Ausführen...' : '▶️ Query ausführen'}
        </button>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-900/50 border border-red-700 rounded">
          <div className="text-red-300 text-xs mb-1">❌ Fehler:</div>
          <div className="text-red-100 text-xs">{error}</div>
        </div>
      )}

      {results && (
        <div className="mt-3">
          <div className="text-xs text-slate-400 mb-2">
            {results.length} Ergebnis{results.length !== 1 ? 'se' : ''}
          </div>
          <div className="overflow-x-auto border border-slate-700 rounded">
            <table className="w-full text-xs">
              <thead className="bg-slate-800">
                {results.length > 0 && (
                  <tr>
                    {Object.keys(results[0]).map((key) => (
                      <th key={key} className="px-2 py-1 text-left border border-slate-700 text-slate-300">
                        {key}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {results.map((row, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-slate-800/50' : ''}>
                    {Object.values(row).map((value, cellIndex) => (
                      <td key={cellIndex} className="px-2 py-1 border border-slate-700 text-slate-300">
                        {String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SQLDebugPanel;

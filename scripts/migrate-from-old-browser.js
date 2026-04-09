/**
 * Migrationsscript: Daten aus alter IndexedDB exportieren
 * 
 * Nutzung:
 * 1. Starte die alte App (wenn möglich) unter localhost:3000
 * 2. Öffne diese Datei im Browser als Bookmarklet oder Console-Script
 * 3. Speichere das exportierte JSON
 * 4. Importiere in neuer App
 */

async function exportOldDatabase() {
  const DB_NAME = 'mietpark_crm_idb_v1';
  const STORE_NAME = 'kv';
  
  try {
    const req = indexedDB.open(DB_NAME);
    const db = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const data = await new Promise((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = async () => {
        const keys = req.result;
        const result = {};
        for (const key of keys) {
          const valueReq = store.get(key);
          result[key] = await new Promise((res) => {
            valueReq.onsuccess = () => res(valueReq.result);
          });
        }
        resolve(result);
      };
    });
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-backup-${Date.now()}.json`;
    a.click();
    
    console.log('✅ Export erfolgreich! Gespeicherte Keys:', Object.keys(data));
    return data;
  } catch (e) {
    console.error('❌ Export fehlgeschlagen:', e);
    throw e;
  }
}

// Auto-Export wenn als Script geladen
if (typeof window !== 'undefined') {
  window.exportCRMData = exportOldDatabase;
  console.log('CRM Export bereit. Führe aus mit: await exportCRMData()');
}

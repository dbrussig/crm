import { useEffect, useState } from 'react';
import { getRuntimeInfo, invokeBackend } from '../platform/runtime';

export function AppShell() {
  const [runtime, setRuntime] = useState('desktop');
  const [health, setHealth] = useState('Backend wird geprueft...');

  useEffect(() => {
    setRuntime(getRuntimeInfo());
    void invokeBackend<string>('healthcheck')
      .then((result) => setHealth(result))
      .catch(() => setHealth('Backend noch nicht verbunden'));
  }, []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <h1>Mietpark CRM</h1>
        <nav>
          <button>Kunden</button>
          <button>Vorgaenge</button>
          <button>Kalender</button>
          <button>Belege</button>
          <button>Einstellungen</button>
        </nav>
      </aside>
      <section className="content">
        <header className="hero">
          <span className="badge">Tauri 2 Desktop</span>
          <h2>Nahezu identische UI, aber mit nativer Daten- und Integrationsschicht</h2>
          <p>
            Dieses Geruest ersetzt den frueheren macOS-WebView-Ansatz durch eine eigenstaendige
            Desktop-Architektur mit React, Rust, SQLite und OAuth.
          </p>
        </header>

        <div className="panel-grid">
          <article className="panel">
            <h3>Laufzeit</h3>
            <p>{runtime}</p>
          </article>
          <article className="panel">
            <h3>Backend</h3>
            <p>{health}</p>
          </article>
          <article className="panel">
            <h3>Naechste Technik</h3>
            <p>SQLite, Google OAuth, Calendar Sync, verschluesselte Backups</p>
          </article>
        </div>
      </section>
    </main>
  );
}

import { useEffect, useMemo, useState } from 'react';
import type { Resource } from '../types';
import { listCalendarsWithClientId, type GoogleCalendarListEntry, listEventsWithClientId, type GoogleCalendarEvent } from '../services/googleCalendarService';
import { getAllResources } from '../services/sqliteService';
import { modifyResource } from '../services/resourceService';

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CalendarPanel(props: { clientId: string; enabled: boolean; onOpenSettings?: () => void }) {
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [days, setDays] = useState<number>(14);
  const [events, setEvents] = useState<GoogleCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignBusyId, setAssignBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const showError = (text: string) => setNotice({ tone: 'error', text });

  const canUse = props.enabled && Boolean(props.clientId?.trim());

  const resourceByCalendarId = useMemo(() => {
    const map = new Map<string, Resource>();
    for (const r of resources) {
      if (r.googleCalendarId) map.set(r.googleCalendarId, r);
    }
    return map;
  }, [resources]);

  async function loadCalendars() {
    if (!canUse) return;
    setLoading(true);
    setError(null);
    try {
      const [cals, res] = await Promise.all([
        listCalendarsWithClientId({ clientId: props.clientId }),
        getAllResources(),
      ]);
      setCalendars(cals);
      setResources(res);
      if (!selectedCalendarId) {
        const firstResourceCal = res.find((r) => r.googleCalendarId)?.googleCalendarId;
        const pick = firstResourceCal || cals.find((c) => c.primary)?.id || cals[0]?.id || '';
        setSelectedCalendarId(pick);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents(calendarId: string, rangeDays: number) {
    if (!canUse || !calendarId) return;
    setLoading(true);
    setError(null);
    try {
      const start = new Date();
      const end = new Date(start.getTime() + Math.max(1, rangeDays) * 24 * 60 * 60 * 1000);
      const ev = await listEventsWithClientId({
        clientId: props.clientId,
        calendarId,
        timeMin: start,
        timeMax: end,
        maxResults: 250,
      });
      setEvents(ev);
    } catch (e: any) {
      setError(e?.message || String(e));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCalendars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse]);

  useEffect(() => {
    if (!selectedCalendarId) return;
    void loadEvents(selectedCalendarId, days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCalendarId, days, canUse]);

  const selectedLabel = (() => {
    if (!selectedCalendarId) return '';
    const r = resourceByCalendarId.get(selectedCalendarId);
    if (r) return `${r.name} (${r.type})`;
    const c = calendars.find((x) => x.id === selectedCalendarId);
    return c?.summary || selectedCalendarId;
  })();

  const googleCalendarUrl = selectedCalendarId
    ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(selectedCalendarId)}`
    : '';

  return (
    <div className="max-w-7xl">
      {notice && (
        <div
          className={[
            'mb-4 rounded-xl border px-4 py-3 text-sm whitespace-pre-line',
            notice.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-slate-200 bg-white text-slate-800',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-3">
            <div>{notice.text}</div>
            <button
              className="text-slate-600 hover:text-slate-900"
              onClick={() => setNotice(null)}
              aria-label="Hinweis schließen"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Kalender</h2>
          <p className="text-sm text-slate-600">Google Kalender anzeigen (Ressourcen-Kalender und eigene Kalender).</p>
        </div>
        <button
          className="px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
          onClick={() => loadCalendars()}
          disabled={!canUse || loading}
          title="Kalenderliste und Ressourcen neu laden"
        >
          Aktualisieren
        </button>
      </div>

      {!canUse && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-amber-900">Kalender noch nicht verbunden</div>
          <div className="text-sm text-amber-800 mt-1">
            Verbinde zuerst Google OAuth, damit Verfügbarkeiten und Termine geladen werden können.
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {props.onOpenSettings ? (
              <button
                type="button"
                className="px-3 py-2 rounded-md bg-amber-600 text-white text-sm hover:bg-amber-700"
                onClick={props.onOpenSettings}
              >
                Jetzt in Einstellungen verbinden
              </button>
            ) : null}
            <span className="text-xs text-amber-700">
              Danach hier mit „Aktualisieren“ Kalender laden.
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-sm font-semibold text-slate-800 mb-2">Ressourcen</div>
          <div className="text-xs text-slate-500 mb-3">Schnellauswahl deiner Mietgeraete-Kalender.</div>
          <div className="space-y-2 max-h-[55vh] overflow-auto">
            {resources.filter((r) => r.isActive && r.googleCalendarId).map((r) => (
              <button
                key={r.id}
                className={[
                  'w-full text-left px-3 py-2 rounded-md border text-sm transition',
                  selectedCalendarId === r.googleCalendarId ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50',
                ].join(' ')}
                onClick={() => setSelectedCalendarId(r.googleCalendarId)}
                disabled={!canUse || loading}
              >
                <div className="font-medium text-slate-900">{r.name}</div>
                <div className="text-xs text-slate-600">{r.type}</div>
              </button>
            ))}
            {resources.filter((r) => r.isActive && r.googleCalendarId).length === 0 && (
              <div className="text-sm text-slate-600">Keine Ressourcen mit Kalender-Referenz konfiguriert (siehe Vermietungsgegenstände).</div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">{selectedLabel || 'Kalender auswählen'}</div>
              {selectedCalendarId && (
                <div className="text-xs text-slate-500 truncate">{selectedCalendarId}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600 flex items-center gap-2">
                Zeitraum
                <select
                  className="px-2 py-1 rounded-md border border-slate-200 bg-white text-sm"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value || 14))}
                  disabled={!canUse || loading}
                  aria-label="Zeitraum in Tagen"
                >
                  <option value={7}>7 Tage</option>
                  <option value={14}>14 Tage</option>
                  <option value={30}>30 Tage</option>
                  <option value={60}>60 Tage</option>
                </select>
              </label>
              {googleCalendarUrl && (
                <a
                  className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                  href={googleCalendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  In Google Calendar öffnen
                </a>
              )}
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs text-slate-600">Kalender</label>
            <select
              className="mt-1 w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm"
              value={selectedCalendarId}
              onChange={(e) => setSelectedCalendarId(e.target.value)}
              disabled={!canUse || loading}
              aria-label="Kalender auswählen"
            >
              <option value="">Bitte auswählen…</option>
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.primary ? '[Primary] ' : '')}{c.summary || c.id}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <div className="text-sm font-semibold text-slate-800">Termine (nächste {days} Tage)</div>
            <div className="text-xs text-slate-500 mt-1">Anzeige ist eine Liste (Agenda). Bearbeiten bitte in Google Calendar.</div>

            {loading ? (
              <div className="mt-3 text-sm text-slate-600">Lade…</div>
            ) : events.length === 0 ? (
              <div className="mt-3 text-sm text-slate-600">Keine Termine im Zeitraum gefunden.</div>
            ) : (
              <div className="mt-3 space-y-2 max-h-[55vh] overflow-auto">
                {events.map((e) => (
                  <div key={e.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{e.summary || '(ohne Titel)'}</div>
                        <div className="text-xs text-slate-600">
                          {fmtDateTime(e.start)} bis {fmtDateTime(e.end)}
                        </div>
                        {e.status && e.status !== 'confirmed' && (
                          <div className="text-xs text-amber-700 mt-1">Status: {e.status}</div>
                        )}
                        {e.description && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-slate-600 select-none">Beschreibung</summary>
                            <div className="mt-1 text-xs text-slate-700 whitespace-pre-wrap">{e.description}</div>
                          </details>
                        )}
                      </div>
                      {e.htmlLink && (
                        <a
                          className="shrink-0 px-3 py-2 rounded-md border border-slate-200 text-sm hover:bg-slate-50"
                          href={e.htmlLink}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Öffnen
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <details className="mt-4 rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800 select-none">
              Kalender-Zuordnung pflegen (Vermietungsgegenstände)
            </summary>
            <div className="mt-3 text-xs text-slate-500">
              Hier kannst du Ressourcen direkt mit einem Google Kalender verknüpfen (wichtig für Verfügbarkeit und automatische Termine bei Auftrag bestätigt).
            </div>
            <div className="mt-3 space-y-2">
              {resources
                .filter((r) => r.isActive)
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{r.name}</div>
                      <div className="text-xs text-slate-600 truncate">{r.type}</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <select
                        className="px-2 py-1 rounded-md border border-slate-200 bg-white text-sm max-w-[360px]"
                        value={r.googleCalendarId || ''}
                        disabled={!canUse || loading || assignBusyId === r.id}
                        onChange={async (e) => {
                          const nextId = e.target.value;
                          setAssignBusyId(r.id);
                          try {
                            await modifyResource(r.id, { googleCalendarId: nextId });
                            setResources((prev) => prev.map((x) => (x.id === r.id ? { ...x, googleCalendarId: nextId } : x)));
                          } catch (err: any) {
                            showError('Konnte Kalender nicht speichern: ' + (err?.message || String(err)));
                          } finally {
                            setAssignBusyId(null);
                          }
                        }}
                        aria-label={`Kalender zuordnen fuer ${r.name}`}
                        title="Kalender fuer diese Ressource setzen"
                      >
                        <option value="">— kein Kalender —</option>
                        {calendars.map((c) => (
                          <option key={c.id} value={c.id}>
                            {(c.primary ? '[Primary] ' : '')}{c.summary || c.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              {resources.filter((r) => r.isActive).length === 0 && (
                <div className="text-sm text-slate-600">Keine aktiven Ressourcen vorhanden.</div>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

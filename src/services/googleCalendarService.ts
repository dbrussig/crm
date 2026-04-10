import type { AvailabilityCheckResult } from '../types';
import { googleFetchJson } from './googleAuthService';
import { requireScope } from './googleOAuthService';

function getDefaultClientId(): string {
  return (
    localStorage.getItem('mietpark_google_oauth_client_id') ||
    (import.meta as any).env?.VITE_GOOGLE_OAUTH_CLIENT_ID ||
    ''
  );
}

export type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
};

export type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  start: string; // ISO dateTime
  end: string; // ISO dateTime
  status?: 'confirmed' | 'tentative' | 'cancelled' | string;
  htmlLink?: string;
};

type CalendarListResponse = {
  items?: Array<{
    id: string;
    summary?: string;
    primary?: boolean;
    accessRole?: 'owner' | 'writer' | 'reader' | 'freeBusyReader';
  }>;
  nextPageToken?: string;
};

type FreeBusyResponse = {
  calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
};

type EventsListResponse = {
  items?: Array<{
    id: string;
    status?: string;
    summary?: string;
    description?: string;
    htmlLink?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  }>;
  nextPageToken?: string;
};

export async function listCalendarsWithClientId(opts: { clientId: string }): Promise<GoogleCalendarListEntry[]> {
  const token = await requireScope(opts.clientId, 'calendar');

  const all: GoogleCalendarListEntry[] = [];
  let pageToken: string | undefined = undefined;

  for (let i = 0; i < 20; i++) {
    const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const resp = await googleFetchJson<CalendarListResponse>({ url: url.toString(), token });
    for (const item of resp.items || []) {
      if (!item?.id) continue;
      all.push({
        id: item.id,
        summary: item.summary,
        primary: Boolean(item.primary),
        accessRole: item.accessRole,
      });
    }
    if (!resp.nextPageToken) break;
    pageToken = resp.nextPageToken;
  }

  // Deterministic ordering: primary first, then by summary/id
  all.sort((a, b) => {
    const ap = a.primary ? 1 : 0;
    const bp = b.primary ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const as = (a.summary || a.id).toLowerCase();
    const bs = (b.summary || b.id).toLowerCase();
    if (as < bs) return -1;
    if (as > bs) return 1;
    return 0;
  });

  return all;
}

export async function listCalendars(): Promise<GoogleCalendarListEntry[]> {
  const clientId = getDefaultClientId();
  if (!clientId) throw new Error('Google Client ID fehlt');
  return listCalendarsWithClientId({ clientId });
}

export async function checkAvailabilityWithClientId(
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  opts: { clientId: string }
): Promise<AvailabilityCheckResult> {
  const token = await requireScope(opts.clientId, 'calendar');
  const body = {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    items: [{ id: calendarId }],
  };

  const resp = await googleFetchJson<FreeBusyResponse>({
    url: 'https://www.googleapis.com/calendar/v3/freeBusy',
    method: 'POST',
    token,
    body,
  });

  const busy = resp.calendars?.[calendarId]?.busy || [];
  return {
    resourceId: calendarId,
    resourceName: calendarId,
    isAvailable: busy.length === 0,
    busyRanges: busy,
  };
}

// Legacy signature used by components: checkAvailability(calendarId, timeMin, timeMax)
export async function checkAvailability(
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<AvailabilityCheckResult> {
  const clientId = getDefaultClientId();
  if (!clientId) {
    return { resourceId: calendarId, resourceName: calendarId, isAvailable: false, error: 'Google Client ID fehlt' };
  }
  return checkAvailabilityWithClientId(calendarId, timeMin, timeMax, { clientId });
}

export async function listEventsWithClientId(opts: {
  clientId: string;
  calendarId: string;
  timeMin: Date;
  timeMax: Date;
  maxResults?: number;
}): Promise<GoogleCalendarEvent[]> {
  const token = await requireScope(opts.clientId, 'calendar');
  const all: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined = undefined;
  const max = Math.max(1, Math.min(250, Number(opts.maxResults || 250)));

  for (let i = 0; i < 20; i++) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events`);
    url.searchParams.set('timeMin', opts.timeMin.toISOString());
    url.searchParams.set('timeMax', opts.timeMax.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', String(max));
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const resp = await googleFetchJson<EventsListResponse>({ url: url.toString(), token });
    for (const it of resp.items || []) {
      if (!it?.id) continue;
      const start = it.start?.dateTime || (it.start?.date ? `${it.start.date}T00:00:00` : '');
      const end = it.end?.dateTime || (it.end?.date ? `${it.end.date}T00:00:00` : '');
      if (!start || !end) continue;
      all.push({
        id: it.id,
        summary: it.summary,
        description: it.description,
        start,
        end,
        status: it.status,
        htmlLink: it.htmlLink,
      });
    }
    if (!resp.nextPageToken) break;
    pageToken = resp.nextPageToken;
  }

  return all;
}

export async function createEvent(
  calendarId: string,
  event: {
    summary: string;
    description?: string;
    start: Date;
    end: Date;
    visibility?: 'default' | 'public' | 'private' | 'confidential';
    transparency?: 'opaque' | 'transparent';
  },
  opts: { clientId: string }
): Promise<string> {
  const token = await requireScope(opts.clientId, 'calendar');
  const body = {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.start.toISOString() },
    end: { dateTime: event.end.toISOString() },
    // Busy + private by default for rentals.
    visibility: event.visibility || 'private',
    transparency: event.transparency || 'opaque',
  };
  const resp = await googleFetchJson<{ id: string }>({
    url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    method: 'POST',
    token,
    body,
  });
  return resp.id;
}

// Legacy wrapper: createEvent(calendarId, event)
export async function createEventLegacy(
  calendarId: string,
  event: {
    summary: string;
    description?: string;
    start: Date;
    end: Date;
    visibility?: 'default' | 'public' | 'private' | 'confidential';
    transparency?: 'opaque' | 'transparent';
  }
): Promise<string> {
  const clientId = getDefaultClientId();
  if (!clientId) throw new Error('Google Client ID fehlt');
  return createEvent(calendarId, event, { clientId });
}

export async function deleteEvent(
  calendarId: string,
  eventId: string,
  opts: { clientId: string }
): Promise<void> {
  const token = await requireScope(opts.clientId, 'calendar');
  await googleFetchJson<any>({
    url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    method: 'DELETE',
    token,
  });
}

export async function deleteEventLegacy(calendarId: string, eventId: string): Promise<void> {
  const clientId = getDefaultClientId();
  if (!clientId) throw new Error('Google Client ID fehlt');
  return deleteEvent(calendarId, eventId, { clientId });
}

export async function updateEvent(
  calendarId: string,
  eventId: string,
  event: {
    summary?: string;
    description?: string;
    start: Date;
    end: Date;
    visibility?: 'default' | 'public' | 'private' | 'confidential';
    transparency?: 'opaque' | 'transparent';
  },
  opts: { clientId: string }
): Promise<void> {
  const token = await requireScope(opts.clientId, 'calendar');
  const body = {
    ...(event.summary ? { summary: event.summary } : {}),
    ...(event.description ? { description: event.description } : {}),
    start: { dateTime: event.start.toISOString() },
    end: { dateTime: event.end.toISOString() },
    ...(event.visibility ? { visibility: event.visibility } : {}),
    ...(event.transparency ? { transparency: event.transparency } : {}),
  };
  await googleFetchJson<any>({
    url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    method: 'PATCH',
    token,
    body,
  });
}

export async function updateEventLegacy(
  calendarId: string,
  eventId: string,
  event: {
    summary?: string;
    description?: string;
    start: Date;
    end: Date;
    visibility?: 'default' | 'public' | 'private' | 'confidential';
    transparency?: 'opaque' | 'transparent';
  }
): Promise<void> {
  const clientId = getDefaultClientId();
  if (!clientId) throw new Error('Google Client ID fehlt');
  return updateEvent(calendarId, eventId, event, { clientId });
}

export async function testGoogleCalendarConnection(opts: { clientId: string }): Promise<boolean> {
  try {
    const token = await requireScope(opts.clientId, 'calendar');
    await googleFetchJson<any>({ url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', token });
    return true;
  } catch {
    return false;
  }
}

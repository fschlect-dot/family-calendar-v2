/**
 * feeds.ts — fetch ICS feeds via /api/ics and parse with ical.js
 */
import ICAL from 'ical.js';
import type { CalEvent, FeedName } from './types';

const FEED_NAMES: FeedName[] = ['fred_custody', 'fred_outlook', 'charissa_custody'];
const DAYS_PAST   = 365;
const DAYS_FUTURE = 730;

// Custody feeds: only show overnight indicators, skip schedule noise
const CUSTODY_PATTERNS: Partial<Record<FeedName, RegExp>> = {
  fred_custody:     /FWS/i,
  charissa_custody: /Option A|Regular Schedule/i,
};

// ── Public ─────────────────────────────────────────────────────────────────

export async function loadAllFeeds(): Promise<CalEvent[]> {
  const results = await Promise.allSettled(
    FEED_NAMES.map((name) => fetchAndParse(name))
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

// ── Fetch ──────────────────────────────────────────────────────────────────

async function fetchAndParse(feedName: FeedName): Promise<CalEvent[]> {
  try {
    const res = await fetch(`/api/ics?feed=${encodeURIComponent(feedName)}`);
    console.log(`[feeds] ${feedName} http=${res.status}`);
    if (res.status === 204 || !res.ok) return [];
    const text = await res.text();
    console.log(`[feeds] ${feedName} body_len=${text.length} has_vcal=${text.includes('BEGIN:VCALENDAR')}`);
    if (!text || !text.includes('BEGIN:VCALENDAR')) return [];
    const events = parseICS(text, feedName);
    console.log(`[feeds] ${feedName} parsed=${events.length} events`);
    return events;
  } catch (err) {
    console.warn(`[feeds] ${feedName} error:`, err);
    return [];
  }
}

// ── Parse ──────────────────────────────────────────────────────────────────

function icalToLocalDate(icalTime: ICAL.Time): Date {
  if (icalTime.isDate) {
    return new Date(icalTime.year, icalTime.month - 1, icalTime.day, 0, 0, 0, 0);
  }
  return icalTime.toJSDate();
}

function detectAllDay(event: ICAL.Event, vevent: ICAL.Component): boolean {
  if (event.startDate.isDate) return true;
  const dtstart = vevent.getFirstProperty('dtstart');
  if (dtstart) {
    const vParam = dtstart.getParameter('value');
    if (typeof vParam === 'string' && vParam.toUpperCase() === 'DATE') return true;
  }
  return false;
}

function parseICS(text: string, feedName: FeedName): CalEvent[] {
  const events: CalEvent[] = [];
  const isCustodyFeed = feedName in CUSTODY_PATTERNS;

  const now        = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DAYS_PAST);
  const rangeEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_FUTURE);

  let jcalData: unknown[];
  try {
    jcalData = ICAL.parse(text);
  } catch (e) {
    console.warn(`ICS parse error for ${feedName}:`, e);
    return [];
  }

  const comp    = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent);
      if (!event.summary || !event.startDate) continue;

      const title = event.summary.trim();
      const uid   = event.uid || `${feedName}_${Math.random()}`;

      // Filter custody feeds to overnight indicators only
      if (isCustodyFeed) {
        const pattern = CUSTODY_PATTERNS[feedName]!;
        if (!pattern.test(title)) {
          console.log(`[feeds] ${feedName} SKIP: "${title}"`);
          continue;
        }
        console.log(`[feeds] ${feedName} MATCH: "${title}"`);
      }

      let isAllDay = detectAllDay(event, vevent);
      // Custody events are always all-day background blocks
      if (isCustodyFeed) isAllDay = true;

      if (event.isRecurring()) {
        const origStart  = icalToLocalDate(event.startDate);
        const origEnd    = event.endDate
          ? icalToLocalDate(event.endDate)
          : new Date(origStart.getTime() + 86_400_000);
        const durationMs = origEnd.getTime() - origStart.getTime();

        const iter = event.iterator();
        let next: ICAL.Time | null;
        while ((next = iter.next())) {
          const start = icalToLocalDate(next);
          if (start > rangeEnd) break;
          const end = new Date(start.getTime() + durationMs);
          if (end < rangeStart) continue;

          events.push({ id: `${uid}_${next.toUnixTime()}`, title, start, end, allDay: isAllDay, feed: feedName });
        }
      } else {
        const start = icalToLocalDate(event.startDate);
        const end   = event.endDate
          ? icalToLocalDate(event.endDate)
          : new Date(start.getTime() + (isAllDay ? 86_400_000 : 3_600_000));

        if (start <= rangeEnd && end >= rangeStart) {
          events.push({ id: uid, title, start, end, allDay: isAllDay, feed: feedName });
        }
      }
    } catch {
      // skip malformed events
    }
  }

  return events;
}

import ICAL from 'ical.js';
import type { CalEvent, FeedName } from './types';

const FEED_NAMES: FeedName[] = ['fred_custody', 'fred_outlook', 'charissa_custody'];
const DAYS_PAST   = 365;
const DAYS_FUTURE = 730;

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
    if (res.status === 204 || !res.ok) return [];
    const text = await res.text();
    if (!text || !text.includes('BEGIN:VCALENDAR')) return [];
    return parseICS(text, feedName);
  } catch (err) {
    console.warn(`[feeds] ${feedName} error:`, err);
    return [];
  }
}

// ── Parse helpers ──────────────────────────────────────────────────────────

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

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Generate one all-day CalEvent per "overnight" that the custody event covers.
 *
 * Day D is an overnight iff the child slept there, meaning the event reaches
 * at least to midnight between D and D+1, i.e. event.end >= startOf(D+1).
 *
 * Using >= (not >) handles both cases correctly:
 *   • All-day events: iCal DTEND is exclusive (e.g. DTEND=May18 means last day
 *     is May17). end >= startOf(May18) is true, so May17 is included. ✓
 *   • Timed events (e.g. Mon 6AM → Wed 9AM): Wed 9AM >= Wed 0AM → Tue overnight ✓
 *     Wed 9AM >= Thu 0AM → false → Wed NOT highlighted ✓
 */
function generateOvernights(
  uid: string,
  title: string,
  start: Date,
  end: Date,
  feedName: FeedName,
  rangeStart: Date,
  rangeEnd: Date,
): CalEvent[] {
  const nights: CalEvent[] = [];
  let day = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  while (true) {
    const nextDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    // event.end < nextDay means it doesn't reach midnight — no overnight for this day
    if (end < nextDay) break;

    if (day >= rangeStart && day <= rangeEnd) {
      nights.push({
        id: `${uid}_night_${localDateStr(day)}`,
        title,
        start: new Date(day),
        end: nextDay,
        allDay: true,
        feed: feedName,
      });
    }
    day = nextDay;
  }

  return nights;
}

// ── Main parser ────────────────────────────────────────────────────────────

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

      // Custody feeds: filter to overnight-indicator events and generate per-night records
      if (isCustodyFeed) {
        const pattern = CUSTODY_PATTERNS[feedName]!;
        if (!pattern.test(title)) continue;

        if (event.isRecurring()) {
          const origStart  = icalToLocalDate(event.startDate);
          const origEnd    = event.endDate
            ? icalToLocalDate(event.endDate)
            : new Date(origStart.getTime() + 86_400_000);
          const durationMs = origEnd.getTime() - origStart.getTime();

          const iter = event.iterator();
          let next: ICAL.Time | null;
          while ((next = iter.next())) {
            const evStart = icalToLocalDate(next);
            if (evStart > rangeEnd) break;
            const evEnd = new Date(evStart.getTime() + durationMs);
            if (evEnd < rangeStart) continue;
            events.push(...generateOvernights(uid, title, evStart, evEnd, feedName, rangeStart, rangeEnd));
          }
        } else {
          const evStart = icalToLocalDate(event.startDate);
          const evEnd   = event.endDate
            ? icalToLocalDate(event.endDate)
            : new Date(evStart.getTime() + 86_400_000);
          events.push(...generateOvernights(uid, title, evStart, evEnd, feedName, rangeStart, rangeEnd));
        }
        continue;
      }

      // Non-custody events: standard handling
      const isAllDay = detectAllDay(event, vevent);

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

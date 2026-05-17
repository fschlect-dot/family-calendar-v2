'use client';

import { useEffect, useRef, useState } from 'react';
import type { CalEvent, EventType, FamilyEvent, ViewMode } from '@/lib/types';
import { loadAllFeeds } from '@/lib/feeds';
import { getEventsByDateRange, saveEvent, deleteEvent } from '@/lib/supabase';
import { eventTypeConfig } from '@/lib/eventTypes';
import EventChip from './EventChip';
import EventForm from './EventForm';
import DayDetailModal from './DayDetailModal';
import LoginForm from './LoginForm';

// ── Date helpers ───────────────────────────────────────────────────────────

function dayOffset(d: Date) { return (d.getDay() + 6) % 7; }
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function weekStart(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - dayOffset(r));
  return r;
}
function todayMidnight(): Date { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function eventsForDay(day: Date, events: CalEvent[]): CalEvent[] {
  const s = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const e = new Date(s.getTime() + 86_400_000);
  return events.filter(ev => ev.start < e && ev.end > s);
}
function custodyFeedForDay(evts: CalEvent[]): string | null {
  return evts.find(e => e.allDay && (e.feed === 'fred_custody' || e.feed === 'charissa_custody'))?.feed ?? null;
}
function isCustodyBg(e: CalEvent) {
  return e.allDay && (e.feed === 'fred_custody' || e.feed === 'charissa_custody');
}
function fmt12(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Colors ────────────────────────────────────────────────────────────────

const CUSTODY_BG: Record<string, string> = {
  fred_custody:     'bg-blue-50  dark:bg-blue-950/40',
  charissa_custody: 'bg-green-50 dark:bg-green-950/40',
};

const KIDS = new Set<PersonKey>(['henry', 'george', 'mabel', 'everett']);

const KIDS_CUSTODY_COLOR: Partial<Record<PersonKey, string>> = {
  henry:   '#3b82f6',
  george:  '#10b981',
  mabel:   '#ec4899',
  everett: '#f43f5e',
};

// ── Feed config ────────────────────────────────────────────────────────────

type FeedName = 'fred_custody' | 'charissa_custody' | 'fred_outlook';

const FEEDS: { name: FeedName; label: string; color: string }[] = [
  { name: 'fred_custody',     label: 'Henry/George Overnight',  color: 'bg-blue-500'  },
  { name: 'charissa_custody', label: 'Mabel/Everett Overnight', color: 'bg-pink-500'  },
  { name: 'fred_outlook',     label: "Fred's Calendar",         color: 'bg-gray-600'  },
];

// ── Person config ──────────────────────────────────────────────────────────

const PERSONS = [
  { key: 'henry',    label: 'Henry'    },
  { key: 'george',   label: 'George'   },
  { key: 'mabel',    label: 'Mabel'    },
  { key: 'everett',  label: 'Everett'  },
  { key: 'fred',     label: 'Fred'     },
  { key: 'charissa', label: 'Charissa' },
  { key: 'dinner',   label: 'Dinner'   },
  { key: 'all',      label: 'All'      },
] as const;

type PersonKey = typeof PERSONS[number]['key'];

// People available for filtering (not dinner/all)
const FILTER_PEOPLE = PERSONS.filter(p => p.key !== 'dinner' && p.key !== 'all');

// All event types for the filter
const FILTER_TYPES = Object.entries(eventTypeConfig) as [EventType, typeof eventTypeConfig[EventType]][];

const ROW_HEADER_CLS: Record<PersonKey, string> = {
  henry:    'bg-blue-100   text-blue-900   border-blue-200   dark:bg-blue-900/40   dark:text-blue-200   dark:border-blue-800',
  george:   'bg-green-100  text-green-900  border-green-200  dark:bg-green-900/40  dark:text-green-200  dark:border-green-800',
  mabel:    'bg-pink-100   text-pink-900   border-pink-200   dark:bg-pink-900/40   dark:text-pink-200   dark:border-pink-800',
  everett:  'bg-rose-100   text-rose-900   border-rose-200   dark:bg-rose-900/40   dark:text-rose-200   dark:border-rose-800',
  fred:     'bg-yellow-100 text-yellow-900 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-200 dark:border-yellow-800',
  charissa: 'bg-cyan-100   text-cyan-900   border-cyan-200   dark:bg-cyan-900/40   dark:text-cyan-200   dark:border-cyan-800',
  dinner:   'bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-800',
  all:      'bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-800',
};

const CELL_BG_CLS: Record<PersonKey, string> = {
  henry:    'bg-blue-50    dark:bg-blue-950/20',
  george:   'bg-green-50   dark:bg-green-950/20',
  mabel:    'bg-pink-50    dark:bg-pink-950/20',
  everett:  'bg-rose-50    dark:bg-rose-950/20',
  fred:     'bg-yellow-100 dark:bg-yellow-900/30',
  charissa: 'bg-cyan-100   dark:bg-cyan-900/30',
  dinner:   'bg-gray-50    dark:bg-gray-900/30',
  all:      'bg-purple-50  dark:bg-purple-950/20',
};

// ── Event filtering per cell ───────────────────────────────────────────────

function familyEventsForCell(
  personKey: PersonKey,
  dateStr: string,
  events: FamilyEvent[],
  enabledPeople: Set<PersonKey>,
  enabledTypes: Set<EventType>,
): FamilyEvent[] {
  return events.filter(ev => {
    if (ev.start_date > dateStr || ev.end_date < dateStr) return false;

    // Dinner row: only dinner events, filtered by type toggle
    if (personKey === 'dinner') {
      if (enabledTypes.size > 0 && !enabledTypes.has('dinner')) return false;
      return ev.event_type === 'dinner';
    }

    // Non-dinner rows: never show dinner events
    if (ev.event_type === 'dinner') return false;

    // 'all' row: show general (no-people) events
    if (personKey === 'all') {
      if (!ev.people || ev.people.length === 0) {
        if (enabledTypes.size > 0 && !enabledTypes.has(ev.event_type as EventType)) return false;
        return true;
      }
      return false;
    }

    // Person filter (if active, this person must be enabled)
    if (enabledPeople.size > 0 && !enabledPeople.has(personKey)) return false;

    // Type filter
    if (enabledTypes.size > 0 && !enabledTypes.has(ev.event_type as EventType)) return false;

    // Person match
    return ev.people?.includes(personKey) ?? false;
  });
}

function icsEventsForPersonDay(personKey: PersonKey, day: Date, allEvents: CalEvent[], enabledFeeds: Set<FeedName>): CalEvent[] {
  const dayEvts = eventsForDay(day, allEvents).filter(e => enabledFeeds.has(e.feed as FeedName));
  if (personKey === 'henry'  || personKey === 'george')  return dayEvts.filter(e => e.allDay && e.feed === 'fred_custody');
  if (personKey === 'mabel'  || personKey === 'everett') return dayEvts.filter(e => e.allDay && e.feed === 'charissa_custody');
  return [];
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Calendar() {
  const [currentUser,  setCurrentUser]  = useState<string | null>(null);
  const [view,         setView]         = useState<ViewMode>('week');
  const [current,      setCurrent]      = useState(new Date());
  const [icsEvents,    setIcsEvents]    = useState<CalEvent[]>([]);
  const [familyEvents, setFamilyEvents] = useState<FamilyEvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [dayModal,     setDayModal]     = useState<Date | null>(null);
  const [editingEvent, setEditingEvent] = useState<FamilyEvent | null>(null);
  const [defaultDate,  setDefaultDate]  = useState<string | undefined>();

  // Custody feed toggles
  const [enabledFeeds, setEnabledFeeds] = useState<Set<FeedName>>(
    new Set(['fred_custody', 'charissa_custody', 'fred_outlook'])
  );
  // People filter (empty = show all)
  const [enabledPeople, setEnabledPeople] = useState<Set<PersonKey>>(new Set());
  // Event type filter (empty = show all)
  const [enabledTypes, setEnabledTypes] = useState<Set<EventType>>(new Set());

  const today = todayMidnight();

  // ── Auth ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const stored = localStorage.getItem('calUser');
    if (stored) setCurrentUser(stored);
  }, []);

  // ── Persist filters ───────────────────────────────────────────────────────

  useEffect(() => {
    const stored = localStorage.getItem('calFilters');
    if (!stored) return;
    try {
      const { people, types, feeds } = JSON.parse(stored);
      if (people) setEnabledPeople(new Set<PersonKey>(people));
      if (types)  setEnabledTypes(new Set<EventType>(types));
      if (feeds)  setEnabledFeeds(new Set<FeedName>(feeds));
    } catch { /* ignore corrupt data */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('calFilters', JSON.stringify({
      people: [...enabledPeople],
      types:  [...enabledTypes],
      feeds:  [...enabledFeeds],
    }));
  }, [enabledPeople, enabledTypes, enabledFeeds]);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    const now        = new Date();
    const rangeStart = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 365));
    const rangeEnd   = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 730));
    Promise.allSettled([loadAllFeeds(), getEventsByDateRange(rangeStart, rangeEnd)])
      .then(([icsResult, eventsResult]) => {
        if (icsResult.status    === 'fulfilled') setIcsEvents(icsResult.value);
        else console.warn('[calendar] ICS failed:', icsResult.reason);
        if (eventsResult.status === 'fulfilled') setFamilyEvents(eventsResult.value);
        else console.warn('[calendar] Events failed:', eventsResult.reason);
      })
      .finally(() => setLoading(false));
  }, [currentUser]);

  // ── Event CRUD ────────────────────────────────────────────────────────────

  async function handleSaveEvent(
    payload: Omit<FamilyEvent, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ) {
    const saved = await saveEvent(payload);
    setFamilyEvents(prev =>
      [...prev.filter(e => e.id !== saved.id), saved]
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
    );
  }

  async function handleDeleteEvent(id: string) {
    await deleteEvent(id);
    setFamilyEvents(prev => prev.filter(e => e.id !== id));
  }

  async function handleQuickSave(title: string, personKey: PersonKey, dateStr: string) {
    const isDinner = personKey === 'dinner';
    try {
      const saved = await saveEvent({
        user_id:     currentUser,
        title,
        start_date:  dateStr,
        end_date:    dateStr,
        event_type:  isDinner ? 'dinner' : 'other',
        people:      isDinner ? [] : [personKey],
        start_time:  isDinner ? '18:00' : null,
        end_time:    null,
        location:    null,
        description: null,
      });
      setFamilyEvents(prev =>
        [...prev, saved].sort((a, b) => a.start_date.localeCompare(b.start_date))
      );
      // Open edit form with the new event
      setEditingEvent(saved);
      setDefaultDate(undefined);
    } catch (err) {
      console.warn('[calendar] quick-save failed:', err);
    }
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function goPrev() {
    setCurrent(c => view === 'month'
      ? new Date(c.getFullYear(), c.getMonth() - 1, 1)
      : addDays(c, -7));
  }
  function goNext() {
    setCurrent(c => view === 'month'
      ? new Date(c.getFullYear(), c.getMonth() + 1, 1)
      : addDays(c, 7));
  }

  function toggleFeed(f: FeedName) {
    setEnabledFeeds(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n; });
  }
  function togglePerson(p: PersonKey) {
    setEnabledPeople(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n; });
  }
  function toggleType(t: EventType) {
    setEnabledTypes(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });
  }
  function clearFilters() {
    setEnabledPeople(new Set());
    setEnabledTypes(new Set());
    setEnabledFeeds(new Set(['fred_custody', 'charissa_custody', 'fred_outlook']));
  }

  const hasActiveFilters = enabledPeople.size > 0 || enabledTypes.size > 0;

  const periodLabel = view === 'month'
    ? current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : (() => {
        const ws = weekStart(current), we = addDays(ws, 6);
        return `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      })();

  if (!currentUser) return <LoginForm onLogin={email => { localStorage.setItem('calUser', email); setCurrentUser(email); }} />;

  const sharedProps = {
    today, icsEvents, familyEvents, enabledFeeds, enabledPeople, enabledTypes,
    onDayDetail:  setDayModal,
    onEditEvent:  (ev: FamilyEvent) => { setEditingEvent(ev); setDefaultDate(undefined); },
    onCellClick:  (dateStr: string) => { setEditingEvent(null); setDefaultDate(dateStr); },
    onQuickSave:  handleQuickSave,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* ── Main calendar ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Sticky header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-40 shadow-sm flex-shrink-0">

          {/* Row 1: title + nav + view + user */}
          <div className="px-4 py-3 flex flex-wrap items-center gap-3 relative">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex-1 min-w-fit">Schlecton Calendar</h1>
            {loading && (
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-100 overflow-hidden pointer-events-none">
                <div className="h-full w-1/3 bg-blue-500 animate-[slide_1s_linear_infinite]" />
              </div>
            )}
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrent(new Date())}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors">
                Today
              </button>
              <button onClick={goPrev} aria-label="Previous"
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors text-lg leading-none">‹</button>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 min-w-[170px] text-center px-1">{periodLabel}</span>
              <button onClick={goNext} aria-label="Next"
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors text-lg leading-none">›</button>
            </div>
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
              {(['week', 'month'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    view === v ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">{currentUser}</span>
              <button onClick={() => { localStorage.removeItem('calUser'); setCurrentUser(null); }}
                className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Sign out
              </button>
            </div>
          </div>

          {/* Row 2: filters */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2 space-y-1.5">

            {/* People filter */}
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 w-14 flex-shrink-0">People</span>
              {FILTER_PEOPLE.map(p => (
                <button key={p.key} onClick={() => togglePerson(p.key as PersonKey)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                    enabledPeople.has(p.key as PersonKey)
                      ? `${ROW_HEADER_CLS[p.key as PersonKey]} border-current`
                      : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Event type filter */}
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 w-14 flex-shrink-0">Types</span>
              {FILTER_TYPES.map(([type, c]) => (
                <button key={type} onClick={() => toggleType(type)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                    enabledTypes.has(type) ? 'text-white border-transparent' : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'
                  }`}
                  style={enabledTypes.has(type) ? { backgroundColor: c.color } : {}}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>

            {/* Custody feeds + clear */}
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 w-14 flex-shrink-0">Custody</span>
              {FEEDS.map(({ name, label, color }) => (
                <button key={name} onClick={() => toggleFeed(name)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                    enabledFeeds.has(name)
                      ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                      : 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-400 dark:text-gray-500 opacity-50'
                  }`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                  {label}
                </button>
              ))}
              {hasActiveFilters && (
                <button onClick={clearFilters}
                  className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium border border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Calendar body */}
        <main className="flex-1 overflow-auto px-4 py-4">
          {view === 'week'
            ? <MultiWeekTable current={current} {...sharedProps} />
            : <MonthGrid      current={current} {...sharedProps} />
          }
        </main>
      </div>

      {/* ── Event form panel ── */}
      <div className="w-80 flex-shrink-0 h-full">
        <EventForm
          event={editingEvent}
          defaultDate={defaultDate}
          currentUser={currentUser}
          onSave={handleSaveEvent}
          onDelete={handleDeleteEvent}
          onClear={() => { setEditingEvent(null); setDefaultDate(undefined); }}
        />
      </div>

      {/* ── Day modal ── */}
      {dayModal && (
        <DayDetailModal
          date={dayModal}
          icsEvents={eventsForDay(dayModal, icsEvents).filter(e => enabledFeeds.has(e.feed as FeedName))}
          familyEvents={familyEvents.filter(ev => ev.start_date <= isoDate(dayModal) && ev.end_date >= isoDate(dayModal))}
          onClose={() => setDayModal(null)}
          onEditEvent={ev => { setDayModal(null); setEditingEvent(ev); setDefaultDate(undefined); }}
        />
      )}
    </div>
  );
}

// ── Grid props ─────────────────────────────────────────────────────────────

interface GridProps {
  current:       Date;
  today:         Date;
  icsEvents:     CalEvent[];
  familyEvents:  FamilyEvent[];
  enabledFeeds:  Set<FeedName>;
  enabledPeople: Set<PersonKey>;
  enabledTypes:  Set<EventType>;
  onDayDetail:   (d: Date) => void;
  onEditEvent:   (ev: FamilyEvent) => void;
  onCellClick:   (dateStr: string) => void;
  onQuickSave:   (title: string, personKey: PersonKey, dateStr: string) => void;
}

// ── Multi-week table ──────────────────────────────────────────────────────

function MultiWeekTable({ current, today, icsEvents, familyEvents, enabledFeeds, enabledPeople, enabledTypes, onDayDetail, onEditEvent, onCellClick, onQuickSave }: GridProps) {
  const [weeksCount, setWeeksCount] = useState(3);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMore = useRef(false);

  useEffect(() => { setWeeksCount(3); }, [current]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore.current) {
        loadingMore.current = true;
        setWeeksCount(n => n + 3);
        requestAnimationFrame(() => { loadingMore.current = false; });
      }
    }, { rootMargin: '400px', threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [weeksCount]);

  const startWeek = weekStart(current);
  const weeks     = Array.from({ length: weeksCount }, (_, i) => addDays(startWeek, i * 7));

  return (
    <div className="space-y-4">
      {weeks.map(ws => {
        const days      = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
        const weekLabel = `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(ws, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

        return (
          <div key={isoDate(ws)} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm bg-white dark:bg-gray-900">
            <div className="px-4 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{weekLabel}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm table-fixed" style={{ minWidth: '560px' }}>
                <colgroup>
                  <col style={{ width: '72px' }} />
                  {days.map((_, i) => <col key={i} />)}
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                    <th className="py-1.5 px-2 border-r border-gray-200 dark:border-gray-700" />
                    {days.map(day => {
                      const isToday = sameDay(day, today);
                      return (
                        <th key={isoDate(day)}
                          className={`py-1.5 px-1 text-center border-r border-gray-100 dark:border-gray-700 last:border-r-0 font-normal ${isToday ? 'bg-red-50 dark:bg-red-950/30' : ''}`}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                              {day.toLocaleDateString('en-US', { weekday: 'short' })}
                            </span>
                            <button onClick={() => onDayDetail(day)}
                              className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium transition-colors ${
                                isToday ? 'bg-red-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                              }`}>
                              {day.getDate()}
                            </button>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {PERSONS.map(({ key, label }) => (
                    <tr key={key} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                      <td className={`py-1.5 px-2 font-semibold text-[10px] uppercase tracking-wide border-r ${ROW_HEADER_CLS[key]} whitespace-nowrap`}>
                        {label}
                      </td>
                      {days.map(day => {
                        const dateStr      = isoDate(day);
                        const isToday      = sameDay(day, today);
                        const custodyEvts  = icsEventsForPersonDay(key, day, icsEvents, enabledFeeds);
                        const custodyColor = KIDS.has(key) && custodyEvts.length > 0 ? KIDS_CUSTODY_COLOR[key] : undefined;
                        const cellEvts     = familyEventsForCell(key, dateStr, familyEvents, enabledPeople, enabledTypes);

                        return (
                          <td key={dateStr}
                            style={custodyColor ? { backgroundColor: custodyColor } : undefined}
                            className={`align-top p-0.5 border-r border-gray-100 dark:border-gray-800 last:border-r-0 cursor-text ${
                              custodyColor ? '' : CELL_BG_CLS[key]
                            } ${isToday ? 'ring-2 ring-inset ring-red-300 dark:ring-red-700' : ''}`}
                            onClick={() => onCellClick(dateStr)}>
                            <div className="min-h-[36px] space-y-0.5">
                              {cellEvts.map(ev => (
                                <FamilyEventChip key={ev.id} event={ev} hasCustody={!!custodyColor}
                                  onClick={e => { e.stopPropagation(); onEditEvent(ev); }}
                                />
                              ))}
                              <div onClick={e => e.stopPropagation()}>
                                <QuickAddCell
                                  personKey={key}
                                  dateStr={dateStr}
                                  hasCustody={!!custodyColor}
                                  onQuickSave={title => onQuickSave(title, key, dateStr)}
                                />
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <div ref={sentinelRef} className="h-8" />
    </div>
  );
}

// ── QuickAddCell ─────────────────────────────────────────────────────────

function QuickAddCell({
  personKey,
  dateStr,
  hasCustody,
  onQuickSave,
}: {
  personKey: PersonKey;
  dateStr: string;
  hasCustody: boolean;
  onQuickSave: (title: string) => void;
}) {
  const [text, setText] = useState('');
  void personKey; void dateStr; // used by parent, passed for context only

  return (
    <input
      type="text"
      value={text}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && text.trim()) {
          onQuickSave(text.trim());
          setText('');
          e.preventDefault();
        }
      }}
      className={`w-full bg-transparent text-[10px] leading-tight px-0.5 focus:outline-none ${
        hasCustody ? 'text-white caret-white' : 'text-gray-600 dark:text-gray-400 caret-gray-500'
      }`}
    />
  );
}

// ── FamilyEventChip ───────────────────────────────────────────────────────

function FamilyEventChip({
  event,
  hasCustody,
  onClick,
}: {
  event: FamilyEvent;
  hasCustody: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const cfg   = eventTypeConfig[event.event_type];
  const color = event.color_override ?? cfg.color;
  const time  = event.start_time ? ` ${fmt12(event.start_time)}` : '';
  const label = `${cfg.icon} ${event.title}${time}`;

  if (hasCustody) {
    return (
      <button onClick={onClick} title={label}
        className="w-full text-left text-[10px] font-bold italic text-white/90 truncate px-0.5 leading-tight hover:text-white transition-colors">
        {label}
      </button>
    );
  }
  return (
    <button onClick={onClick} title={label}
      className="w-full text-left text-[10px] font-semibold truncate px-1 py-0.5 rounded-sm leading-tight hover:opacity-80 transition-opacity"
      style={{ backgroundColor: `${color}26`, color, border: `1px solid ${color}40` }}>
      {label}
    </button>
  );
}

// ── Month Grid ────────────────────────────────────────────────────────────

function MonthGrid({ current, today, icsEvents, familyEvents, enabledFeeds, enabledPeople, enabledTypes, onDayDetail, onCellClick }: GridProps) {
  const year  = current.getFullYear();
  const month = current.getMonth();

  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month + 1, 0);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - dayOffset(firstDay));
  const gridEnd = new Date(lastDay);
  gridEnd.setDate(lastDay.getDate() + (6 - dayOffset(lastDay)));

  const days: Date[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) days.push(new Date(d));

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 last:border-r-0">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-t border-gray-200 dark:border-gray-700 bg-gray-200 dark:bg-gray-700 gap-px">
        {days.map(day => {
          const dateStr  = isoDate(day);
          const dayEvts  = eventsForDay(day, icsEvents).filter(e => enabledFeeds.has(e.feed as FeedName));
          const custody  = custodyFeedForDay(dayEvts);
          const nonCust  = dayEvts.filter(e => !isCustodyBg(e));
          // All family events on this day (filtered by type but not by person for month view)
          const famEvts  = familyEvents.filter(ev => {
            if (ev.start_date > dateStr || ev.end_date < dateStr) return false;
            if (enabledTypes.size > 0 && !enabledTypes.has(ev.event_type as EventType)) return false;
            return true;
          });
          const isToday = sameDay(day, today);
          const inMonth = day.getMonth() === month;

          return (
            <div key={dateStr} onClick={() => onCellClick(dateStr)}
              className={`min-h-[90px] p-1 group cursor-pointer ${
                inMonth ? (custody ? CUSTODY_BG[custody] : 'bg-white dark:bg-gray-900') : 'bg-gray-50 dark:bg-gray-800/50'
              } ${isToday ? 'ring-2 ring-inset ring-red-400' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <button onClick={e => { e.stopPropagation(); onDayDetail(day); }}
                  className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    isToday ? 'bg-red-500 text-white'
                      : inMonth ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      : 'text-gray-300 dark:text-gray-600'
                  }`}>
                  {day.getDate()}
                </button>
              </div>
              <div className="space-y-0.5">
                {nonCust.slice(0, 2).map(e => <EventChip key={e.id} event={e} />)}
                {famEvts.slice(0, 2).map(ev => {
                  const cfg   = eventTypeConfig[ev.event_type];
                  const color = ev.color_override ?? cfg.color;
                  return (
                    <div key={ev.id} className="text-[11px] px-1.5 py-0.5 rounded font-medium truncate leading-tight"
                      style={{ backgroundColor: `${color}26`, color }}>
                      {cfg.icon} {ev.title}{ev.start_time ? ` ${fmt12(ev.start_time)}` : ''}
                    </div>
                  );
                })}
                {(nonCust.length + famEvts.length) > 4 && (
                  <button onClick={e => { e.stopPropagation(); onDayDetail(day); }}
                    className="text-[10px] text-gray-400 hover:text-gray-600 hover:underline pl-1">
                    +{nonCust.length + famEvts.length - 4} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

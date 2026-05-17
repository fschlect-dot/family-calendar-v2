'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalEvent, FamilyEvent, ViewMode } from '@/lib/types';
import { loadAllFeeds } from '@/lib/feeds';
import { getEventsByDateRange, saveEvent, deleteEvent, fetchAllNotes, upsertNote } from '@/lib/supabase';
import { eventTypeConfig } from '@/lib/eventTypes';
import EventChip from './EventChip';
import EventForm from './EventForm';
import DayDetailModal from './DayDetailModal';
import LoginForm from './LoginForm';

// ── Date helpers ───────────────────────────────────────────────────────────

function dayOffset(d: Date) { return (d.getDay() + 6) % 7; }
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function weekStart(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - dayOffset(r));
  return r;
}
function todayMidnight(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}
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
function familyEventsForPersonDay(personKey: string, dateStr: string, events: FamilyEvent[]): FamilyEvent[] {
  return events.filter(ev =>
    ev.people?.includes(personKey) &&
    ev.start_date <= dateStr &&
    ev.end_date   >= dateStr
  );
}
function custodyFeedForDay(evts: CalEvent[]): string | null {
  return evts.find(e => e.allDay && (e.feed === 'fred_custody' || e.feed === 'charissa_custody'))?.feed ?? null;
}
function isCustodyBg(e: CalEvent) {
  return e.allDay && (e.feed === 'fred_custody' || e.feed === 'charissa_custody');
}
function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Custody bg tints (month grid) ─────────────────────────────────────────

const CUSTODY_BG: Record<string, string> = {
  fred_custody:     'bg-blue-50  dark:bg-blue-950/40',
  charissa_custody: 'bg-green-50 dark:bg-green-950/40',
};

// ── Kids custody solid fill colors (week table) ────────────────────────────

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

const NOTES_ONLY_KEYS = new Set<PersonKey>(['fred', 'charissa', 'dinner', 'all']);

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
  dinner:   'bg-orange-50  dark:bg-orange-950/20',
  all:      'bg-purple-50  dark:bg-purple-950/20',
};

function eventsForPersonDay(personKey: PersonKey, day: Date, allEvents: CalEvent[], enabledFeeds: Set<FeedName>): CalEvent[] {
  const dayEvts = eventsForDay(day, allEvents).filter(e => enabledFeeds.has(e.feed as FeedName));
  if (personKey === 'henry'  || personKey === 'george')  return dayEvts.filter(e => e.allDay && e.feed === 'fred_custody');
  if (personKey === 'mabel'  || personKey === 'everett') return dayEvts.filter(e => e.allDay && e.feed === 'charissa_custody');
  return [];
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Calendar() {
  const [currentUser,   setCurrentUser]   = useState<string | null>(null);
  const [view,          setView]          = useState<ViewMode>('week');
  const [current,       setCurrent]       = useState(new Date());
  const [icsEvents,     setIcsEvents]     = useState<CalEvent[]>([]);
  const [familyEvents,  setFamilyEvents]  = useState<FamilyEvent[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [dayModal,      setDayModal]      = useState<Date | null>(null);
  const [editingEvent,  setEditingEvent]  = useState<FamilyEvent | null>(null);
  const [defaultDate,   setDefaultDate]   = useState<string | undefined>();
  const [enabledFeeds,  setEnabledFeeds]  = useState<Set<FeedName>>(
    new Set(['fred_custody', 'charissa_custody', 'fred_outlook'])
  );
  const [notes,         setNotes]         = useState<Record<string, string>>({});
  const [notesOnlyMode, setNotesOnlyMode] = useState(false);

  const today = todayMidnight();

  // Restore login from localStorage
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('calUser') : null;
    if (stored) setCurrentUser(stored);
  }, []);

  function handleLogin(email: string) {
    localStorage.setItem('calUser', email);
    setCurrentUser(email);
  }
  function handleLogout() {
    localStorage.removeItem('calUser');
    setCurrentUser(null);
  }

  const toggleFeed = (feed: FeedName) => {
    setEnabledFeeds(prev => {
      const next = new Set(prev);
      if (next.has(feed)) next.delete(feed); else next.add(feed);
      return next;
    });
  };

  // Load ICS + family events + notes
  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    const now = new Date();
    const rangeStart = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 365));
    const rangeEnd   = isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 730));
    Promise.allSettled([
      loadAllFeeds(),
      getEventsByDateRange(rangeStart, rangeEnd),
      fetchAllNotes(),
    ]).then(([icsResult, eventsResult, notesResult]) => {
      if (icsResult.status    === 'fulfilled') setIcsEvents(icsResult.value);
      else console.warn('[calendar] ICS failed:', icsResult.reason);
      if (eventsResult.status === 'fulfilled') setFamilyEvents(eventsResult.value);
      else console.warn('[calendar] Events failed:', eventsResult.reason);
      if (notesResult.status  === 'fulfilled') setNotes(notesResult.value);
      else console.warn('[calendar] Notes failed:', notesResult.reason);
    }).finally(() => setLoading(false));
  }, [currentUser]);

  const saveNote = useCallback(async (person: string, date: string, text: string) => {
    const key = `${person}|${date}`;
    setNotes(prev => {
      if (text.trim()) return { ...prev, [key]: text.trim() };
      const next = { ...prev }; delete next[key]; return next;
    });
    try { await upsertNote(date, person, text); }
    catch (err) { console.warn('[calendar] note save failed:', err); }
  }, []);

  async function handleSaveEvent(payload: Omit<FamilyEvent, 'id' | 'created_at' | 'updated_at'> & { id?: string }) {
    const saved = await saveEvent(payload);
    setFamilyEvents(prev => {
      const without = prev.filter(e => e.id !== saved.id);
      return [...without, saved].sort((a, b) => a.start_date.localeCompare(b.start_date));
    });
  }

  async function handleDeleteEvent(id: string) {
    await deleteEvent(id);
    setFamilyEvents(prev => prev.filter(e => e.id !== id));
  }

  function openNewEvent(dateStr?: string) {
    setEditingEvent(null);
    setDefaultDate(dateStr);
  }

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

  const periodLabel = view === 'month'
    ? current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : (() => {
        const ws = weekStart(current), we = addDays(ws, 6);
        return `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      })();

  if (!currentUser) return <LoginForm onLogin={handleLogin} />;

  const sharedProps = {
    today, icsEvents, familyEvents, enabledFeeds, notes, notesOnlyMode,
    onSaveNote: saveNote,
    onDayDetail: setDayModal,
    onEditEvent: (ev: FamilyEvent) => { setEditingEvent(ev); setDefaultDate(undefined); },
    onCellClick: (dateStr: string) => openNewEvent(dateStr),
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">

      {/* ── Main calendar area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Sticky header */}
        <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-40 shadow-sm flex-shrink-0">

          {/* Row 1: title + nav + view toggle + user */}
          <div className="max-w-full px-4 py-3 flex flex-wrap items-center gap-3 relative">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex-1 min-w-fit">
              Schlecton Calendar
            </h1>
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
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors text-lg leading-none">
                ‹
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 min-w-[170px] text-center px-1">
                {periodLabel}
              </span>
              <button onClick={goNext} aria-label="Next"
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors text-lg leading-none">
                ›
              </button>
            </div>
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
              {(['week', 'month'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    view === v
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                {currentUser}
              </span>
              <button onClick={handleLogout}
                className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Sign out
              </button>
            </div>
          </div>

          {/* Row 2: filter buttons */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2 flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mr-1">Filters</span>
            {FEEDS.map(({ name, label, color }) => (
              <button key={name} onClick={() => toggleFeed(name)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all border ${
                  enabledFeeds.has(name)
                    ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100'
                    : 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-400 dark:text-gray-500 opacity-50'
                }`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                {label}
              </button>
            ))}
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />
            <button onClick={() => setNotesOnlyMode(m => !m)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all border ${
                notesOnlyMode
                  ? 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                  : 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400'
              }`}>
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-indigo-400" />
              Notes only
            </button>
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

      {/* ── Always-visible Event Form panel ── */}
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

      {/* ── Day detail modal ── */}
      {dayModal && (
        <DayDetailModal
          date={dayModal}
          icsEvents={eventsForDay(dayModal, icsEvents).filter(e => enabledFeeds.has(e.feed as FeedName))}
          familyEvents={familyEvents.filter(ev =>
            ev.start_date <= isoDate(dayModal) && ev.end_date >= isoDate(dayModal)
          )}
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
  notes:         Record<string, string>;
  notesOnlyMode: boolean;
  onSaveNote:    (person: string, date: string, text: string) => void;
  onDayDetail:   (d: Date) => void;
  onEditEvent:   (ev: FamilyEvent) => void;
  onCellClick:   (dateStr: string) => void;
}

// ── Multi-week table with infinite scroll ─────────────────────────────────

function MultiWeekTable({ current, today, icsEvents, familyEvents, enabledFeeds, notes, notesOnlyMode, onSaveNote, onDayDetail, onEditEvent, onCellClick }: GridProps) {
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

  const startWeek      = weekStart(current);
  const weeks          = Array.from({ length: weeksCount }, (_, i) => addDays(startWeek, i * 7));
  const visiblePersons = notesOnlyMode
    ? PERSONS.filter(p => NOTES_ONLY_KEYS.has(p.key))
    : [...PERSONS];

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
                  {visiblePersons.map(({ key, label }) => (
                    <tr key={key} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                      <td className={`py-1.5 px-2 font-semibold text-[10px] uppercase tracking-wide border-r ${ROW_HEADER_CLS[key]} whitespace-nowrap`}>
                        {label}
                      </td>
                      {days.map(day => {
                        const dateStr      = isoDate(day);
                        const isToday      = sameDay(day, today);
                        const personEvts   = eventsForPersonDay(key, day, icsEvents, enabledFeeds);
                        const custodyColor = KIDS.has(key) && personEvts.length > 0
                          ? KIDS_CUSTODY_COLOR[key]
                          : undefined;
                        const cellFamilyEvts = familyEventsForPersonDay(key, dateStr, familyEvents);

                        return (
                          <td key={dateStr}
                            style={custodyColor ? { backgroundColor: custodyColor } : undefined}
                            className={`align-top p-0.5 border-r border-gray-100 dark:border-gray-800 last:border-r-0 ${
                              custodyColor ? '' : CELL_BG_CLS[key]
                            } ${isToday ? 'ring-2 ring-inset ring-red-300 dark:ring-red-700' : ''}`}
                            onClick={() => onCellClick(dateStr)}>
                            <div className="min-h-[36px] space-y-0.5">
                              {/* Family event chips */}
                              {cellFamilyEvts.map(ev => (
                                <FamilyEventChip
                                  key={ev.id}
                                  event={ev}
                                  hasCustody={!!custodyColor}
                                  onClick={e => { e.stopPropagation(); onEditEvent(ev); }}
                                />
                              ))}
                              {/* Inline note — stop click from bubbling to cell */}
                              <div onClick={e => e.stopPropagation()}>
                                <NoteCell
                                  noteKey={`${key}|${dateStr}`}
                                  initialValue={notes[`${key}|${dateStr}`] ?? ''}
                                  hasCustody={!!custodyColor}
                                  onSave={text => onSaveNote(key, dateStr, text)}
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

// ── FamilyEventChip — colored chip for DB-backed events ───────────────────

function FamilyEventChip({
  event,
  hasCustody,
  onClick,
}: {
  event: FamilyEvent;
  hasCustody: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const cfg = eventTypeConfig[event.event_type];
  const color = event.color_override ?? cfg.color;

  const timeLabel = event.start_time ? ` ${fmt12(event.start_time)}` : '';
  const label     = `${cfg.icon} ${event.title}${timeLabel}`;

  if (hasCustody) {
    return (
      <button
        onClick={onClick}
        title={label}
        className="w-full text-left text-[10px] font-bold italic text-white/90 truncate px-0.5 leading-tight cursor-pointer hover:text-white transition-colors"
      >
        {label}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      title={label}
      className="w-full text-left text-[10px] font-semibold truncate px-1 py-0.5 rounded-sm leading-tight cursor-pointer hover:opacity-80 transition-opacity"
      style={{ backgroundColor: `${color}26`, color, border: `1px solid ${color}40` }}
    >
      {label}
    </button>
  );
}

// ── NoteCell — transparent editable input ─────────────────────────────────

function NoteCell({
  noteKey,
  initialValue,
  hasCustody,
  onSave,
}: {
  noteKey: string;
  initialValue: string;
  hasCustody: boolean;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initialValue);
  useEffect(() => { setText(initialValue); }, [initialValue]);

  return (
    <input
      key={noteKey}
      type="text"
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => onSave(text)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      placeholder="Add note…"
      className={`w-full bg-transparent text-[10px] leading-tight px-0.5 focus:outline-none ${
        hasCustody
          ? 'text-white placeholder:text-white/40'
          : 'text-gray-500 dark:text-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600'
      }`}
    />
  );
}

// ── Month Grid (secondary view) ────────────────────────────────────────────

function MonthGrid({ current, today, icsEvents, familyEvents, enabledFeeds, onDayDetail, onCellClick }: GridProps) {
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
          const famEvts  = familyEvents.filter(ev => ev.start_date <= dateStr && ev.end_date >= dateStr);
          const isToday  = sameDay(day, today);
          const inMonth  = day.getMonth() === month;

          return (
            <div key={dateStr}
              onClick={() => onCellClick(dateStr)}
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
                  const cfg = eventTypeConfig[ev.event_type];
                  const color = ev.color_override ?? cfg.color;
                  return (
                    <div key={ev.id}
                      className="text-[11px] px-1.5 py-0.5 rounded font-medium truncate leading-tight"
                      style={{ backgroundColor: `${color}26`, color }}>
                      {cfg.icon} {ev.title}
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

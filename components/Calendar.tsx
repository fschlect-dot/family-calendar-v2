'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CalEvent, Idea, ViewMode } from '@/lib/types';
import { loadAllFeeds } from '@/lib/feeds';
import { createIdea, deleteIdea, fetchIdeas, updateIdea, fetchAllNotes, upsertNote } from '@/lib/supabase';
import EventChip from './EventChip';
import DayDetailModal from './DayDetailModal';
import IdeaModal from './IdeaModal';

// ── Date helpers ───────────────────────────────────────────────────────────

function dayOffset(d: Date)   { return (d.getDay() + 6) % 7; } // 0=Mon … 6=Sun
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
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function eventsForDay(day: Date, events: CalEvent[]): CalEvent[] {
  const s = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const e = new Date(s.getTime() + 86_400_000);
  return events.filter(ev => ev.start < e && ev.end > s);
}
function custodyFeedForDay(evts: CalEvent[]): string | null {
  return evts.find(e => e.allDay && (e.feed==='fred_custody'||e.feed==='charissa_custody'))?.feed ?? null;
}
function isCustodyBg(e: CalEvent): boolean {
  return e.allDay && (e.feed==='fred_custody'||e.feed==='charissa_custody');
}
function ideaToEvent(idea: Idea): CalEvent {
  const start = new Date(idea.date+'T00:00:00');
  return { id:idea.id, title:idea.title, start, end:new Date(start.getTime()+86_400_000), allDay:true, feed:'idea', note:idea.note };
}

// ── Custody bg tints (month grid only) ────────────────────────────────────

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

type FeedName = 'fred_custody' | 'charissa_custody' | 'fred_outlook' | 'idea';

const FEEDS: { name: FeedName; label: string; color: string }[] = [
  { name: 'fred_custody',     label: "Fred's Custody",     color: 'bg-blue-500'   },
  { name: 'charissa_custody', label: "Charissa's Custody", color: 'bg-green-500'  },
  { name: 'fred_outlook',     label: "Fred's Calendar",    color: 'bg-gray-600'   },
  { name: 'idea',             label: '💡 Ideas',            color: 'bg-yellow-400' },
];

// ── Person × Day matrix config ─────────────────────────────────────────────

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

// Rows visible when "Notes only" mode is active (hides kids custody rows)
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
  henry:    'bg-blue-50   dark:bg-blue-950/20',
  george:   'bg-green-50  dark:bg-green-950/20',
  mabel:    'bg-pink-50   dark:bg-pink-950/20',
  everett:  'bg-rose-50   dark:bg-rose-950/20',
  fred:     'bg-yellow-50 dark:bg-yellow-950/20',
  charissa: 'bg-cyan-50   dark:bg-cyan-950/20',
  dinner:   'bg-orange-50 dark:bg-orange-950/20',
  all:      'bg-purple-50 dark:bg-purple-950/20',
};

/** Returns custody events for kids rows (drives background color); empty for all others. */
function eventsForPersonDay(personKey: PersonKey, day: Date, allEvents: CalEvent[], enabledFeeds: Set<FeedName>): CalEvent[] {
  const dayEvts = eventsForDay(day, allEvents).filter(e => enabledFeeds.has(e.feed as FeedName));
  if (personKey === 'henry'  || personKey === 'george')  return dayEvts.filter(e => e.allDay && e.feed === 'fred_custody');
  if (personKey === 'mabel'  || personKey === 'everett') return dayEvts.filter(e => e.allDay && e.feed === 'charissa_custody');
  return [];
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Calendar() {
  const [view,          setView]          = useState<ViewMode>('week');
  const [current,       setCurrent]       = useState(new Date());
  const [icsEvents,     setIcsEvents]     = useState<CalEvent[]>([]);
  const [ideas,         setIdeas]         = useState<Idea[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [dayModal,      setDayModal]      = useState<Date | null>(null);
  const [ideaModal,     setIdeaModal]     = useState<{ date?: string; id?: string } | null>(null);
  const [enabledFeeds,  setEnabledFeeds]  = useState<Set<FeedName>>(
    new Set(['fred_custody', 'charissa_custody', 'fred_outlook', 'idea'])
  );
  const [notes,         setNotes]         = useState<Record<string, string>>({});
  const [notesOnlyMode, setNotesOnlyMode] = useState(false);

  const today     = todayMidnight();
  const allEvents = [...icsEvents, ...ideas.map(ideaToEvent)];

  const toggleFeed = (feed: FeedName) => {
    setEnabledFeeds(prev => {
      const next = new Set(prev);
      if (next.has(feed)) next.delete(feed); else next.add(feed);
      return next;
    });
  };

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([loadAllFeeds(), fetchIdeas(), fetchAllNotes()])
      .then(([icsResult, ideasResult, notesResult]) => {
        const ics       = icsResult.status   === 'fulfilled' ? icsResult.value   : [];
        const ideaData  = ideasResult.status === 'fulfilled' ? ideasResult.value : [];
        const notesData = notesResult.status === 'fulfilled' ? notesResult.value : {};
        if (icsResult.status   === 'rejected') console.warn('[calendar] ICS load failed:',  icsResult.reason);
        if (ideasResult.status === 'rejected') console.warn('[calendar] Ideas load failed:', ideasResult.reason);
        if (notesResult.status === 'rejected') console.warn('[calendar] Notes load failed:', notesResult.reason);
        setIcsEvents(ics);
        setIdeas(ideaData);
        setNotes(notesData);
      })
      .finally(() => setLoading(false));
  }, []);

  const refreshIdeas = useCallback(async () => setIdeas(await fetchIdeas()), []);

  async function handleSaveIdea(title: string, date: string, note: string) {
    if (ideaModal?.id) await updateIdea(ideaModal.id, title, date, note);
    else               await createIdea(title, date, note);
    await refreshIdeas();
  }
  async function handleDeleteIdea() {
    if (ideaModal?.id) { await deleteIdea(ideaModal.id); await refreshIdeas(); }
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

  const editingIdea = ideaModal?.id ? ideas.find(i => i.id === ideaModal.id) : undefined;

  const saveNote = useCallback(async (person: string, date: string, text: string) => {
    const key = `${person}|${date}`;
    setNotes(prev => {
      if (text.trim()) return { ...prev, [key]: text.trim() };
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      await upsertNote(date, person, text);
    } catch (err) {
      console.warn('[calendar] note save failed:', err);
    }
  }, []);

  const sharedGridProps = {
    today, allEvents, enabledFeeds, notes, notesOnlyMode,
    onSaveNote: saveNote,
    onDayDetail: setDayModal,
    onAddIdea: (d: string) => setIdeaModal({ date: d }),
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Sticky header ── */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40 shadow-sm">

        {/* Row 1: title + nav + view toggle */}
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3 relative">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex-1 min-w-fit">
            Family Calendar
          </h1>

          {loading && (
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-100 dark:bg-blue-900 overflow-hidden pointer-events-none">
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
        </div>

        {/* Row 2: filter buttons */}
        <div className="border-t border-gray-100 dark:border-gray-800 max-w-screen-2xl mx-auto px-4 py-2 flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mr-1">
            Filters
          </span>
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

      {/* ── Calendar body ── */}
      <main className="px-4 py-4">
        {view === 'week'
          ? <MultiWeekTable current={current} {...sharedGridProps} />
          : <MonthGrid      current={current} {...sharedGridProps} />
        }
      </main>

      {/* ── Modals ── */}
      {dayModal && (
        <DayDetailModal
          date={dayModal}
          events={eventsForDay(dayModal, allEvents)}
          onClose={() => setDayModal(null)}
          onEditIdea={id => { setDayModal(null); setIdeaModal({ id }); }}
        />
      )}
      {ideaModal !== null && (
        <IdeaModal
          initialDate={ideaModal.date}
          idea={editingIdea}
          onSave={handleSaveIdea}
          onDelete={editingIdea ? handleDeleteIdea : undefined}
          onClose={() => setIdeaModal(null)}
        />
      )}
    </div>
  );
}

// ── Grid props ─────────────────────────────────────────────────────────────

interface GridProps {
  current:       Date;
  today:         Date;
  allEvents:     CalEvent[];
  enabledFeeds:  Set<FeedName>;
  notes:         Record<string, string>;
  notesOnlyMode: boolean;
  onSaveNote:    (person: string, date: string, text: string) => void;
  onDayDetail:   (d: Date) => void;
  onAddIdea:     (dateStr: string) => void;
}

// ── 3-Week scrollable table ────────────────────────────────────────────────

function MultiWeekTable({ current, today, allEvents, enabledFeeds, notes, notesOnlyMode, onSaveNote, onDayDetail }: GridProps) {
  // Current week is always the top row; show 3 weeks forward
  const startWeek = weekStart(current);
  const weeks     = Array.from({ length: 3 }, (_, i) => addDays(startWeek, i * 7));

  const visiblePersons = notesOnlyMode
    ? PERSONS.filter(p => NOTES_ONLY_KEYS.has(p.key))
    : [...PERSONS];

  return (
    <div className="space-y-4">
      {weeks.map(ws => {
        const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
        const we   = addDays(ws, 6);
        const weekLabel = `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

        return (
          <div key={isoDate(ws)} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm bg-white dark:bg-gray-900">

            {/* Week label bar */}
            <div className="px-4 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {weekLabel}
              </h3>
            </div>

            {/* Scrollable wrapper keeps fixed layout on small screens */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm table-fixed" style={{ minWidth: '560px' }}>
                <colgroup>
                  {/* Person label column */}
                  <col style={{ width: '72px' }} />
                  {/* 7 equal day columns fill remaining width */}
                  {days.map((_, i) => <col key={i} />)}
                </colgroup>

                {/* Column headers */}
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                    <th className="py-1.5 px-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700" />
                    {days.map(day => {
                      const isToday = sameDay(day, today);
                      return (
                        <th key={isoDate(day)}
                          className={`py-1.5 px-1 text-center border-r border-gray-100 dark:border-gray-700 last:border-r-0 font-normal ${
                            isToday ? 'bg-red-50 dark:bg-red-950/30' : ''
                          }`}>
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                              {day.toLocaleDateString('en-US', { weekday: 'short' })}
                            </span>
                            <button
                              onClick={() => onDayDetail(day)}
                              className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium transition-colors ${
                                isToday
                                  ? 'bg-red-500 text-white'
                                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                              }`}>
                              {day.getDate()}
                            </button>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* Person rows */}
                <tbody>
                  {visiblePersons.map(({ key, label }) => (
                    <tr key={key} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                      <td className={`py-1.5 px-2 font-semibold text-[10px] uppercase tracking-wide border-r ${ROW_HEADER_CLS[key]} whitespace-nowrap`}>
                        {label}
                      </td>
                      {days.map(day => {
                        const dateStr      = isoDate(day);
                        const isToday      = sameDay(day, today);
                        const personEvts   = eventsForPersonDay(key, day, allEvents, enabledFeeds);
                        const custodyColor = KIDS.has(key) && personEvts.length > 0
                          ? KIDS_CUSTODY_COLOR[key]
                          : undefined;

                        return (
                          <td key={dateStr}
                            style={custodyColor ? { backgroundColor: custodyColor } : undefined}
                            className={`align-top p-0.5 border-r border-gray-100 dark:border-gray-800 last:border-r-0 ${
                              custodyColor ? '' : CELL_BG_CLS[key]
                            } ${isToday ? 'ring-2 ring-inset ring-red-300 dark:ring-red-700' : ''}`}>
                            <div className="min-h-[32px]">
                              <NoteCell
                                noteKey={`${key}|${dateStr}`}
                                initialValue={notes[`${key}|${dateStr}`] ?? ''}
                                hasCustody={!!custodyColor}
                                onSave={text => onSaveNote(key, dateStr, text)}
                              />
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
    </div>
  );
}

// ── NoteCell — transparent editable input overlaid on any cell ─────────────

interface NoteCellProps {
  noteKey:      string;
  initialValue: string;
  hasCustody:   boolean;
  onSave:       (text: string) => void;
}

function NoteCell({ noteKey, initialValue, hasCustody, onSave }: NoteCellProps) {
  const [text, setText] = useState(initialValue);

  // Re-sync when Supabase data loads after mount
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

function MonthGrid({ current, today, allEvents, enabledFeeds, onDayDetail, onAddIdea }: GridProps) {
  const year  = current.getFullYear();
  const month = current.getMonth();

  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month + 1, 0);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - dayOffset(firstDay));
  const gridEnd   = new Date(lastDay);
  gridEnd.setDate(lastDay.getDate() + (6 - dayOffset(lastDay)));

  const days: Date[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) days.push(new Date(d));

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-gray-200 dark:border-gray-700 bg-gray-200 dark:bg-gray-700 gap-px">
        {days.map(day => {
          const dayEvts = eventsForDay(day, allEvents).filter(e => enabledFeeds.has(e.feed as FeedName));
          const custody = custodyFeedForDay(dayEvts);
          const nonCust = dayEvts.filter(e => !isCustodyBg(e));
          const isToday = sameDay(day, today);
          const inMonth = day.getMonth() === month;
          const dateStr = isoDate(day);

          return (
            <div key={dateStr}
              className={`min-h-[90px] p-1 group ${
                inMonth
                  ? (custody ? CUSTODY_BG[custody] : 'bg-white dark:bg-gray-900')
                  : 'bg-gray-50 dark:bg-gray-800/50'
              } ${isToday ? 'ring-2 ring-inset ring-red-400' : ''}`}>

              <div className="flex items-center justify-between mb-1">
                <button onClick={() => onDayDetail(day)}
                  className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium transition-colors ${
                    isToday
                      ? 'bg-red-500 text-white'
                      : inMonth
                        ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        : 'text-gray-300 dark:text-gray-600'
                  }`}>
                  {day.getDate()}
                </button>
                <button onClick={() => onAddIdea(dateStr)}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300 transition-all text-sm"
                  title="Add idea">+</button>
              </div>

              <div className="space-y-0.5">
                {nonCust.slice(0, 3).map(e => <EventChip key={e.id} event={e} />)}
                {nonCust.length > 3 && (
                  <button onClick={() => onDayDetail(day)}
                    className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:underline pl-1">
                    +{nonCust.length - 3} more
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

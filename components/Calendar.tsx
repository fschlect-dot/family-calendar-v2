'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CalEvent, Idea, ViewMode } from '@/lib/types';
import { loadAllFeeds } from '@/lib/feeds';
import { createIdea, deleteIdea, fetchIdeas, updateIdea } from '@/lib/supabase';
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

// ── Custody bg tints (light + dark) ───────────────────────────────────────

const CUSTODY_BG: Record<string, string> = {
  fred_custody:     'bg-blue-50  dark:bg-blue-950/40',
  charissa_custody: 'bg-green-50 dark:bg-green-950/40',
};

// ── Person × Day matrix config ─────────────────────────────────────────────

const PERSONS = [
  { key: 'henry',    label: 'Henry'    },
  { key: 'george',   label: 'George'   },
  { key: 'mabel',    label: 'Mabel'    },
  { key: 'everett',  label: 'Everett'  },
  { key: 'fred',     label: 'Fred'     },
  { key: 'charissa', label: 'Charissa' },
  { key: 'all',      label: 'All'      },
  { key: 'ideas',    label: '💡 Ideas' },
] as const;

type PersonKey = typeof PERSONS[number]['key'];

const ROW_HEADER_CLS: Record<PersonKey, string> = {
  henry:    'bg-blue-100   text-blue-900   border-blue-200   dark:bg-blue-900/40   dark:text-blue-200   dark:border-blue-800',
  george:   'bg-green-100  text-green-900  border-green-200  dark:bg-green-900/40  dark:text-green-200  dark:border-green-800',
  mabel:    'bg-pink-100   text-pink-900   border-pink-200   dark:bg-pink-900/40   dark:text-pink-200   dark:border-pink-800',
  everett:  'bg-rose-100   text-rose-900   border-rose-200   dark:bg-rose-900/40   dark:text-rose-200   dark:border-rose-800',
  fred:     'bg-yellow-100 text-yellow-900 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-200 dark:border-yellow-800',
  charissa: 'bg-cyan-100   text-cyan-900   border-cyan-200   dark:bg-cyan-900/40   dark:text-cyan-200   dark:border-cyan-800',
  all:      'bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-800',
  ideas:    'bg-gray-100   text-gray-700   border-gray-200   dark:bg-gray-800      dark:text-gray-300   dark:border-gray-700',
};

const CELL_BG_CLS: Record<PersonKey, string> = {
  henry:    'bg-blue-50   dark:bg-blue-950/20',
  george:   'bg-green-50  dark:bg-green-950/20',
  mabel:    'bg-pink-50   dark:bg-pink-950/20',
  everett:  'bg-rose-50   dark:bg-rose-950/20',
  fred:     'bg-yellow-50 dark:bg-yellow-950/20',
  charissa: 'bg-cyan-50   dark:bg-cyan-950/20',
  all:      'bg-purple-50 dark:bg-purple-950/20',
  ideas:    'bg-gray-50   dark:bg-gray-900',
};

/** Return events that belong in a given person's row for a given day. */
function eventsForPersonDay(personKey: PersonKey, day: Date, allEvents: CalEvent[]): CalEvent[] {
  const dayEvts = eventsForDay(day, allEvents);
  if (personKey === 'henry' || personKey === 'george' || personKey === 'mabel' || personKey === 'everett') {
    // Kids rows: show which parent has custody each day
    return dayEvts.filter(e => e.allDay && (e.feed === 'fred_custody' || e.feed === 'charissa_custody'));
  }
  if (personKey === 'fred')     return dayEvts.filter(e => e.feed === 'fred_outlook' || e.feed === 'fred_custody');
  if (personKey === 'charissa') return dayEvts.filter(e => e.feed === 'charissa_custody');
  if (personKey === 'all')      return dayEvts.filter(e => e.feed !== 'idea');
  if (personKey === 'ideas')    return dayEvts.filter(e => e.feed === 'idea');
  return [];
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Calendar() {
  // Default view: weekly table (per user preference)
  const [view,      setView]      = useState<ViewMode>('week');
  const [current,   setCurrent]   = useState(new Date());
  const [icsEvents, setIcsEvents] = useState<CalEvent[]>([]);
  const [ideas,     setIdeas]     = useState<Idea[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [dayModal,  setDayModal]  = useState<Date | null>(null);
  const [ideaModal, setIdeaModal] = useState<{ date?: string; id?: string } | null>(null);

  const today     = todayMidnight();
  const allEvents = [...icsEvents, ...ideas.map(ideaToEvent)];

  // Load feeds + ideas on mount
  useEffect(() => {
    setLoading(true);
    Promise.all([loadAllFeeds(), fetchIdeas()])
      .then(([ics, ideaData]) => {
        // Debug: show what was loaded and what's near today
        const t = new Date();
        const s = new Date(t.getFullYear(), t.getMonth(), t.getDate());
        const e = new Date(s.getTime() + 86_400_000);
        const todayIcs = ics.filter(ev => ev.start < e && ev.end > s);
        console.log('[calendar] loaded ics:', ics.length, '| today matches:', todayIcs.length);
        if (ics.length > 0) {
          const sample = ics[0];
          console.log('[calendar] sample event:', sample.feed, sample.title, 'start:', sample.start.toISOString(), 'allDay:', sample.allDay);
        }
        todayIcs.forEach(ev => console.log('[calendar] TODAY:', ev.feed, ev.title, ev.start.toISOString()));
        setIcsEvents(ics);
        setIdeas(ideaData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Idea CRUD
  async function handleSaveIdea(title: string, date: string, note: string) {
    if (ideaModal?.id) await updateIdea(ideaModal.id, title, date, note);
    else               await createIdea(title, date, note);
    await refreshIdeas();
  }
  async function handleDeleteIdea() {
    if (ideaModal?.id) { await deleteIdea(ideaModal.id); await refreshIdeas(); }
  }

  // Navigation
  function goPrev() {
    setCurrent(c => view==='month'
      ? new Date(c.getFullYear(), c.getMonth()-1, 1)
      : addDays(c, -7));
  }
  function goNext() {
    setCurrent(c => view==='month'
      ? new Date(c.getFullYear(), c.getMonth()+1, 1)
      : addDays(c, 7));
  }

  const periodLabel = view === 'month'
    ? current.toLocaleDateString('en-US', { month:'long', year:'numeric' })
    : (() => {
        const ws = weekStart(current), we = addDays(ws, 6);
        return `${ws.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${we.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
      })();

  const editingIdea = ideaModal?.id ? ideas.find(i => i.id===ideaModal.id) : undefined;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Header ── */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex-1 min-w-fit">
            Family Calendar
          </h1>

          {/* Loading bar */}
          {loading && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-100 dark:bg-blue-900 overflow-hidden">
              <div className="h-full w-1/3 bg-blue-500 animate-[slide_1s_linear_infinite]" />
            </div>
          )}

          {/* Nav controls */}
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

          {/* View toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
            {(['week','month'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  view===v
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}>
                {v.charAt(0).toUpperCase()+v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Calendar body ── */}
      <main className="max-w-screen-xl mx-auto px-4 py-4">
        {view === 'week'
          ? <WeekTable current={current} today={today} allEvents={allEvents} onDayDetail={setDayModal} onAddIdea={d=>setIdeaModal({date:d})} />
          : <MonthGrid current={current} today={today} allEvents={allEvents} onDayDetail={setDayModal} onAddIdea={d=>setIdeaModal({date:d})} />
        }
      </main>

      {/* ── Legend ── */}
      <div className="max-w-screen-xl mx-auto px-4 pb-8 flex flex-wrap gap-3 items-center">
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mr-1">Legend</span>
        {[
          { label: 'Henry',              cls: 'bg-blue-400'   },
          { label: 'George',             cls: 'bg-green-400'  },
          { label: 'Mabel',              cls: 'bg-pink-400'   },
          { label: 'Everett',            cls: 'bg-rose-400'   },
          { label: 'Fred',               cls: 'bg-yellow-400' },
          { label: 'Charissa',           cls: 'bg-cyan-400'   },
          { label: 'All',                cls: 'bg-purple-400' },
          { label: "Fred's Custody",     cls: 'bg-blue-600'   },
          { label: "Charissa's Custody", cls: 'bg-green-600'  },
          { label: "Fred's Outlook",     cls: 'bg-slate-700 dark:bg-slate-600' },
          { label: '💡 Ideas',           cls: 'bg-amber-400 border border-dashed border-amber-600' },
        ].map(({label,cls}) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span className={`w-3 h-3 rounded-sm flex-shrink-0 ${cls}`} />
            {label}
          </span>
        ))}
      </div>

      {/* ── Modals ── */}
      {dayModal && (
        <DayDetailModal
          date={dayModal}
          events={eventsForDay(dayModal, allEvents)}
          onClose={() => setDayModal(null)}
          onEditIdea={id => { setDayModal(null); setIdeaModal({id}); }}
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

// ── Weekly Table — person × day matrix ────────────────────────────────────

interface GridProps {
  current:     Date;
  today:       Date;
  allEvents:   CalEvent[];
  onDayDetail: (d: Date) => void;
  onAddIdea:   (dateStr: string) => void;
}

function WeekTable({ current, today, allEvents, onDayDetail, onAddIdea }: GridProps) {
  const ws   = weekStart(current);
  const days = Array.from({length:7}, (_,i) => addDays(ws, i));

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto shadow-sm bg-white dark:bg-gray-900">
      <table className="min-w-[760px] w-full border-collapse text-sm">

        {/* ── Column headers ── */}
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <th className="w-24 py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
              Person
            </th>
            {days.map(day => {
              const isToday = sameDay(day, today);
              return (
                <th key={isoDate(day)}
                  className={`py-2 px-2 text-center border-r border-gray-100 dark:border-gray-700 last:border-r-0 font-normal ${isToday ? 'bg-red-50 dark:bg-red-950/30' : ''}`}>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {day.toLocaleDateString('en-US', {weekday:'short'})}
                    </span>
                    <button
                      onClick={() => onDayDetail(day)}
                      className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-medium transition-colors ${
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

        {/* ── Person rows ── */}
        <tbody>
          {PERSONS.map(({ key, label }) => (
            <tr key={key} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">

              {/* Row label */}
              <td className={`py-2 px-3 font-semibold text-[11px] uppercase tracking-wide border-r ${ROW_HEADER_CLS[key]} whitespace-nowrap`}>
                {label}
              </td>

              {/* Day cells */}
              {days.map(day => {
                const dateStr    = isoDate(day);
                const isToday    = sameDay(day, today);
                const personEvts = eventsForPersonDay(key, day, allEvents);

                return (
                  <td key={dateStr}
                    className={`align-top p-1 min-w-[90px] border-r border-gray-100 dark:border-gray-800 last:border-r-0 ${CELL_BG_CLS[key]} ${
                      isToday ? 'ring-2 ring-inset ring-red-300 dark:ring-red-700' : ''
                    }`}>
                    <div className="space-y-0.5 min-h-[36px]">
                      {personEvts.map(e => (
                        <EventChip key={e.id} event={e} onClick={() => onDayDetail(day)} />
                      ))}
                      {key === 'ideas' && (
                        <button
                          onClick={() => onAddIdea(dateStr)}
                          className="text-[10px] text-gray-400 dark:text-gray-600 hover:text-amber-600 dark:hover:text-amber-400 transition-colors px-1"
                          title="Add idea">
                          + add
                        </button>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Month Grid (secondary view) ────────────────────────────────────────────

function MonthGrid({ current, today, allEvents, onDayDetail, onAddIdea }: GridProps) {
  const year  = current.getFullYear();
  const month = current.getMonth();

  const firstDay  = new Date(year, month, 1);
  const lastDay   = new Date(year, month+1, 0);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - dayOffset(firstDay));
  const gridEnd   = new Date(lastDay);
  gridEnd.setDate(lastDay.getDate() + (6 - dayOffset(lastDay)));

  const days: Date[] = [];
  for (let d=new Date(gridStart); d<=gridEnd; d=addDays(d,1)) days.push(new Date(d));

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {/* DOW headers */}
      <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
          <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 border-t border-gray-200 dark:border-gray-700 bg-gray-200 dark:bg-gray-700 gap-px">
        {days.map(day => {
          const dayEvts  = eventsForDay(day, allEvents);
          const custody  = custodyFeedForDay(dayEvts);
          const nonCust  = dayEvts.filter(e => !isCustodyBg(e));
          const isToday  = sameDay(day, today);
          const inMonth  = day.getMonth()===month;
          const dateStr  = isoDate(day);

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
                {nonCust.slice(0,3).map(e => <EventChip key={e.id} event={e} />)}
                {nonCust.length > 3 && (
                  <button onClick={() => onDayDetail(day)}
                    className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:underline pl-1">
                    +{nonCust.length-3} more
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

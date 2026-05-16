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
const CUSTODY_CHIP: Record<string, string> = {
  fred_custody:     'bg-blue-600  text-white',
  charissa_custody: 'bg-green-600 text-white',
};

// ── Calendar ───────────────────────────────────────────────────────────────

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
      .then(([ics, ideaData]) => { setIcsEvents(ics); setIdeas(ideaData); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const refreshIdeas = useCallback(async () => setIdeas(await fetchIdeas()), []);

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
          ? <WeekTable  current={current} today={today} allEvents={allEvents} onDayDetail={setDayModal} onAddIdea={d=>setIdeaModal({date:d})} />
          : <MonthGrid  current={current} today={today} allEvents={allEvents} onDayDetail={setDayModal} onAddIdea={d=>setIdeaModal({date:d})} />
        }
      </main>

      {/* ── Legend ── */}
      <div className="max-w-screen-xl mx-auto px-4 pb-8 flex flex-wrap gap-4 items-center">
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Legend</span>
        {[
          { label:"Fred's Custody",     cls:'bg-blue-600' },
          { label:"Charissa's Custody", cls:'bg-green-600' },
          { label:"Fred's Outlook",     cls:'bg-slate-700 dark:bg-slate-600' },
          { label:'💡 Ideas',           cls:'bg-amber-400 border border-dashed border-amber-600' },
        ].map(({label,cls})=>(
          <span key={label} className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
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

// ── Weekly Table (primary view) ────────────────────────────────────────────

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
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            {days.map(day => {
              const isToday = sameDay(day, today);
              return (
                <th key={isoDate(day)}
                  className="p-0 border-r border-gray-200 dark:border-gray-700 last:border-r-0 font-normal w-[14.285%]">
                  <div className="py-2 px-1 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                      {day.toLocaleDateString('en-US',{weekday:'short'})}
                    </div>
                    <button
                      onClick={() => onDayDetail(day)}
                      className={`w-8 h-8 mx-auto flex items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                        isToday
                          ? 'bg-red-500 text-white'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
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
          <tr>
            {days.map(day => {
              const dayEvts = eventsForDay(day, allEvents);
              const custody = custodyFeedForDay(dayEvts);
              const nonCust = dayEvts.filter(e => !isCustodyBg(e));
              const isToday = sameDay(day, today);
              const dateStr = isoDate(day);

              return (
                <td key={dateStr} valign="top"
                  className={`border-r border-gray-200 dark:border-gray-700 last:border-r-0 p-1.5 align-top min-h-[240px] group ${
                    custody ? CUSTODY_BG[custody] : 'bg-white dark:bg-gray-900'
                  } ${isToday ? 'ring-2 ring-inset ring-red-400' : ''}`}
                  style={{height: '240px'}}>

                  {/* Custody pill */}
                  {custody && (
                    <div className={`text-[10px] font-semibold rounded px-1.5 py-0.5 mb-1 ${CUSTODY_CHIP[custody]}`}>
                      {custody==='fred_custody' ? "Fred" : "Charissa"}
                    </div>
                  )}

                  {/* Event chips */}
                  <div className="space-y-0.5">
                    {nonCust.map(e => (
                      <EventChip key={e.id} event={e} size="sm"
                        onClick={e.feed==='idea' ? () => {} : undefined} />
                    ))}
                  </div>

                  {/* Add idea button */}
                  <button
                    onClick={() => onAddIdea(dateStr)}
                    className="mt-1 opacity-0 group-hover:opacity-100 w-full text-left text-[10px] text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-all px-0.5"
                    title="Add idea">
                    + idea
                  </button>
                </td>
              );
            })}
          </tr>
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

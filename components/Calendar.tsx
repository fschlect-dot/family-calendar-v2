'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CalEvent, Idea, ViewMode } from '@/lib/types';
import { loadAllFeeds } from '@/lib/feeds';
import { createIdea, deleteIdea, fetchIdeas, updateIdea } from '@/lib/supabase';
import EventChip from './EventChip';
import DayDetailModal from './DayDetailModal';
import IdeaModal from './IdeaModal';

// ── Helpers ────────────────────────────────────────────────────────────────

function dayOffset(d: Date) { return (d.getDay() + 6) % 7; } // 0=Mon … 6=Sun

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - dayOffset(d));
  return d;
}

function todayMidnight(): Date {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function eventsForDay(day: Date, events: CalEvent[]): CalEvent[] {
  const s = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const e = new Date(s.getTime() + 86_400_000);
  return events.filter((ev) => ev.start < e && ev.end > s);
}

function custodyFeedForDay(evts: CalEvent[]): string | null {
  const c = evts.find(
    (e) => e.allDay && (e.feed === 'fred_custody' || e.feed === 'charissa_custody')
  );
  return c?.feed ?? null;
}

function isCustodyBg(e: CalEvent): boolean {
  return e.allDay && (e.feed === 'fred_custody' || e.feed === 'charissa_custody');
}

function ideaToEvent(idea: Idea): CalEvent {
  const start = new Date(idea.date + 'T00:00:00');
  const end   = new Date(start.getTime() + 86_400_000);
  return { id: idea.id, title: idea.title, start, end, allDay: true, feed: 'idea', note: idea.note };
}

const CUSTODY_BG: Record<string, string> = {
  fred_custody:     'bg-blue-50',
  charissa_custody: 'bg-green-50',
};

// ── Main component ─────────────────────────────────────────────────────────

export default function Calendar() {
  const [view,      setView]      = useState<ViewMode>('month');
  const [current,   setCurrent]   = useState(new Date());
  const [icsEvents, setIcsEvents] = useState<CalEvent[]>([]);
  const [ideas,     setIdeas]     = useState<Idea[]>([]);
  const [loading,   setLoading]   = useState(true);

  // modal state
  const [dayModal,  setDayModal]  = useState<Date | null>(null);
  const [ideaModal, setIdeaModal] = useState<{ date?: string; id?: string } | null>(null);

  const today = todayMidnight();

  // Combine ICS events + ideas into a single array
  const allEvents: CalEvent[] = [...icsEvents, ...ideas.map(ideaToEvent)];

  // ── Load data ────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    Promise.all([loadAllFeeds(), fetchIdeas()])
      .then(([ics, ideasData]) => {
        setIcsEvents(ics);
        setIdeas(ideasData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const refreshIdeas = useCallback(async () => {
    const data = await fetchIdeas();
    setIdeas(data);
  }, []);

  // ── Idea CRUD ────────────────────────────────────────────────────────────

  async function handleSaveIdea(title: string, date: string, note: string) {
    if (ideaModal?.id) {
      await updateIdea(ideaModal.id, title, date, note);
    } else {
      await createIdea(title, date, note);
    }
    await refreshIdeas();
  }

  async function handleDeleteIdea() {
    if (ideaModal?.id) {
      await deleteIdea(ideaModal.id);
      await refreshIdeas();
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  function goPrev() {
    setCurrent((c) =>
      view === 'month'
        ? new Date(c.getFullYear(), c.getMonth() - 1, 1)
        : addDays(c, -7)
    );
  }
  function goNext() {
    setCurrent((c) =>
      view === 'month'
        ? new Date(c.getFullYear(), c.getMonth() + 1, 1)
        : addDays(c, 7)
    );
  }

  // ── Period label ─────────────────────────────────────────────────────────

  const periodLabel = view === 'month'
    ? current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : (() => {
        const ws = weekStart(current);
        const we = addDays(ws, 6);
        return `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      })();

  // ── Render ───────────────────────────────────────────────────────────────

  const editingIdea = ideaModal?.id ? ideas.find((i) => i.id === ideaModal.id) : undefined;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900 flex-1 min-w-fit">Family Calendar</h1>

          {/* Loading indicator */}
          {loading && (
            <div className="h-1 absolute bottom-0 left-0 right-0 bg-blue-100 overflow-hidden">
              <div className="h-full w-1/3 bg-blue-500 animate-[slide_1s_linear_infinite]" />
            </div>
          )}

          {/* Nav */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrent(new Date())}
              className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Today
            </button>
            <button
              onClick={goPrev}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-lg leading-none"
              aria-label="Previous"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-gray-900 min-w-[160px] text-center px-1">
              {periodLabel}
            </span>
            <button
              onClick={goNext}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-lg leading-none"
              aria-label="Next"
            >
              ›
            </button>
          </div>

          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {(['month', 'week'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  view === v
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Calendar ── */}
      <main className="max-w-screen-xl mx-auto px-4 py-4">
        {view === 'month'
          ? <MonthGrid current={current} today={today} allEvents={allEvents} onDayDetail={setDayModal} onAddIdea={(d) => setIdeaModal({ date: d })} />
          : <WeekGrid  current={current} today={today} allEvents={allEvents} onDayDetail={setDayModal} onAddIdea={(d) => setIdeaModal({ date: d })} />
        }
      </main>

      {/* ── Legend ── */}
      <div className="max-w-screen-xl mx-auto px-4 pb-8 flex flex-wrap gap-4 items-center">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Legend</span>
        {[
          { label: "Fred's Custody",     cls: 'bg-blue-600' },
          { label: "Charissa's Custody", cls: 'bg-green-600' },
          { label: "Fred's Outlook",     cls: 'bg-slate-800' },
          { label: '💡 Ideas',           cls: 'bg-amber-400 border border-dashed border-amber-600' },
        ].map(({ label, cls }) => (
          <span key={label} className="flex items-center gap-1.5 text-sm text-gray-600">
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
          onEditIdea={(id) => { setDayModal(null); setIdeaModal({ id }); }}
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

// ── Month Grid ─────────────────────────────────────────────────────────────

interface GridProps {
  current:     Date;
  today:       Date;
  allEvents:   CalEvent[];
  onDayDetail: (d: Date) => void;
  onAddIdea:   (dateStr: string) => void;
}

function MonthGrid({ current, today, allEvents, onDayDetail, onAddIdea }: GridProps) {
  const year  = current.getFullYear();
  const month = current.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - dayOffset(firstDay));

  const gridEnd = new Date(lastDay);
  gridEnd.setDate(lastDay.getDate() + (6 - dayOffset(lastDay)));

  const days: Date[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
    days.push(new Date(d));
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-gray-200 gap-px grid grid-cols-7">
      {/* DOW headers */}
      {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
        <div key={d} className="bg-white py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {d}
        </div>
      ))}

      {/* Day cells */}
      {days.map((day) => {
        const dayEvts  = eventsForDay(day, allEvents);
        const custody  = custodyFeedForDay(dayEvts);
        const nonCust  = dayEvts.filter((e) => !isCustodyBg(e));
        const isToday  = sameDay(day, today);
        const inMonth  = day.getMonth() === month;
        const dateStr  = isoDate(day);

        return (
          <div
            key={dateStr}
            className={`min-h-[100px] p-1 group ${inMonth ? (custody ? CUSTODY_BG[custody] : 'bg-white') : 'bg-gray-50'} ${isToday ? 'ring-2 ring-inset ring-red-400' : ''}`}
          >
            {/* Cell header */}
            <div className="flex items-center justify-between mb-1">
              <button
                onClick={() => onDayDetail(day)}
                className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium transition-colors
                  ${isToday ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-100'}
                  ${!inMonth ? 'text-gray-300' : ''}`}
              >
                {day.getDate()}
              </button>
              <button
                onClick={() => onAddIdea(dateStr)}
                className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-all text-sm"
                title="Add idea"
                aria-label="Add idea"
              >
                +
              </button>
            </div>

            {/* Events */}
            <div className="space-y-0.5">
              {nonCust.slice(0, 3).map((e) => (
                <EventChip
                  key={e.id}
                  event={e}
                  onClick={e.feed === 'idea' ? undefined : undefined}
                />
              ))}
              {nonCust.length > 3 && (
                <button
                  onClick={() => onDayDetail(day)}
                  className="text-[10px] text-gray-400 hover:text-gray-600 hover:underline pl-1"
                >
                  +{nonCust.length - 3} more
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Week Grid ──────────────────────────────────────────────────────────────

function WeekGrid({ current, today, allEvents, onDayDetail, onAddIdea }: GridProps) {
  const ws   = weekStart(current);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  return (
    <div className="rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
      <div className="grid grid-cols-7 min-w-[560px] bg-gray-200 gap-px">
        {days.map((day) => {
          const dayEvts = eventsForDay(day, allEvents);
          const custody = custodyFeedForDay(dayEvts);
          const nonCust = dayEvts.filter((e) => !isCustodyBg(e));
          const isToday = sameDay(day, today);
          const dateStr = isoDate(day);

          return (
            <div
              key={dateStr}
              className={`min-h-[300px] flex flex-col group ${custody ? CUSTODY_BG[custody] : 'bg-white'} ${isToday ? 'ring-2 ring-inset ring-red-400' : ''}`}
            >
              {/* Column header */}
              <div className="p-2 text-center border-b border-gray-100 flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {day.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <button
                  onClick={() => onDayDetail(day)}
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-colors
                    ${isToday ? 'bg-red-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {day.getDate()}
                </button>
                <button
                  onClick={() => onAddIdea(dateStr)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-gray-700 transition-all"
                  title="Add idea"
                >
                  + idea
                </button>
              </div>

              {/* Events */}
              <div className="p-1.5 space-y-1 flex-1">
                {custody && (
                  <div className={`text-xs font-semibold rounded px-1.5 py-1 ${custody === 'fred_custody' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>
                    {custody === 'fred_custody' ? "Fred's custody" : "Charissa's custody"}
                  </div>
                )}
                {nonCust.map((e) => (
                  <EventChip key={e.id} event={e} size="md" />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

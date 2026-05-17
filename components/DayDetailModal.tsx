'use client';

import { useEffect } from 'react';
import type { CalEvent, FamilyEvent } from '@/lib/types';
import { eventTypeConfig } from '@/lib/eventTypes';

interface Props {
  date:          Date;
  icsEvents:     CalEvent[];
  familyEvents:  FamilyEvent[];
  onClose:       () => void;
  onEditEvent:   (event: FamilyEvent) => void;
}

const DOT_COLORS: Record<string, string> = {
  fred_custody:     'bg-blue-600',
  fred_outlook:     'bg-slate-700 dark:bg-slate-500',
  charissa_custody: 'bg-green-600',
};

function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function DayDetailModal({ date, icsEvents, familyEvents, onClose, onEditEvent }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const heading = date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 p-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 leading-snug">{heading}</h2>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded p-1 transition-colors flex-shrink-0"
            aria-label="Close">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {icsEvents.length === 0 && familyEvents.length === 0 && (
            <p className="text-center text-gray-400 dark:text-gray-500 py-6">No events this day.</p>
          )}

          {/* ICS events */}
          {icsEvents.map(event => (
            <div key={event.id} className="flex items-start gap-3">
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT_COLORS[event.feed] ?? 'bg-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{event.title}</p>
                {!event.allDay && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {event.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Family events */}
          {familyEvents.map(event => {
            const cfg = eventTypeConfig[event.event_type];
            return (
              <div key={event.id} className="flex items-start gap-3">
                <span className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cfg.color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {cfg.icon} {event.title}
                  </p>
                  {(event.start_time || event.end_time) && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {event.start_time ? fmt12(event.start_time) : ''}
                      {event.start_time && event.end_time ? ' – ' : ''}
                      {event.end_time ? fmt12(event.end_time) : ''}
                    </p>
                  )}
                  {event.location && (
                    <p className="text-xs text-gray-400 mt-0.5">📍 {event.location}</p>
                  )}
                  {event.people && event.people.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5 capitalize">
                      {event.people.join(', ')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { onClose(); onEditEvent(event); }}
                  className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex-shrink-0 transition-colors"
                >
                  Edit
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

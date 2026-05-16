'use client';

import { useEffect } from 'react';
import type { CalEvent } from '@/lib/types';
import EventChip from './EventChip';

interface Props {
  date: Date;
  events: CalEvent[];
  onClose: () => void;
  onEditIdea: (id: string) => void;
}

const DOT_COLORS: Record<string, string> = {
  fred_custody:     'bg-blue-600',
  fred_outlook:     'bg-slate-800',
  charissa_custody: 'bg-green-600',
  idea:             'bg-amber-500',
};

export default function DayDetailModal({ date, events, onClose, onEditIdea }: Props) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const heading = date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 leading-snug">{heading}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded p-1 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Event list */}
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          {events.length === 0 && (
            <p className="text-center text-gray-400 py-6">No events this day.</p>
          )}
          {events.map((event) => (
            <div key={event.id} className="flex items-start gap-3">
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT_COLORS[event.feed] ?? 'bg-gray-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">
                  {event.feed === 'idea' ? '💡 ' : ''}{event.title}
                </p>
                {!event.allDay && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {event.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                )}
                {event.note && (
                  <p className="text-xs text-gray-500 italic mt-0.5">{event.note}</p>
                )}
              </div>
              {event.feed === 'idea' && (
                <button
                  onClick={() => onEditIdea(event.id)}
                  className="text-xs text-gray-400 hover:text-gray-700 flex-shrink-0"
                >
                  Edit
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

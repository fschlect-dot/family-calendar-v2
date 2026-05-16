'use client';

import type { CalEvent } from '@/lib/types';

interface Props {
  event: CalEvent;
  onClick?: () => void;
  size?: 'sm' | 'md';
}

// Chip colours are intentionally vivid so they read in both light and dark
const CHIP_STYLES: Record<string, string> = {
  fred_custody:     'bg-blue-600 text-white',
  fred_outlook:     'bg-slate-700 text-white dark:bg-slate-600',
  charissa_custody: 'bg-green-600 text-white',
  idea:             'bg-amber-100 text-amber-700 border border-dashed border-amber-500 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-500',
};

export default function EventChip({ event, onClick, size = 'sm' }: Props) {
  const base   = CHIP_STYLES[event.feed] ?? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
  const cursor = onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default';
  const text   = size === 'sm' ? 'text-[11px]' : 'text-xs';
  const pad    = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  const prefix = event.feed === 'idea' ? '💡 ' : '';
  const time   = !event.allDay
    ? event.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' '
    : '';

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      title={event.title}
      className={`${base} ${cursor} ${text} ${pad} rounded font-medium truncate leading-tight select-none`}
    >
      {time && <span className="opacity-75 font-normal">{time}</span>}
      {prefix}{event.title}
    </div>
  );
}

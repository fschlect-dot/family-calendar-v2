'use client';

import { useEffect, useState } from 'react';
import type { FamilyEvent, EventType } from '@/lib/types';
import { eventTypeConfig } from '@/lib/eventTypes';

const PEOPLE_OPTIONS = [
  { key: 'henry',    label: 'Henry'    },
  { key: 'george',   label: 'George'   },
  { key: 'mabel',    label: 'Mabel'    },
  { key: 'everett',  label: 'Everett'  },
  { key: 'fred',     label: 'Fred'     },
  { key: 'charissa', label: 'Charissa' },
];

const EVENT_TYPES = Object.entries(eventTypeConfig) as [EventType, typeof eventTypeConfig[EventType]][];

// ── Hour dropdown options (12-hour with AM/PM) ────────────────────────────
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`,
}));

const SELECT_CLS = 'px-1.5 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40';

// ── TimePicker — hour + minutes dropdowns ─────────────────────────────────
function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts       = value ? value.split(':') : [];
  const currentHour = parts.length === 2 ? parseInt(parts[0]) : -1;
  const currentMin  = parts.length === 2 ? parts[1] : '00';

  function handleHour(raw: string) {
    if (raw === '') { onChange(''); return; }
    const h = parseInt(raw);
    const m = currentHour === -1 ? '00' : currentMin;
    onChange(`${String(h).padStart(2, '0')}:${m}`);
  }
  function handleMin(m: string) {
    if (currentHour === -1) return;
    onChange(`${String(currentHour).padStart(2, '0')}:${m}`);
  }

  return (
    <div className="flex gap-1">
      <select value={currentHour === -1 ? '' : String(currentHour)} onChange={e => handleHour(e.target.value)} className={`flex-1 ${SELECT_CLS}`}>
        <option value="">--</option>
        {HOUR_OPTIONS.map(({ value: h, label }) => (
          <option key={h} value={String(h)}>{label}</option>
        ))}
      </select>
      <select value={currentMin} onChange={e => handleMin(e.target.value)} disabled={currentHour === -1} className={`w-14 ${SELECT_CLS}`}>
        {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}

// ── Form blank state ───────────────────────────────────────────────────────
const BLANK = {
  title:       '',
  start_date:  '',
  end_date:    '',
  start_time:  '',
  end_time:    '',
  location:    '',
  description: '',
  event_type:  'other' as EventType,
  people:      [] as string[],
};

interface Props {
  event?: FamilyEvent | null;
  defaultDate?: string;
  currentUser: string;
  onSave: (event: Omit<FamilyEvent, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClear: () => void;
}

export default function EventForm({ event, defaultDate, currentUser, onSave, onDelete, onClear }: Props) {
  const [form,     setForm]     = useState({ ...BLANK });
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (event) {
      setForm({
        title:       event.title,
        start_date:  event.start_date,
        end_date:    event.end_date,
        start_time:  event.start_time  ?? '',
        end_time:    event.end_time    ?? '',
        location:    event.location    ?? '',
        description: event.description ?? '',
        event_type:  event.event_type,
        people:      event.people ?? [],
      });
    } else {
      setForm({ ...BLANK, start_date: defaultDate ?? '', end_date: defaultDate ?? '' });
    }
  }, [event, defaultDate]);

  function set<K extends keyof typeof BLANK>(key: K, value: (typeof BLANK)[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function handleTypeChange(type: EventType) {
    setForm(f => {
      const updates: Partial<typeof BLANK> = { event_type: type };
      if (type === 'dinner') {
        updates.people    = [];
        updates.end_date  = f.start_date || f.end_date;
        updates.end_time  = '';
        if (!f.start_time) updates.start_time = '18:00';
      }
      return { ...f, ...updates };
    });
  }

  function handleStartDate(val: string) {
    setForm(f => ({
      ...f,
      start_date: val,
      // Dinner is always single-day; others keep end_date unless it would be before start
      end_date: f.event_type === 'dinner' ? val : (f.end_date < val ? val : f.end_date),
    }));
  }

  function togglePerson(key: string) {
    setForm(f => ({
      ...f,
      people: f.people.includes(key) ? f.people.filter(p => p !== key) : [...f.people, key],
    }));
  }

  const isDinner = form.event_type === 'dinner';
  const canSave  = form.title.trim() && form.start_date && form.end_date &&
                   (isDinner || form.people.length > 0);
  const cfg      = eventTypeConfig[form.event_type];
  const isEditing = !!event?.id;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        ...(event?.id ? { id: event.id } : {}),
        user_id:     currentUser,
        title:       form.title.trim(),
        start_date:  form.start_date,
        end_date:    isDinner ? form.start_date : form.end_date,
        start_time:  form.start_time || null,
        end_time:    isDinner ? null : (form.end_time || null),
        location:    form.location    || null,
        description: form.description || null,
        event_type:  form.event_type,
        people:      isDinner ? [] : form.people,
      });
      setForm({ ...BLANK });
      onClear();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event?.id || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(event.id);
      onClear();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {isEditing ? 'Edit Event' : 'New Event'}
        </h2>
        {isEditing && (
          <button onClick={onClear} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            ✕ Clear
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Title */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Title *</label>
          <input type="text" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Event name"
            className="w-full px-2 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Type</label>
          <div className="grid grid-cols-3 gap-1">
            {EVENT_TYPES.map(([type, c]) => (
              <button key={type} type="button" onClick={() => handleTypeChange(type)}
                className={`px-1 py-1 rounded-md text-xs font-medium border transition-all text-left flex items-center gap-1 ${
                  form.event_type === type
                    ? 'border-current text-white'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                style={form.event_type === type ? { backgroundColor: c.color, borderColor: c.color } : {}}>
                <span>{c.icon}</span><span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className={isDinner ? '' : 'grid grid-cols-2 gap-2'}>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              {isDinner ? 'Date *' : 'Start *'}
            </label>
            <input type="date" value={form.start_date} onChange={e => handleStartDate(e.target.value)}
              className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {!isDinner && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">End *</label>
              <input type="date" value={form.end_date} min={form.start_date} onChange={e => set('end_date', e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}
        </div>

        {/* Times */}
        <div className={isDinner ? '' : 'grid grid-cols-2 gap-2'}>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              {isDinner ? 'Time' : 'Start time'}
            </label>
            <TimePicker value={form.start_time} onChange={v => set('start_time', v)} />
          </div>
          {!isDinner && (
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">End time</label>
              <TimePicker value={form.end_time} onChange={v => set('end_time', v)} />
            </div>
          )}
        </div>

        {/* Location */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Location</label>
          <input type="text" value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Randall Park"
            className="w-full px-2 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* People — hidden for dinner */}
        {!isDinner && (
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">People *</label>
            <div className="flex flex-wrap gap-1">
              {PEOPLE_OPTIONS.map(p => (
                <button key={p.key} type="button" onClick={() => togglePerson(p.key)}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                    form.people.includes(p.key) ? 'text-white border-transparent' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                  style={form.people.includes(p.key) ? { backgroundColor: cfg.color } : {}}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Notes</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional details…" rows={3}
            className="w-full px-2 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 space-y-2 flex-shrink-0">
        <button onClick={handleSave} disabled={!canSave || saving}
          className="w-full py-2 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: canSave ? cfg.color : '#9ca3af' }}>
          {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Event'}
        </button>
        {isEditing && onDelete && (
          <button onClick={handleDelete} disabled={deleting}
            className="w-full py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40">
            {deleting ? 'Deleting…' : 'Delete Event'}
          </button>
        )}
        <button onClick={onClear}
          className="w-full py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { FamilyEvent, EventType } from '@/lib/types';
import { eventTypeConfig } from '@/lib/eventTypes';

// ── Constants ─────────────────────────────────────────────────────────────

const PEOPLE_OPTIONS = [
  { key: 'henry',    label: 'Henry'    },
  { key: 'george',   label: 'George'   },
  { key: 'mabel',    label: 'Mabel'    },
  { key: 'everett',  label: 'Everett'  },
  { key: 'fred',     label: 'Fred'     },
  { key: 'charissa', label: 'Charissa' },
];

const EVENT_TYPES = Object.entries(eventTypeConfig) as [EventType, typeof eventTypeConfig[EventType]][];

const DURATION_OPTIONS = [
  { value: '30',    label: '30 min' },
  { value: '60',    label: '1 hr'   },
  { value: '120',   label: '2 hrs'  },
  { value: 'custom', label: 'Custom' },
];

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES  = ['00', '15', '30', '45'];
type AmPm = 'AM' | 'PM';

// ── Time helpers ──────────────────────────────────────────────────────────

function parseTime(time: string): { h12: number; min: string; ampm: AmPm } | null {
  if (!time) return null;
  const [h24str, mstr] = time.split(':');
  const h24 = parseInt(h24str);
  const m   = parseInt(mstr);
  const ampm: AmPm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { h12, min: String(m).padStart(2, '0'), ampm };
}

function buildTime(h12: number, min: string, ampm: AmPm): string {
  let h24 = h12;
  if (ampm === 'AM' && h12 === 12) h24 = 0;
  else if (ampm === 'PM' && h12 !== 12) h24 = h12 + 12;
  return `${String(h24).padStart(2, '0')}:${min}`;
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function fmt12(t: string): string {
  const parsed = parseTime(t);
  if (!parsed) return '';
  return `${parsed.h12}:${parsed.min} ${parsed.ampm}`;
}

function getDuration(start: string, end: string): string {
  if (!start || !end) return '60';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff === 30) return '30';
  if (diff === 60) return '60';
  if (diff === 120) return '120';
  return 'custom';
}

// ── TimePicker — hour / min / AM-PM ───────────────────────────────────────

const SEL = 'px-1.5 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-40';

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseTime(value);
  const h12  = parsed?.h12  ?? -1;
  const min  = parsed?.min  ?? '00';
  const ampm = parsed?.ampm ?? 'AM';

  function handleH(raw: string) {
    if (!raw) { onChange(''); return; }
    onChange(buildTime(parseInt(raw), min, ampm));
  }
  function handleM(m: string) {
    if (h12 === -1) return;
    onChange(buildTime(h12, m, ampm));
  }
  function handleAp(ap: AmPm) {
    if (h12 === -1) return;
    onChange(buildTime(h12, min, ap));
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <select value={h12 === -1 ? '' : h12} onChange={e => handleH(e.target.value)} className={SEL}>
        <option value="">--</option>
        {HOURS_12.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-gray-400 text-xs">:</span>
      <select value={min} onChange={e => handleM(e.target.value)} disabled={h12 === -1} className={SEL}>
        {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <div className="flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
        {(['AM', 'PM'] as AmPm[]).map(ap => (
          <button key={ap} type="button" disabled={h12 === -1} onClick={() => handleAp(ap)}
            className={`px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
              ampm === ap && h12 !== -1
                ? 'bg-blue-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}>
            {ap}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Form blank state ───────────────────────────────────────────────────────

const BLANK = {
  title:       '',
  start_date:  '',
  end_date:    '',
  start_time:  '',
  end_time:    '',    // used only when duration === 'custom'
  duration:    '60',  // '30' | '60' | '120' | 'custom'
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
      const dur = getDuration(event.start_time ?? '', event.end_time ?? '');
      setForm({
        title:       event.title,
        start_date:  event.start_date,
        end_date:    event.end_date,
        start_time:  event.start_time ?? '',
        end_time:    event.end_time   ?? '',
        duration:    dur,
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
        updates.people   = [];
        updates.end_date = f.start_date || f.end_date;
        updates.end_time = '';
        if (!f.start_time) updates.start_time = '18:00';
      }
      return { ...f, ...updates };
    });
  }

  function handleStartDate(val: string) {
    setForm(f => ({
      ...f,
      start_date: val,
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
  const cfg      = eventTypeConfig[form.event_type];
  const isEditing = !!event?.id;
  const canSave   = form.title.trim() && form.start_date && form.end_date &&
                    (isDinner || form.people.length > 0);

  // Computed end time for display hint
  const computedEndDisplay = !isDinner && form.start_time && form.duration !== 'custom'
    ? fmt12(addMinutes(form.start_time, parseInt(form.duration)))
    : null;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const computedEndTime = (() => {
      if (isDinner || !form.start_time) return null;
      if (form.duration === 'custom') return form.end_time || null;
      return addMinutes(form.start_time, parseInt(form.duration));
    })();
    try {
      await onSave({
        ...(event?.id ? { id: event.id } : {}),
        user_id:     currentUser,
        title:       form.title.trim(),
        start_date:  form.start_date,
        end_date:    isDinner ? form.start_date : form.end_date,
        start_time:  form.start_time || null,
        end_time:    computedEndTime,
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

        {/* Start time */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
            {isDinner ? 'Time' : 'Start time'}
          </label>
          <TimePicker value={form.start_time} onChange={v => set('start_time', v)} />
        </div>

        {/* Duration (non-dinner only) */}
        {!isDinner && (
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              Duration
            </label>
            <div className="flex flex-wrap gap-1">
              {DURATION_OPTIONS.map(opt => (
                <button key={opt.value} type="button" onClick={() => set('duration', opt.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    form.duration === opt.value
                      ? 'text-white border-transparent'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                  }`}
                  style={form.duration === opt.value ? { backgroundColor: cfg.color } : {}}>
                  {opt.label}
                </button>
              ))}
            </div>
            {/* Hint: computed end time */}
            {computedEndDisplay && (
              <p className="text-[10px] text-gray-400 mt-1">Ends at {computedEndDisplay}</p>
            )}
            {/* Custom end time picker */}
            {form.duration === 'custom' && (
              <div className="mt-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">End time</label>
                <TimePicker value={form.end_time} onChange={v => set('end_time', v)} />
              </div>
            )}
          </div>
        )}

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

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnon);

// ── Ideas CRUD ─────────────────────────────────────────────────────────────

export async function fetchIdeas() {
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .order('date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createIdea(title: string, date: string, note?: string) {
  const { data, error } = await supabase
    .from('ideas')
    .insert({ title, date, note: note || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateIdea(id: string, title: string, date: string, note?: string) {
  const { error } = await supabase
    .from('ideas')
    .update({ title, date, note: note || null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteIdea(id: string) {
  const { error } = await supabase
    .from('ideas')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Weekly Notes CRUD ──────────────────────────────────────────────────────

// Event entries are stored with this prefix so they're distinguishable from
// regular inline notes without requiring a separate DB column.
export const EVENT_NOTE_PREFIX = '##EVENT##';

export function isEventNoteText(t: string) { return t.startsWith(EVENT_NOTE_PREFIX); }
export function stripEventPrefix(t: string) { return t.slice(EVENT_NOTE_PREFIX.length); }

/**
 * Returns two maps keyed by "${person}|${date}":
 *   notes      — regular inline notes
 *   eventNotes — multi-day events created via the event form
 */
export async function fetchAllNotes(): Promise<{
  notes: Record<string, string>;
  eventNotes: Record<string, string>;
}> {
  const { data, error } = await supabase
    .from('weekly_notes')
    .select('date, person, note_text');
  if (error) throw error;

  const notes: Record<string, string>      = {};
  const eventNotes: Record<string, string> = {};

  for (const row of data ?? []) {
    const key = `${row.person}|${row.date}`;
    if (isEventNoteText(row.note_text)) {
      eventNotes[key] = stripEventPrefix(row.note_text);
    } else {
      notes[key] = row.note_text;
    }
  }

  return { notes, eventNotes };
}

/** Upsert a regular inline note; deletes the row when text is empty. */
export async function upsertNote(date: string, person: string, text: string): Promise<void> {
  if (!text.trim()) {
    const { error } = await supabase
      .from('weekly_notes')
      .delete()
      .eq('date', date)
      .eq('person', person);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('weekly_notes')
      .upsert({ date, person, note_text: text.trim() }, { onConflict: 'date,person' });
    if (error) throw error;
  }
}

/** Create (or overwrite) multi-day event entries across a date range and set of persons. */
export async function createEventNotes(
  dates: string[],
  persons: string[],
  text: string,
): Promise<void> {
  const rows = dates.flatMap(date =>
    persons.map(person => ({
      date,
      person,
      note_text: `${EVENT_NOTE_PREFIX}${text}`,
    }))
  );
  const { error } = await supabase
    .from('weekly_notes')
    .upsert(rows, { onConflict: 'date,person' });
  if (error) throw error;
}

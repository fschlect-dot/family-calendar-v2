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

/** Returns all notes as a flat map keyed by "${person}|${date}". */
export async function fetchAllNotes(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('weekly_notes')
    .select('date, person, note_text');
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[`${row.person}|${row.date}`] = row.note_text;
  }
  return map;
}

/** Upsert a note; deletes the row when text is empty. */
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

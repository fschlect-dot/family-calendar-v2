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

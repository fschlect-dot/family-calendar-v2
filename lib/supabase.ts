import { createClient } from '@supabase/supabase-js';
import type { FamilyEvent } from './types';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnon);

// ── Events CRUD ─────────────────────────────────────────────────────────────

export async function getEventsByDateRange(
  rangeStart: string,
  rangeEnd: string,
): Promise<FamilyEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .lte('start_date', rangeEnd)
    .gte('end_date', rangeStart)
    .order('start_date', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getEventById(id: string): Promise<FamilyEvent | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function saveEvent(
  event: Omit<FamilyEvent, 'id' | 'created_at' | 'updated_at'> & { id?: string },
): Promise<FamilyEvent> {
  const payload = { ...event, updated_at: new Date().toISOString() };
  if (payload.id) {
    const { data, error } = await supabase
      .from('events')
      .update(payload)
      .eq('id', payload.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { id: _id, ...insert } = payload as typeof payload & { id?: string };
    void _id;
    const { data, error } = await supabase
      .from('events')
      .insert(insert)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}


export type FeedName = 'fred_custody' | 'fred_outlook' | 'charissa_custody';

export interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  feed: FeedName;
  note?: string;
}

export type EventType = 'sports' | 'school' | 'trip' | 'work' | 'birthday' | 'other';

export interface FamilyEvent {
  id: string;
  user_id?: string | null;
  title: string;
  start_date: string;          // YYYY-MM-DD
  end_date: string;            // YYYY-MM-DD
  start_time?: string | null;  // HH:MM
  end_time?: string | null;
  location?: string | null;
  description?: string | null;
  event_type: EventType;
  color_override?: string | null;
  people?: string[] | null;    // lowercase person keys: henry, george, etc.
  created_at?: string;
  updated_at?: string;
}

export type ViewMode = 'month' | 'week';

export interface WeeklyNote {
  id: string;
  date: string;   // YYYY-MM-DD
  person: string;
  note_text: string;
  created_at?: string;
}

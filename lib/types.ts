export type FeedName = 'fred_custody' | 'fred_outlook' | 'charissa_custody' | 'idea';

export interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  feed: FeedName;
  note?: string;
}

export interface Idea {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  note?: string;
  created_at?: string;
}

export type ViewMode = 'month' | 'week';

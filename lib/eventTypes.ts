import type { EventType } from './types';

export const eventTypeConfig: Record<EventType, { color: string; icon: string; label: string }> = {
  sports:   { color: '#f59e0b', icon: '⚾', label: 'Sports'   },
  school:   { color: '#3b82f6', icon: '📚', label: 'School'   },
  trip:     { color: '#ec4899', icon: '✈️', label: 'Trip'     },
  work:     { color: '#8b5cf6', icon: '💼', label: 'Work'     },
  birthday: { color: '#ef4444', icon: '🎂', label: 'Birthday' },
  other:    { color: '#6b7280', icon: '📌', label: 'Other'    },
};

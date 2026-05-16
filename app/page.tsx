'use client';

import React, { useState, useEffect } from 'react';
import { startOfWeek, addWeeks, subWeeks, format } from 'date-fns';
import { WeeklyTable } from '@/components/WeeklyTable';
import { FilterPanel } from '@/components/FilterPanel';
import type { CalendarEvent } from '@/lib/types';

export default function Home() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/events');
        const data = await response.json();
        setEvents(data);
      } catch (error) {
        console.error('Failed to fetch events:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, []);

  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekEnd = addWeeks(weekStart, 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Family Calendar</h1>
            <p className="text-gray-600 mt-1">Weekly overview of family activities</p>
            <p className="text-sm text-gray-500 mt-2">{format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedWeek(subWeeks(selectedWeek, 1))} className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">← Previous</button>
            <button onClick={() => setSelectedWeek(new Date())} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Today</button>
            <button onClick={() => setSelectedWeek(addWeeks(selectedWeek, 1))} className="px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50">Next →</button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading calendar...</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="w-full lg:w-56"><FilterPanel /></div>
            <div className="flex-1"><WeeklyTable events={events} selectedWeek={selectedWeek} onDateClick={() => {}} /></div>
          </div>
        )}
      </div>
    </div>
  );
}
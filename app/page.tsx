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
  const [filters, setFilters] = useState({
    people: ['Henry', 'George', 'Mabel', 'Everett', 'Fred', 'Charissa', 'All', 'Ideas'],
    sources: ['custody_xchange_fred', 'custody_xchange_charissa', 'outlook', 'ideas'],
  });

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

  const filteredEvents = events.filter(event => {
    return true;
  });

  const handleDateClick = (date: Date, person: string) => {
    console.log(`Clicked ${person} on ${date}`);
  };

  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekEnd = addWeeks(weekStart, 1);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between
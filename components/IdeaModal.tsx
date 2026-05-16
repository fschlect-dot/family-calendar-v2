'use client';

import { useEffect, useRef, useState } from 'react';
import type { Idea } from '@/lib/types';

interface Props {
  initialDate?: string;
  idea?:        Idea;
  onSave:       (title: string, date: string, note: string) => Promise<void>;
  onDelete?:    () => Promise<void>;
  onClose:      () => void;
}

export default function IdeaModal({ initialDate, idea, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(idea?.title ?? '');
  const [date,  setDate]  = useState(idea?.date  ?? initialDate ?? '');
  const [note,  setNote]  = useState(idea?.note  ?? '');
  const [busy,  setBusy]  = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setBusy(true);
    try { await onSave(title.trim(), date, note.trim()); onClose(); }
    finally { setBusy(false); }
  }

  async function handleDelete() {
    if (!onDelete || !confirm('Delete this idea?')) return;
    setBusy(true);
    try { await onDelete(); onClose(); }
    finally { setBusy(false); }
  }

  const inputCls = `w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800
    text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600
    rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">{idea ? 'Edit Idea' : 'Add Idea'}</h2>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 rounded p-1 transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Title</label>
            <input ref={titleRef} type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              required placeholder="What are you thinking?" className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              required className={inputCls} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">
              Note <span className="font-normal text-gray-400 dark:text-gray-600">(optional)</span>
            </label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Any details…" rows={3} className={`${inputCls} resize-y`} />
          </div>

          <div className="flex items-center gap-2 pt-1">
            {onDelete && (
              <button type="button" onClick={handleDelete} disabled={busy}
                className="mr-auto text-sm text-red-500 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50">
                Delete
              </button>
            )}
            <button type="button" onClick={onClose} disabled={busy}
              className="text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="text-sm font-medium text-white bg-blue-600 rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

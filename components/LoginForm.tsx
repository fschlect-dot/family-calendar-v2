'use client';

import { useState } from 'react';

const ALLOWED = new Set(['fred@schlecton.com', 'charissa@schlecton.com']);

interface Props {
  onLogin: (email: string) => void;
}

export default function LoginForm({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (ALLOWED.has(normalized)) {
      onLogin(normalized);
    } else {
      setError('Email not recognized. Use fred@schlecton.com or charissa@schlecton.com.');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
          Schlecton Calendar
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
          Family-only access
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="you@schlecton.com"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
          <button
            type="submit"
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}

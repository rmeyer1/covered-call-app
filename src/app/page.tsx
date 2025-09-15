"use client";

import Link from 'next/link';
import { ArrowUpRight, LineChart, Shield } from 'lucide-react';

export default function Home() {
  const cards = [
    {
      title: 'Long Call',
      subtitle: 'Bullish',
      href: '/long-calls',
      color: 'from-green-500 to-emerald-600',
    },
    {
      title: 'Covered Call',
      subtitle: 'Bullish',
      href: '/covered-calls',
      color: 'from-green-500 to-lime-600',
    },
    {
      title: 'Long Put',
      subtitle: 'Bearish',
      href: '/long-puts',
      color: 'from-red-400 to-orange-500',
      disabled: false,
    },
    {
      title: 'Cash-Secured Put',
      subtitle: 'Bullish',
      href: '/cash-secured-puts',
      color: 'from-green-400 to-teal-500',
      disabled: false,
    },
  ];

  return (
    <main className="p-6 sm:p-10 bg-gray-100 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">Options Strategy Builder</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Explore strategies. Pick a dashboard to get started.
          </p>
        </div>

        <h2 className="text-lg sm:text-xl font-semibold mb-3">Single Leg</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          The fundamental options strategies. Buy or sell calls and puts.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map((c) => (
            <Link
              key={c.title}
              href={c.disabled ? '#' : c.href}
              aria-disabled={c.disabled}
              className={`group relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow transition ${
                c.disabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-lg'
              }`}
            >
              <div className={`absolute inset-0 opacity-20 bg-gradient-to-br ${c.color}`} />
              <div className="relative flex items-center gap-3">
                <div className="w-12 h-12 rounded-md bg-gradient-to-br from-white/10 to-black/10 flex items-center justify-center">
                  {c.title.includes('Covered') ? <Shield /> : <LineChart />}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{c.title}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">{c.subtitle}</div>
                </div>
                {!c.disabled && <ArrowUpRight className="opacity-60 group-hover:opacity-100" />}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

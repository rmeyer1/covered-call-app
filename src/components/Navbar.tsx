"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sun, Moon, ChevronDown } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const [dark, setDark] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored) {
      setDark(stored === 'dark');
      const isDark = stored === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      document.body?.classList?.toggle('dark', isDark);
      return;
    }
    const prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = prefers;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
    document.body?.classList?.toggle('dark', isDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    document.body?.classList?.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const linkCls = (href: string) =>
    `px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium ${
      pathname === href
        ? 'bg-white/10 text-white'
        : 'text-white/90 hover:text-white hover:bg-white/10'
    }`;

  const links = [
    { href: '/', label: 'Home' },
    { href: '/portfolio', label: 'Portfolio' },
    { href: '/covered-calls', label: 'Covered Calls' },
    { href: '/long-calls', label: 'Long Calls' },
    { href: '/long-puts', label: 'Long Puts' },
    { href: '/cash-secured-puts', label: 'Cash-Secured Puts' },
  ];
  const currentLabel = links.find((l) => l.href === pathname)?.label || 'Menu';

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMobileOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <nav className="bg-blue-600 dark:bg-gray-800 text-white">
      <div className="max-w-6xl mx-auto px-2 sm:px-4">
        <div className="flex items-center justify-between min-h-12 py-1">
          <div className="flex items-center gap-2 sm:gap-6 w-full">
            <Link href="/" className="font-semibold hidden sm:block">Options Strategy Builder</Link>
            {/* Desktop links */}
            <div className="hidden sm:flex flex-wrap items-center gap-1">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className={linkCls(l.href)}>
                  {l.label}
                </Link>
              ))}
            </div>
            {/* Mobile breadcrumb menu */}
            <div ref={menuRef} className="relative sm:hidden">
              <button
                aria-haspopup="menu"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen((o) => !o)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium bg-white/10 text-white hover:bg-white/20"
              >
                <span className="truncate max-w-[12rem]">{currentLabel}</span>
                <ChevronDown size={14} className={`transition ${mobileOpen ? 'rotate-180' : ''}`} />
              </button>
              {mobileOpen && (
                <div
                  role="menu"
                  className="absolute left-0 mt-2 w-52 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-md shadow-lg ring-1 ring-black/10 z-50 overflow-hidden"
                >
                  {links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`block px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${pathname === l.href ? 'bg-gray-100 dark:bg-gray-700 font-semibold' : ''}`}
                      onClick={() => setMobileOpen(false)}
                      role="menuitem"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button onClick={toggleTheme} className="ml-2 p-2 rounded-full hover:bg-white/10 transition shrink-0">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </nav>
  );
}

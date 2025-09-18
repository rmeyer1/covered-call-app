import type { HeadlineView } from '@/lib/stocks/derive';

interface HeadlinesTabProps {
  headlines: HeadlineView[];
  source?: string;
}

export function deriveHeadlines(headlines: HeadlineView[]): HeadlineView[] {
  return headlines;
}

export default function HeadlinesTab({ headlines, source }: HeadlinesTabProps) {
  if (!headlines.length) {
    return <div className="p-6 text-sm text-gray-500">No recent headlines.</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <p className="text-xs text-gray-500 dark:text-gray-400">Source: {source ?? 'alpaca.news'}</p>
      <ul className="space-y-4">
        {headlines.map((headline) => (
          <li key={headline.id} className="rounded border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {headline.source} · {new Date(headline.publishedAt).toLocaleString()}
              {headline.sentiment ? ` · ${headline.sentiment}` : ''}
            </p>
            <a
              href={headline.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-sm font-semibold text-blue-600 hover:underline"
            >
              {headline.title}
            </a>
            {headline.summary && (
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{headline.summary}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}


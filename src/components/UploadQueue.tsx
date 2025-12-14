import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import type React from 'react';

export type UploadStatus = 'queued' | 'reading' | 'uploading' | 'analyzing' | 'merging' | 'done' | 'error';

export interface UploadQueueItem {
  id: string;
  name: string;
  status: UploadStatus;
  error?: string | null;
}

interface Props {
  items: UploadQueueItem[];
}

const statusLabel: Record<UploadStatus, string> = {
  queued: 'Queued',
  reading: 'Reading',
  uploading: 'Uploading',
  analyzing: 'Analyzing',
  merging: 'Merging',
  done: 'Done',
  error: 'Error',
};

function StatusIcon({ status }: { status: UploadStatus }) {
  if (status === 'done') return <CheckCircle2 className="text-green-600" size={16} />;
  if (status === 'error') return <AlertCircle className="text-red-500" size={16} />;
  if (status === 'queued') return <Clock className="text-gray-400" size={16} />;
  return <Loader2 className="text-blue-500 animate-spin" size={16} />;
}

export default function UploadQueue({ items }: Props) {
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between px-3 py-2 text-xs sm:text-sm">
          <div className="flex items-center gap-2 truncate">
            <StatusIcon status={item.status} />
            <span className="truncate" title={item.name}>
              {item.name}
            </span>
          </div>
          <div className="text-right">
            <span
              className={
                item.status === 'error'
                  ? 'text-red-500'
                  : item.status === 'done'
                    ? 'text-green-600'
                    : 'text-gray-600 dark:text-gray-400'
              }
            >
              {item.error ? item.error : statusLabel[item.status]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

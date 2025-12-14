/* Simple isomorphic logger with env-based toggle
 * - Server: enable via LOGGING_ENABLED=true|1|yes|on, default true in development
 * - Client: enable via NEXT_PUBLIC_LOGGING_ENABLED=true|1|yes|on, default true in development
 */

const isBrowser = typeof window !== 'undefined';

type EnvSource = { env?: Record<string, string | undefined> };

function parseBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function isEnabled(): boolean {
  if (isBrowser) {
    const env = (process as EnvSource | undefined)?.env?.NEXT_PUBLIC_LOGGING_ENABLED;
    const parsed = parseBool(env);
    if (parsed !== undefined) return parsed;
    return process.env.NODE_ENV !== 'production';
  }
  const env = process.env.LOGGING_ENABLED;
  const parsed = parseBool(env);
  if (parsed !== undefined) return parsed;
  return process.env.NODE_ENV !== 'production';
}

function safeData(data: unknown) {
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
}

export function maskSecret(v: string): string {
  if (!v) return '';
  if (v.length <= 6) return '***';
  return `${v.slice(0, 3)}...${v.slice(-3)}`;
}

export function logDebug(context: string, data?: unknown) {
  if (!isEnabled()) return;
  
  console.debug(`[${context}]`, data !== undefined ? safeData(data) : '');
}

export function logInfo(context: string, data?: unknown) {
  if (!isEnabled()) return;
  
  console.log(`[${context}]`, data !== undefined ? safeData(data) : '');
}

export function logWarn(context: string, data?: unknown) {
  if (!isEnabled()) return;
  
  console.warn(`[${context}]`, data !== undefined ? safeData(data) : '');
}

export function logError(context: string, data?: unknown) {
  if (!isEnabled()) return;
  
  console.error(`[${context}]`, data !== undefined ? safeData(data) : '');
}

interface AxiosishError {
  isAxiosError?: boolean;
  message?: string;
  config?: { url?: string; method?: string; params?: unknown };
  response?: { status?: number; statusText?: string; data?: unknown };
}

export function logAxiosError(err: unknown, context: string) {
  if (!isEnabled()) return;
  const isAxios = (e: unknown): e is AxiosishError => {
    if (!e || typeof e !== 'object') return false;
    const maybe = e as AxiosishError;
    return Boolean(maybe.isAxiosError || maybe.config || maybe.response);
  };
  if (isAxios(err)) {
    const e = err;
    logError(context, {
      message: e.message,
      url: e.config?.url,
      method: e.config?.method,
      params: e.config?.params,
      status: e.response?.status,
      statusText: e.response?.statusText,
      data: e.response?.data,
    });
  } else {
    logError(context, err);
  }
}

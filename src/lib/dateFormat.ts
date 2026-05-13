import { useEffect, useState } from 'react';
import { fetchSystemParameters } from '../data/systemParametersApi';

export const DEFAULT_SYSTEM_DATE_FORMAT = 'd/m/Y';

let cachedDateFormat: string | null = null;
let loadingDateFormat: Promise<string> | null = null;

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function normalizeDateFormat(value?: string | null): string {
  const format = String(value ?? '').trim();
  return format || DEFAULT_SYSTEM_DATE_FORMAT;
}

async function loadSystemDateFormat(): Promise<string> {
  if (cachedDateFormat) return cachedDateFormat;
  if (!loadingDateFormat) {
    loadingDateFormat = fetchSystemParameters()
      .then((payload) => normalizeDateFormat(payload.parameters.DefaultDateFormat))
      .catch(() => DEFAULT_SYSTEM_DATE_FORMAT)
      .then((format) => {
        cachedDateFormat = format;
        loadingDateFormat = null;
        return format;
      });
  }
  return loadingDateFormat;
}

export function useSystemDateFormat(): string {
  const [dateFormat, setDateFormat] = useState(cachedDateFormat ?? DEFAULT_SYSTEM_DATE_FORMAT);

  useEffect(() => {
    let mounted = true;
    void loadSystemDateFormat().then((format) => {
      if (mounted) setDateFormat(format);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return dateFormat;
}

export function formatDateWithSystemFormat(value: string | null | undefined, dateFormat = DEFAULT_SYSTEM_DATE_FORMAT): string {
  if (!value) return '';
  const date = parseIsoDate(value);
  if (!date) return String(value);

  const tokens: Record<string, string> = {
    Y: String(date.getFullYear()),
    y: String(date.getFullYear()).slice(-2),
    m: pad(date.getMonth() + 1),
    n: String(date.getMonth() + 1),
    d: pad(date.getDate()),
    j: String(date.getDate()),
  };

  return normalizeDateFormat(dateFormat).replace(/[Yymndj]/g, (token) => tokens[token] ?? token);
}

export function formatDateRangeWithSystemFormat(from: string, to: string, dateFormat = DEFAULT_SYSTEM_DATE_FORMAT): string {
  const formattedFrom = formatDateWithSystemFormat(from, dateFormat);
  const formattedTo = formatDateWithSystemFormat(to, dateFormat);
  if (!formattedFrom || !formattedTo) return 'Select dates';
  return `${formattedFrom} - ${formattedTo}`;
}

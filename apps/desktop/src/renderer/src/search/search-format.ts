import type {
  SearchCampaignStatusDto,
  SearchJobStatusDto,
} from '../../../shared/search-vocabulary';
import type { StatusTone } from '../lib/status-labels';

const CAMPAIGN_TONE: Record<SearchCampaignStatusDto, StatusTone> = {
  DRAFT: 'neutral',
  PLANNED: 'good',
  RUNNING: 'busy',
  PAUSED: 'busy',
  COMPLETED: 'good',
  FAILED: 'bad',
  CANCELLED: 'neutral',
};

const JOB_TONE: Record<SearchJobStatusDto, StatusTone> = {
  PENDING: 'neutral',
  RUNNING: 'busy',
  PAUSED: 'busy',
  COMPLETED: 'good',
  FAILED: 'bad',
  SKIPPED: 'neutral',
};

export function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export const campaignTone = (status: SearchCampaignStatusDto): StatusTone => CAMPAIGN_TONE[status];
export const jobTone = (status: SearchJobStatusDto): StatusTone => JOB_TONE[status];

const numberFormat = new Intl.NumberFormat('en-US');

export function formatCount(value: number): string {
  return numberFormat.format(value);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

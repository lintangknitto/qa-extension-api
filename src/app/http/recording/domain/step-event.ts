/**
 * Ringkasan satu baris untuk langkah rekaman yang penting dibaca manusia/AI tetapi tidak terlihat dari
 * klik/isian biasa: scroll, jenis navigasi, tombol/shortcut keyboard, pembukaan tab, dan checkpoint ber-target.
 * Dipakai timeline halaman share dan konteks AI agar keduanya memakai format yang sama.
 */

import { isSafeLocator } from './locator-safety';

export type StepEventKind = 'scroll' | 'navigation' | 'keyboard' | 'tab';

export interface StepEventSummary {
	kind: StepEventKind;
	label: string;
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0);

const NAVIGATION_LABELS: Record<string, string> = {
	reload: 'muat ulang',
	typed: 'ketik URL',
	link: 'link/form',
	same_document: 'SPA',
	other: 'lainnya'
};

/** Locator terbaik event aksi (tanpa prefix `page.`), dengan rantai iframe bila ada. */
export const primaryLocator = (payload: Record<string, unknown>): string => {
	// Locator dari klien: hanya yang lolos allowlist (sama dengan codegen), karena konteks AI bisa menyalinnya ke script.
	const candidates = [payload.unique_locator, ...(Array.isArray(payload.locators) ? payload.locators : [])];
	const locator = asString(candidates.find((l) => typeof l === 'string' && isSafeLocator(l))).replace(/^page\./, '');
	const frames = Array.isArray(payload.frame_locators) ? payload.frame_locators.filter((f): f is string => typeof f === 'string' && f.length > 0) : [];
	if (!locator || !frames.every(isSafeLocator)) return '';
	return [...frames.map((frame) => `${frame.replace(/^page\./, '')}.contentFrame()`), locator].join('.');
};

const navigationLabel = (payload: Record<string, unknown>, url: string): string => {
	const type = asString(payload.navigation_type);
	if (type === 'back_forward') return `Navigasi (${payload.direction === 'forward' ? 'maju' : 'kembali'}) ke ${url}`;
	const label = NAVIGATION_LABELS[type];
	return label ? `Navigasi (${label}) ke ${url}` : `Navigasi ke ${url}`;
};

const scrollLabel = (payload: Record<string, unknown>): string => {
	const locator = primaryLocator(payload);
	const target = locator ? `container ${locator}` : 'halaman';
	return `Scroll ${target} ke (${asNumber(payload.scroll_x)}, ${asNumber(payload.scroll_y)}), Δ (${asNumber(payload.delta_x)}, ${asNumber(payload.delta_y)})`;
};

const keyboardLabel = (payload: Record<string, unknown>): string => {
	const modifiers = Array.isArray(payload.modifiers) ? payload.modifiers.filter((m): m is string => typeof m === 'string') : [];
	const combo = [...modifiers, asString(payload.key) || 'Enter'].join('+');
	const locator = primaryLocator(payload);
	return `Tombol ${combo}${locator ? ` pada ${locator}` : ''}`;
};

/**
 * Ringkasan event aksi/tab yang termasuk langkah penting; null untuk event lain (klik, isian, dll.).
 * `eventType` = kolom `event_type` (`action`/`tab`), `url` = kolom `url` event.
 */
const tabSummary = (payload: Record<string, unknown>, url?: string | null): StepEventSummary | null => {
	if (payload.kind !== 'opened') return null;
	const target = asString(payload.url) || url || '';
	const fromAction = payload.opener_tab_id !== null && payload.opener_tab_id !== undefined;
	return { kind: 'tab', label: `Tab baru dibuka${fromAction ? ' dari aksi' : ''}${target ? `: ${target}` : ''}` };
};

export const summarizeStepEvent = (eventType: string, payload: Record<string, unknown>, url?: string | null): StepEventSummary | null => {
	if (eventType === 'tab') return tabSummary(payload, url);
	const action = (asString(payload.action) || (eventType === 'navigation' ? 'navigation' : '')).toLowerCase();
	if (action === 'scroll') return { kind: 'scroll', label: scrollLabel(payload) };
	if (action === 'navigation' || action === 'navigate') return { kind: 'navigation', label: navigationLabel(payload, asString(payload.url) || url || '-') };
	if (action === 'keydown') return { kind: 'keyboard', label: keyboardLabel(payload) };
	return null;
};

export interface CheckpointTargetLike {
	target_locators?: unknown;
	target_text?: string | null;
	page_url?: string | null;
}

const locatorsOf = (value: unknown): string[] => {
	let parsed = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value);
		} catch {
			return [];
		}
	}
	return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
};

/** Target checkpoint dalam satu baris: elemen (+ teks yang diverifikasi) dan URL halaman; null bila tanpa target. */
export const describeCheckpointTarget = (checkpoint: CheckpointTargetLike): string | null => {
	const parts: string[] = [];
	const locator = locatorsOf(checkpoint.target_locators)[0];
	const text = (checkpoint.target_text ?? '').replace(/\s+/g, ' ').trim();
	if (locator) parts.push(text ? `elemen ${locator.replace(/^page\./, '')} berisi "${text}"` : `elemen ${locator.replace(/^page\./, '')} terlihat`);
	if (checkpoint.page_url) parts.push(`URL ${checkpoint.page_url}`);
	return parts.length > 0 ? parts.join('; ') : null;
};

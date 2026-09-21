import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';

/**
 * Kontrak event recording yang dipakai bersama oleh extension dan backend.
 * Naikkan RECORDING_EVENT_VERSION saat ada perubahan bentuk payload yang breaking.
 */
export const RECORDING_EVENT_VERSION = 1;

export const RECORDING_EVENT_TYPES = [
	'action',
	'tab',
	'console',
	'exception',
	'network',
	'artifact',
	'checkpoint'
] as const;
export type TRecordingEventType = (typeof RECORDING_EVENT_TYPES)[number];

export interface IRecordingEventInput {
	event_version?: number;
	type: string;
	sequence: number;
	occurred_at?: string;
	tab_id?: number | null;
	url?: string | null;
	payload?: Record<string, unknown> | null;
}

export interface INormalizedRecordingEvent {
	eventVersion: number;
	type: TRecordingEventType;
	sequence: number;
	occurredAt: string;
	tabId: number | null;
	url: string | null;
	payload: Record<string, unknown>;
}

export const isSupportedEventVersion = (version: number): boolean =>
	version === RECORDING_EVENT_VERSION;

export const isSupportedEventType = (type: string): type is TRecordingEventType =>
	(RECORDING_EVENT_TYPES as readonly string[]).includes(type);

export const toIsoString = (value: string | undefined, fallbackIso: string): string => {
	if (!value) return fallbackIso;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) throw new InvalidParameterException('occurred_at bukan tanggal yang valid.');
	return parsed.toISOString();
};

export const normalizeIncomingEvent = (
	raw: IRecordingEventInput,
	fallbackOccurredAt: string
): INormalizedRecordingEvent => {
	if (!raw || typeof raw !== 'object') throw new InvalidParameterException('Event recording tidak valid.');

	const version = raw.event_version ?? RECORDING_EVENT_VERSION;
	if (!isSupportedEventVersion(version))
		throw new InvalidParameterException(
			`Versi event recording tidak didukung: ${version}. Versi yang didukung: ${RECORDING_EVENT_VERSION}.`
		);

	if (!isSupportedEventType(raw.type))
		throw new InvalidParameterException(`Tipe event recording tidak dikenal: ${String(raw.type)}.`);

	if (!Number.isInteger(raw.sequence) || raw.sequence < 1)
		throw new InvalidParameterException('Sequence event recording harus bilangan bulat >= 1.');

	return {
		eventVersion: version,
		type: raw.type,
		sequence: raw.sequence,
		occurredAt: toIsoString(raw.occurred_at, fallbackOccurredAt),
		tabId: raw.tab_id ?? null,
		url: raw.url ?? null,
		payload: raw.payload ?? {}
	};
};

export const normalizeIncomingBatch = (
	raw: unknown,
	fallbackOccurredAt: string
): INormalizedRecordingEvent[] => {
	if (!Array.isArray(raw)) throw new InvalidParameterException('Batch event recording harus berupa array.');
	return raw.map((item) => normalizeIncomingEvent(item as IRecordingEventInput, fallbackOccurredAt));
};

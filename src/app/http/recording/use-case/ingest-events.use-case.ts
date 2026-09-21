import { PROJECT_ADMIN_LEVELS, recordingConfig } from '@/libs/config';
import { normalizeIncomingBatch, type INormalizedRecordingEvent } from '../domain/recording-event.contract';
import { normalizeNetworkPayloadBodies } from '../domain/network-body';
import {
	redactEventPayload,
	redactNetworkPayloadBodies,
	redactSensitiveInputValues,
	redactUrl
} from '../domain/redaction';
import { computeResumeCursor, dedupeAndOrderBatch } from '../domain/ingestion';
import * as eventQueries from '../queries/recording-event.queries';
import * as eventRepo from '../repo/recording-event.repo';
import * as sessionQueries from '../../session/queries/session.queries';
import * as sessionDomain from '../../session/domain/session.domain';
import { updateLastSequence } from '../../session/repo/session.repo';

export const ingestEventsUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
	rawEvents: unknown;
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);
	sessionDomain.assertSessionIsRecording(session);

	const normalized = normalizeIncomingBatch(ctx.rawEvents, new Date().toISOString());

	// Redaksi + aturan body network dijalankan sebelum persist — bukan hanya
	// sebelum dikirim ke AI.
	const redacted: INormalizedRecordingEvent[] = normalized.map((event) => {
		const redactedPayload = redactSensitiveInputValues(redactEventPayload(event.payload));
		return {
			...event,
			url: event.url ? redactUrl(event.url) : null,
			payload:
				event.type === 'network'
					? normalizeNetworkPayloadBodies(redactNetworkPayloadBodies(redactedPayload), {
						maxBytes: recordingConfig.NETWORK_BODY_MAX_BYTES
					})
					: redactedPayload
		};
	});

	const existingMaxSequence = await eventQueries.findMaxSequence(ctx.idSession);
	const { accepted, duplicateSequences, highestAcceptedSequence } = dedupeAndOrderBatch(
		existingMaxSequence,
		redacted
	);

	const inserted = await eventRepo.insertEventsBatch(ctx.idSession, accepted);
	const lastSequence = Math.max(existingMaxSequence, highestAcceptedSequence);

	if (highestAcceptedSequence > existingMaxSequence) await updateLastSequence(ctx.idSession, highestAcceptedSequence);

	return {
		accepted: accepted.length,
		inserted,
		duplicates: duplicateSequences.length,
		last_sequence: lastSequence,
		resume: computeResumeCursor(lastSequence)
	};
};

export const getSessionResumeUseCase = async (ctx: {
	idSession: number;
	userId: number;
	userLevel: string | undefined;
}) => {
	const session = sessionDomain.assertSessionExists(await sessionQueries.findSessionById(ctx.idSession));
	sessionDomain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);

	return {
		session: sessionDomain.toSessionResponse(session),
		resume: computeResumeCursor(Number(session.last_sequence ?? 0))
	};
};

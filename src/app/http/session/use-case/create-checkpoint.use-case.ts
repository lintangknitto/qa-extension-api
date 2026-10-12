import { PROJECT_ADMIN_LEVELS } from '@/libs/config';
import type { TCreateCheckpointValidation } from '../session.request';
import * as artifactDomain from '../../recording/domain/artifact';
import * as artifactQueries from '../../recording/queries/artifact.queries';
import { isHttpUrl, isSafeLocator } from '../../recording/domain/locator-safety';
import { redactStringValue, redactUrl } from '../../recording/domain/redaction';
import * as domain from '../domain/session.domain';
import * as queries from '../queries/session.queries';
import * as repo from '../repo/session.repo';

export const createCheckpointUseCase = async (ctx: {
	userId: number;
	userLevel: string | undefined;
	idSession: number;
	input: TCreateCheckpointValidation;
}) => {
	const session = domain.assertSessionExists(await queries.findSessionById(ctx.idSession));
	domain.assertCanAccessSession(session, ctx.userId, ctx.userLevel, PROJECT_ADMIN_LEVELS);
	domain.assertSessionIsRecording(session);

	if (ctx.input.id_artifact !== undefined && ctx.input.id_artifact !== null) {
		const artifact = artifactDomain.assertArtifactExists(
			await artifactQueries.findArtifactById(ctx.input.id_artifact)
		);
		artifactDomain.assertArtifactBelongsToSession(artifact, ctx.idSession);
	}

	// Teks & locator target diambil dari DOM halaman: bisa berisi email/token, diredaksi seperti event rekaman.
	const rawText = ctx.input.target_text?.replace(/\s+/g, ' ').trim();
	const targetText = rawText ? redactStringValue(rawText) : rawText;
	// Locator & URL ikut ditulis ke script hasil generate: yang bukan rantai locator / URL http(s) dibuang, bukan ditolak,
	// agar checkpoint dari halaman non-http atau locator yang tak terduga tetap tersimpan.
	const targetLocators = ctx.input.target_locators?.filter(isSafeLocator).map(redactStringValue) ?? null;
	const pageUrl = ctx.input.page_url && isHttpUrl(ctx.input.page_url) ? redactUrl(ctx.input.page_url) : null;
	const idCheckpoint = await repo.insertCheckpoint({
		idSession: ctx.idSession,
		note: ctx.input.note,
		sequence: ctx.input.sequence ?? null,
		idArtifact: ctx.input.id_artifact ?? null,
		targetLocators,
		targetText: targetText ? targetText.slice(0, domain.CHECKPOINT_TARGET_TEXT_MAX_LENGTH) : null,
		// URL disimpan tanpa token/secret query, sama dengan URL event rekaman.
		pageUrl,
		tabId: ctx.input.tab_id ?? null,
		createdByUserId: ctx.userId
	});

	const created = await repo.findCheckpointById(idCheckpoint);
	if (!created) throw new Error('Checkpoint gagal disimpan.');
	return domain.toCheckpointResponse(created);
};

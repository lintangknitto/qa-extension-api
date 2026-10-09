jest.mock('@/app/http/session/queries/session.queries', () => ({
	findSessionById: jest.fn(),
	listCheckpointsBySession: jest.fn()
}));

jest.mock('@/app/http/recording/queries/recording-event.queries', () => ({
	listEventsBySession: jest.fn(),
	listActionEventsBySession: jest.fn(),
	listFailureSignalEventsBySession: jest.fn().mockResolvedValue([])
}));

jest.mock('@/app/http/recording/queries/artifact.queries', () => ({
	listArtifactsBySession: jest.fn().mockResolvedValue([])
}));

jest.mock('@/app/http/recording/queries/generation.queries', () => ({
	listGenerations: jest.fn()
}));

jest.mock('@/app/http/recording/repo/generation.repo', () => ({
	startGeneration: jest.fn(),
	markGenerationCompleted: jest.fn(),
	markGenerationFailed: jest.fn()
}));

jest.mock('@/app/http/recording/use-case/investigate-session.use-case', () => ({
	startInvestigationInBackground: jest.fn().mockReturnValue('started')
}));

import * as investigation from '@/app/http/recording/use-case/investigate-session.use-case';
import * as sessionQueries from '@/app/http/session/queries/session.queries';
import * as eventQueries from '@/app/http/recording/queries/recording-event.queries';
import * as generationQueries from '@/app/http/recording/queries/generation.queries';
import * as generationRepo from '@/app/http/recording/repo/generation.repo';
import { generateSessionOutputsUseCase } from '../../use-case/generate-session-outputs.use-case';

const OWNER = 7;

const session = {
	id_session: 1,
	owner_user_id: OWNER,
	status: 'completed',
	test_case_no: 'TC-1',
	title: 'Login',
	last_sequence: 3
};

beforeEach(() => {
	jest.clearAllMocks();
	(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(session);
	(sessionQueries.listCheckpointsBySession as jest.Mock).mockResolvedValue([]);
	(eventQueries.listEventsBySession as jest.Mock).mockResolvedValue([]);
	(eventQueries.listActionEventsBySession as jest.Mock).mockResolvedValue([]);
	(generationQueries.listGenerations as jest.Mock).mockResolvedValue([]);
	(generationRepo.startGeneration as jest.Mock).mockResolvedValue(11);
	(generationRepo.markGenerationCompleted as jest.Mock).mockResolvedValue(undefined);
	(generationRepo.markGenerationFailed as jest.Mock).mockResolvedValue(undefined);
});

describe('generateSessionOutputsUseCase', () => {
	it('kind playwright dibuat deterministik dari event aksi tanpa memanggil AI', async () => {
		const completer = { complete: jest.fn() };
		(eventQueries.listActionEventsBySession as jest.Mock).mockResolvedValue([
			{ event_type: 'action', sequence: 1, url: 'https://a.test/', payload: { action: 'navigation', url: 'https://a.test/' } },
			{ event_type: 'action', sequence: 2, payload: { action: 'click', unique_locator: "getByRole('button', { name: 'Kirim', exact: true })" } }
		]);

		const result = await generateSessionOutputsUseCase({
			idSession: 1,
			userId: OWNER,
			userLevel: 'IMPLEMENTOR',
			kinds: ['playwright'],
			completer
		});

		expect(completer.complete).not.toHaveBeenCalled();
		expect(result.results.playwright.status).toBe('completed');
		expect(result.results.playwright.output).toContain("await page.getByRole('button', { name: 'Kirim', exact: true }).click();");
		expect(generationRepo.startGeneration).toHaveBeenCalledWith(
			expect.objectContaining({ kind: 'playwright', model: 'deterministic-codegen', promptVersion: 'codegen-v1' })
		);
	});

	it('kind markdown menerima langkah dari event aksi (payload JSONB object)', async () => {
		const completer = { complete: jest.fn().mockResolvedValue('# Laporan') };
		(eventQueries.listActionEventsBySession as jest.Mock).mockResolvedValue([
			{ event_type: 'action', sequence: 2, payload: { action: 'click', locators: ["getByRole('button', { name: 'Kirim' })"] } }
		]);
		(eventQueries.listEventsBySession as jest.Mock).mockResolvedValue([
			{ event_type: 'action', sequence: 2, payload: { action: 'click' } },
			{ event_type: 'network', sequence: 3, url: 'https://api.test/x', payload: { method: 'POST', status: 500 } }
		]);

		await generateSessionOutputsUseCase({ idSession: 1, userId: OWNER, userLevel: 'IMPLEMENTOR', kinds: ['markdown'], completer });

		const user = completer.complete.mock.calls[0][0].user as string;
		expect(user).toContain("Primary Locator: page.getByRole('button', { name: 'Kirim' })");
		expect(user).toContain('#3 POST 500 https://api.test/x');
		// Event aksi tidak terduplikasi dari query umum.
		expect(user.match(/\[CLICK\]/g)).toHaveLength(1);
	});

	it('kind playwright_ai menerapkan patch valid dan menolak patch yang mengubah aksi', async () => {
		(eventQueries.listActionEventsBySession as jest.Mock).mockResolvedValue([
			{ event_type: 'action', sequence: 1, url: 'https://a.test/', payload: { action: 'navigation', url: 'https://a.test/' } },
			{ event_type: 'action', sequence: 2, payload: { action: 'input', unique_locator: "getByLabel('Kode', { exact: true })", value: 'K-1' } },
			{ event_type: 'action', sequence: 3, payload: { action: 'click', unique_locator: "getByRole('button', { name: 'Kirim', exact: true })" } }
		]);
		const completer = {
			complete: jest.fn().mockResolvedValue('{"patches":[{"step":2,"value":"K-2","comment":"kode unik"},{"step":3,"action":"dblclick"}]}')
		};

		const result = await generateSessionOutputsUseCase({ idSession: 1, userId: OWNER, userLevel: 'IMPLEMENTOR', kinds: ['playwright_ai'], completer });

		expect(result.results.playwright_ai.status).toBe('completed');
		const output = result.results.playwright_ai.output ?? '';
		expect(output).toContain('// Patch AI: 1 diterapkan, 1 ditolak');
		expect(output).toContain("await page.getByLabel('Kode', { exact: true }).fill('K-2');");
		expect(output).toContain("await page.getByRole('button', { name: 'Kirim', exact: true }).click();");
		expect(completer.complete.mock.calls[0][0].user).toContain('[nilai bisa diubah]');
	});

	it('tidak melempar dan menandai failed saat provider error (session tetap selesai)', async () => {
		const completer = { complete: jest.fn().mockRejectedValue(new Error('provider timeout')) };

		const result = await generateSessionOutputsUseCase({
			idSession: 1,
			userId: OWNER,
			userLevel: 'IMPLEMENTOR',
			kinds: ['markdown'],
			completer
		});

		expect(result.results.markdown.status).toBe('failed');
		expect(result.results.markdown.error).toContain('timeout');
		expect(generationRepo.markGenerationFailed).toHaveBeenCalledWith(11, 'provider timeout');
	});

	it('mencoba kedua kind saat kinds tidak diberikan', async () => {
		const completer = { complete: jest.fn().mockResolvedValue('output') };

		const result = await generateSessionOutputsUseCase({
			idSession: 1,
			userId: OWNER,
			userLevel: 'IMPLEMENTOR',
			completer
		});

		expect(Object.keys(result.results).sort()).toEqual(['markdown', 'playwright']);
		// Hanya markdown yang memakai AI.
		expect(completer.complete).toHaveBeenCalledTimes(1);
	});

	it('menambah investigasi otomatis saat sesi FAIL (kinds tidak diberikan)', async () => {
		(sessionQueries.findSessionById as jest.Mock).mockResolvedValue({ ...session, result: 'FAIL' });
		const completer = { complete: jest.fn().mockResolvedValue('output') };
		const result = await generateSessionOutputsUseCase({ idSession: 1, userId: OWNER, userLevel: 'IMPLEMENTOR', completer });
		expect(Object.keys(result.results).sort()).toEqual(['investigation', 'markdown', 'playwright']);
		expect(investigation.startInvestigationInBackground).toHaveBeenCalledTimes(1);
	});

	it('menambah investigasi otomatis saat PASS tapi ada request 5xx', async () => {
		(eventQueries.listEventsBySession as jest.Mock).mockResolvedValue([
			{ event_type: 'network', sequence: 4, url: 'https://api.test/x', payload: { method: 'POST', status: 502 } }
		]);
		const result = await generateSessionOutputsUseCase({
			idSession: 1, userId: OWNER, userLevel: 'IMPLEMENTOR', completer: { complete: jest.fn().mockResolvedValue('output') }
		});
		expect(result.results.investigation?.status).toBe('started');
	});

	it('PASS dengan 4xx saja tidak memicu investigasi otomatis', async () => {
		(eventQueries.listEventsBySession as jest.Mock).mockResolvedValue([
			{ event_type: 'network', sequence: 4, url: 'https://app.test/favicon.ico', payload: { method: 'GET', status: 404 } }
		]);
		const result = await generateSessionOutputsUseCase({
			idSession: 1, userId: OWNER, userLevel: 'IMPLEMENTOR', completer: { complete: jest.fn().mockResolvedValue('output') }
		});
		expect(result.results.investigation).toBeUndefined();
	});

	it('tidak menambah investigasi bila kinds diminta eksplisit', async () => {
		(sessionQueries.findSessionById as jest.Mock).mockResolvedValue({ ...session, result: 'FAIL' });
		await generateSessionOutputsUseCase({
			idSession: 1, userId: OWNER, userLevel: 'IMPLEMENTOR', kinds: ['playwright'], completer: { complete: jest.fn() }
		});
		expect(investigation.startInvestigationInBackground).not.toHaveBeenCalled();
	});

	it('menolak akses user yang bukan owner', async () => {
		await expect(
			generateSessionOutputsUseCase({
				idSession: 1,
				userId: 99,
				userLevel: 'USER',
				completer: { complete: jest.fn() }
			})
		).rejects.toThrow();
	});
});

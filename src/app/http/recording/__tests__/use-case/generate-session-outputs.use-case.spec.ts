jest.mock('@/app/http/session/queries/session.queries', () => ({
	findSessionById: jest.fn(),
	listCheckpointsBySession: jest.fn()
}));

jest.mock('@/app/http/recording/queries/recording-event.queries', () => ({
	listEventsBySession: jest.fn()
}));

jest.mock('@/app/http/recording/queries/generation.queries', () => ({
	listGenerations: jest.fn()
}));

jest.mock('@/app/http/recording/repo/generation.repo', () => ({
	startGeneration: jest.fn(),
	markGenerationCompleted: jest.fn(),
	markGenerationFailed: jest.fn()
}));

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
	(generationQueries.listGenerations as jest.Mock).mockResolvedValue([]);
	(generationRepo.startGeneration as jest.Mock).mockResolvedValue(11);
	(generationRepo.markGenerationCompleted as jest.Mock).mockResolvedValue(undefined);
	(generationRepo.markGenerationFailed as jest.Mock).mockResolvedValue(undefined);
});

describe('generateSessionOutputsUseCase', () => {
	it('menyimpan output dan menandai completed saat provider sukses', async () => {
		const completer = { complete: jest.fn().mockResolvedValue('```ts\nconst a = 1;\n```') };

		const result = await generateSessionOutputsUseCase({
			idSession: 1,
			userId: OWNER,
			userLevel: 'IMPLEMENTOR',
			kinds: ['playwright'],
			completer
		});

		expect(result.results.playwright.status).toBe('completed');
		expect(result.results.playwright.output).toBe('const a = 1;');
		expect(generationRepo.markGenerationCompleted).toHaveBeenCalledWith(11, 'const a = 1;');
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
		expect(completer.complete).toHaveBeenCalledTimes(2);
	});

	it('menolak akses user yang bukan owner', async () => {
		await expect(
			generateSessionOutputsUseCase({
				idSession: 1,
				userId: 99,
				userLevel: 'IMPLEMENTOR',
				completer: { complete: jest.fn() }
			})
		).rejects.toThrow();
	});
});

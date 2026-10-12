jest.mock('@/app/http/session/queries/session.queries', () => ({
	findSessionById: jest.fn()
}));

jest.mock('@/app/http/session/repo/session.repo', () => ({
	insertCheckpoint: jest.fn(),
	findCheckpointById: jest.fn()
}));

jest.mock('@/app/http/recording/queries/artifact.queries', () => ({
	findArtifactById: jest.fn()
}));

import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import * as sessionQueries from '@/app/http/session/queries/session.queries';
import * as sessionRepo from '@/app/http/session/repo/session.repo';
import * as artifactQueries from '@/app/http/recording/queries/artifact.queries';
import { createCheckpointUseCase } from '../../use-case/create-checkpoint.use-case';

const OWNER = 7;
const session = { id_session: 1, owner_user_id: OWNER, status: 'recording' };
const checkpoint = { id_checkpoint: 9, id_session: 1, note: 'cek', created_by_user_id: OWNER };

beforeEach(() => {
	jest.clearAllMocks();
	(sessionQueries.findSessionById as jest.Mock).mockResolvedValue(session);
	(sessionRepo.insertCheckpoint as jest.Mock).mockResolvedValue(9);
	(sessionRepo.findCheckpointById as jest.Mock).mockResolvedValue(checkpoint);
	(artifactQueries.findArtifactById as jest.Mock).mockResolvedValue({ id_artifact: 5, id_session: 1 });
});

describe('createCheckpointUseCase (G6)', () => {
	it('menerima checkpoint tanpa artifact', async () => {
		const result = await createCheckpointUseCase({
			userId: OWNER,
			userLevel: 'IMPLEMENTOR',
			idSession: 1,
			input: { note: 'cek' }
		});

		expect(result.id_checkpoint).toBe(9);
		expect(artifactQueries.findArtifactById).not.toHaveBeenCalled();
	});

	it('menyimpan target checkpoint: teks dirapikan & dipotong 200, URL tanpa token', async () => {
		await createCheckpointUseCase({
			userId: OWNER,
			userLevel: 'IMPLEMENTOR',
			idSession: 1,
			input: {
				note: 'toast muncul',
				target_locators: ["getByRole('status')"],
				target_text: `  Data   berhasil\n disimpan ${'x'.repeat(300)}`,
				page_url: 'https://app.test/chat/12?token=rahasia123',
				tab_id: 4
			}
		});
		const fields = (sessionRepo.insertCheckpoint as jest.Mock).mock.calls[0][0];
		expect(fields).toMatchObject({ targetLocators: ["getByRole('status')"], tabId: 4 });
		expect(fields.targetText.startsWith('Data berhasil disimpan x')).toBe(true);
		expect(fields.targetText).toHaveLength(200);
		expect(fields.pageUrl).not.toContain('rahasia123');
	});

	it('checkpoint lama tanpa target tetap valid (kolom baru null)', async () => {
		await createCheckpointUseCase({ userId: OWNER, userLevel: 'IMPLEMENTOR', idSession: 1, input: { note: 'cek' } });
		expect((sessionRepo.insertCheckpoint as jest.Mock).mock.calls[0][0]).toMatchObject({ targetLocators: null, targetText: null, pageUrl: null, tabId: null });
	});

	it('menerima artifact yang memang milik session', async () => {
		await expect(
			createCheckpointUseCase({
				userId: OWNER,
				userLevel: 'IMPLEMENTOR',
				idSession: 1,
				input: { note: 'cek', id_artifact: 5 }
			})
		).resolves.toBeTruthy();
		expect(artifactQueries.findArtifactById).toHaveBeenCalledWith(5);
	});

	it('menolak artifact milik session lain', async () => {
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValue({ id_artifact: 5, id_session: 99 });

		await expect(
			createCheckpointUseCase({
				userId: OWNER,
				userLevel: 'IMPLEMENTOR',
				idSession: 1,
				input: { note: 'cek', id_artifact: 5 }
			})
		).rejects.toThrow(NotFoundException);
		expect(sessionRepo.insertCheckpoint).not.toHaveBeenCalled();
	});

	it('menolak artifact yang tidak ditemukan', async () => {
		(artifactQueries.findArtifactById as jest.Mock).mockResolvedValue(null);

		await expect(
			createCheckpointUseCase({
				userId: OWNER,
				userLevel: 'IMPLEMENTOR',
				idSession: 1,
				input: { note: 'cek', id_artifact: 123 }
			})
		).rejects.toThrow(NotFoundException);
	});

	it('meredaksi target_text dan target_locators (email/token tidak tersimpan)', async () => {
		await createCheckpointUseCase({
			userId: OWNER,
			userLevel: 'IMPLEMENTOR',
			idSession: 1,
			input: {
				note: 'cek user',
				target_locators: ["getByText('budi@contoh.test')"],
				target_text: 'Login sebagai budi@contoh.test'
			}
		});
		const fields = (sessionRepo.insertCheckpoint as jest.Mock).mock.calls[0][0];
		expect(fields.targetText).toBe('Login sebagai [REDACTED]');
		expect(fields.targetLocators).toEqual(["getByText('[REDACTED]')"]);
	});

	it('membuang locator bukan rantai locator Playwright dan page_url bukan http(s) (anti injeksi kode)', async () => {
		await createCheckpointUseCase({
			userId: OWNER,
			userLevel: 'IMPLEMENTOR',
			idSession: 1,
			input: {
				note: 'cek',
				target_locators: ["locator('x'); require('child_process').execSync('calc'); //", "getByRole('status')"],
				page_url: "x\nawait page.evaluate(()=>1)\n//"
			}
		});
		const fields = (sessionRepo.insertCheckpoint as jest.Mock).mock.calls[0][0];
		expect(fields.targetLocators).toEqual(["getByRole('status')"]);
		expect(fields.pageUrl).toBeNull();
	});
});

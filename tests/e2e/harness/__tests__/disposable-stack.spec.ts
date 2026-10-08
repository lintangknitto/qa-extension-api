import { DisposableStack } from '../disposable-stack';
import { execSync } from 'child_process';

describe('DisposableStack Lifecycle & Safety Guard', () => {
	// Timeout cukup untuk spin up compose container
	jest.setTimeout(60000);

	it('menolak konfigurasi database knitto_qa persisten', () => {
		expect(() => {
			new DisposableStack({ postgresDb: 'knitto_qa' });
		}).toThrow(/SAFETY GUARD VIOLATION: Dilarang menghubungkan E2E harness ke database persisten knitto_qa/);
	});

	it('menolak knitto_qa tanpa memandang huruf besar/kecil dan nama DB tanpa prefix e2e_', () => {
		expect(() => new DisposableStack({ postgresDb: 'KNITTO_QA' })).toThrow(/knitto_qa/);
		expect(() => new DisposableStack({ postgresDb: 'postgres' })).toThrow(/berawalan "e2e_"/);
	});

	it('menolak projectName yang bukan milik harness (mis. project compose persisten)', () => {
		expect(() => new DisposableStack({ projectName: 'dev-infra' })).toThrow(/projectName/);
		expect(() => new DisposableStack({ projectName: 'knitto-e2e-x"; rm -rf /' })).toThrow(/projectName/);
	});

	it('mengabaikan override E2E_* dari environment shell dan selalu memakai port dinamis', () => {
		const saved = { port: process.env.E2E_POSTGRES_PORT, db: process.env.E2E_POSTGRES_DB };
		process.env.E2E_POSTGRES_PORT = '5432';
		process.env.E2E_POSTGRES_DB = 'knitto_qa';
		try {
			const env = (new DisposableStack() as unknown as { env: NodeJS.ProcessEnv }).env;
			expect(env.E2E_POSTGRES_PORT).toBe('0');
			expect(env.E2E_POSTGRES_DB).toMatch(/^e2e_db_/);
		} finally {
			if (saved.port === undefined) delete process.env.E2E_POSTGRES_PORT;
			else process.env.E2E_POSTGRES_PORT = saved.port;
			if (saved.db === undefined) delete process.env.E2E_POSTGRES_DB;
			else process.env.E2E_POSTGRES_DB = saved.db;
		}
	});

	it('menjalankan down -v saat docker compose up gagal', async () => {
		const stack = new DisposableStack();
		const internals = stack as unknown as { compose: () => string; isStarted: boolean };
		jest.spyOn(internals, 'compose').mockImplementationOnce(() => {
			throw new Error('up --wait gagal (simulasi)');
		});
		const stopSync = jest.spyOn(stack, 'stopSync').mockImplementation(() => {
			internals.isStarted = false;
		});

		await expect(stack.start()).rejects.toThrow('up --wait gagal');
		expect(stopSync).toHaveBeenCalledTimes(1);
		expect(internals.isStarted).toBe(false);
	});

	it('menolak port 5432 pada localhost', () => {
		const stack = new DisposableStack({ postgresDb: 'e2e_safe_test_db' });
		expect(() => {
			stack.assertSafety({ postgresPort: 5432, postgresHost: '127.0.0.1' });
		}).toThrow(/SAFETY GUARD VIOLATION: Dilarang memakai port default PostgreSQL persisten 5432/);
	});

	it('dapat start dan teardown stack disposable tanpa mengganggu persistent container', async () => {
		const stack = new DisposableStack();
		const projectName = stack.getProjectName();

		try {
			const endpoints = await stack.start();
			expect(endpoints.postgres.port).toBeGreaterThan(0);
			expect(endpoints.postgres.port).not.toBe(5432);
			expect(endpoints.minio.port).toBeGreaterThan(0);
			expect(endpoints.minio.port).not.toBe(9000);
			expect(endpoints.mockAi.port).toBeGreaterThan(0);

			// Pastikan project name terisolasi di docker
			const psOutput = execSync(`docker compose -p "${projectName}" -f dev-infra/docker-compose.e2e.yml ps -q`, {
				encoding: 'utf-8'
			}).trim();
			expect(psOutput.split('\n').filter(Boolean).length).toBe(3);
		} finally {
			await stack.stop();
		}

		// Verifikasi seluruh service dan volume telah dibersihkan
		const afterPsOutput = execSync(`docker compose -p "${projectName}" -f dev-infra/docker-compose.e2e.yml ps -q`, {
			encoding: 'utf-8'
		}).trim();
		expect(afterPsOutput).toBe('');
	});

	it('membersihkan stack saat terjadi forced failure di tengah alur', async () => {
		const stack = new DisposableStack();
		const projectName = stack.getProjectName();

		try {
			await stack.start();
			// Simulasi forced failure
			throw new Error('Simulasi error tak terduga pada E2E test step');
		} catch (err) {
			expect((err as Error).message).toContain('Simulasi error');
		} finally {
			await stack.stop();
		}

		// Pastikan teardown tetap dieksekusi walau ada error
		const afterPs = execSync(`docker compose -p "${projectName}" -f dev-infra/docker-compose.e2e.yml ps -q`, {
			encoding: 'utf-8'
		}).trim();
		expect(afterPs).toBe('');
	});
});

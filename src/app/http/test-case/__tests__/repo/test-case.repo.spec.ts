import postgresConnection from '@/libs/config/postgresConnection';
import * as queries from '../../queries/test-case.queries';
import { bulkUpsertTestCases, insertTestCase, updateTestCase } from '../../repo/test-case.repo';

jest.mock('@/libs/config/postgresConnection', () => ({ __esModule: true, default: { raw: jest.fn() } }));
jest.mock('../../queries/test-case.queries');

const raw = postgresConnection.raw as jest.Mock;

const item = (testCaseId: string, extra: Record<string, string> = {}) => ({
	test_case_id: testCaseId,
	title: `Judul ${testCaseId}`,
	scenario: `Scenario ${testCaseId}`,
	test_date: '7 November 2025',
	...extra
});

describe('test-case.repo', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		raw.mockResolvedValue([{ id_test_case: 10 }]);
	});

	it('insert menyimpan scenario dan test_date', async () => {
		await insertTestCase(1, item('TC1-1'), 5);
		const [sql, params] = raw.mock.calls[0];
		expect(sql).toContain('scenario, test_date');
		expect(params).toHaveLength(21);
		expect(params.slice(-2)).toEqual(['Scenario TC1-1', '7 November 2025']);
	});

	it('update hanya menyentuh scenario/test_date bila dikirim', async () => {
		await updateTestCase(3, { scenario: 'Login gagal', test_date: '' });
		const [sql, params] = raw.mock.calls[0];
		expect(sql).toContain('scenario = $1');
		expect(sql).toContain('test_date = $2');
		expect(params).toEqual(['Login gagal', '', 3]);

		raw.mockClear();
		await updateTestCase(3, { title: 'X' });
		expect(raw.mock.calls[0][0]).not.toContain('scenario');
	});

	describe('bulkUpsertTestCases (kunci id_project + test_case_id)', () => {
		it('insert semua bila belum ada', async () => {
			(queries.findTestCaseByCode as jest.Mock).mockResolvedValue(null);
			await expect(bulkUpsertTestCases(1, [item('TC1-1'), item('TC1-2')], 5)).resolves.toEqual({
				total: 2,
				inserted: 2,
				updated: 0
			});
			expect(raw.mock.calls.every(([sql]) => String(sql).includes('INSERT INTO test_cases'))).toBe(true);
		});

		it('re-import meng-update baris yang sudah ada, bukan menduplikasi', async () => {
			(queries.findTestCaseByCode as jest.Mock).mockResolvedValue({ id_test_case: 77, test_case_id: 'TC1-1' });
			await expect(bulkUpsertTestCases(1, [item('TC1-1', { title: 'Judul baru' })])).resolves.toEqual({
				total: 1,
				inserted: 0,
				updated: 1
			});
			const [sql, params] = raw.mock.calls[0];
			expect(sql).toMatch(/^UPDATE test_cases SET/);
			expect(params).toContain('Judul baru');
			expect(params[params.length - 1]).toBe(77);
			expect(queries.findTestCaseByCode).toHaveBeenCalledWith(1, 'TC1-1');
		});

		it('campuran insert dan update; test_case_id di-trim sebelum dicari', async () => {
			(queries.findTestCaseByCode as jest.Mock).mockImplementation(async (_p: number, code: string) =>
				code === 'TC1-1' ? { id_test_case: 77 } : null
			);
			await expect(bulkUpsertTestCases(1, [item(' TC1-1 '), item('TC1-2'), item('TC1-3')])).resolves.toEqual({
				total: 3,
				inserted: 2,
				updated: 1
			});
			expect(queries.findTestCaseByCode).toHaveBeenCalledWith(1, 'TC1-1');
		});
	});
});

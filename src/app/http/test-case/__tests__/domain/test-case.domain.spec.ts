import {
	normalizeTestCaseStatus,
	normalizeTestType,
	assertTestCaseExists,
	toTestCaseResponse
} from '../../domain/test-case.domain';
import { NotFoundException } from '@knittotextile/knitto-core-backend/dist/CoreException';

describe('test-case.domain', () => {
	describe('normalizeTestType', () => {
		it('mengembalikan + untuk positive atau input kosong', () => {
			expect(normalizeTestType('+')).toBe('+');
			expect(normalizeTestType('positive')).toBe('+');
			expect(normalizeTestType('')).toBe('+');
			expect(normalizeTestType(null)).toBe('+');
		});

		it('mengembalikan - untuk negative', () => {
			expect(normalizeTestType('-')).toBe('-');
			expect(normalizeTestType('negative')).toBe('-');
		});
	});

	describe('normalizeTestCaseStatus', () => {
		it('mengembalikan status yang dikenali tanpa sensitif huruf', () => {
			expect(normalizeTestCaseStatus('passed')).toBe('Passed');
			expect(normalizeTestCaseStatus('FAILED')).toBe('Failed');
			expect(normalizeTestCaseStatus('re-test')).toBe('Re-Test');
			expect(normalizeTestCaseStatus('Skip')).toBe('Skip');
			expect(normalizeTestCaseStatus('Progress')).toBe('Progress');
		});

		it('mengembalikan Progress sebagai fallback status default', () => {
			expect(normalizeTestCaseStatus('unknown')).toBe('Progress');
			expect(normalizeTestCaseStatus('')).toBe('Progress');
			expect(normalizeTestCaseStatus(null)).toBe('Progress');
		});
	});

	describe('assertTestCaseExists', () => {
		it('melempar NotFoundException jika test case null atau undefined', () => {
			expect(() => assertTestCaseExists(null)).toThrow(NotFoundException);
			expect(() => assertTestCaseExists(undefined)).toThrow(NotFoundException);
		});

		it('mengembalikan test case jika ada', () => {
			const tc: Entity.IQaTestCase = { id_test_case: 10, title: 'TC Valid' };
			expect(assertTestCaseExists(tc)).toBe(tc);
		});
	});

	describe('toTestCaseResponse', () => {
		it('memformat test case entity ke response DTO', () => {
			const res = toTestCaseResponse({
				id_test_case: 5,
				id_project: 1,
				test_case_id: 'TC-01',
				title: 'Test login',
				status: 'Passed'
			});

			expect(res.id_test_case).toBe(5);
			expect(res.id_project).toBe(1);
			expect(res.test_case_id).toBe('TC-01');
			expect(res.title).toBe('Test login');
			expect(res.status).toBe('Passed');
			expect(res.feature).toBeNull();
		});
	});
});

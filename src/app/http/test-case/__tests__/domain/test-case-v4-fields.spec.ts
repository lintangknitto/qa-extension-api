import { safeParse } from 'valibot';
import { toTestCaseResponse } from '../../domain/test-case.domain';
import { createTestCaseValidation, updateTestCaseValidation } from '../../test-case.request';
import projectRequest from '../../../project/project.request';
import { pickProjectMetadata, toProjectResponse } from '../../../project/domain/project.domain';

describe('field format V4 (scenario, test_date, metadata project)', () => {
	it('request test case menerima scenario & test_date, test_date maksimal 50 karakter', () => {
		const base = { test_case_id: 'TC1-1', title: 'Login berhasil' };
		expect(safeParse(createTestCaseValidation, { ...base, scenario: 'Login', test_date: '7 November 2025' }).success).toBe(true);
		expect(safeParse(updateTestCaseValidation, { scenario: '', test_date: '2025-11-07' }).success).toBe(true);
		expect(safeParse(createTestCaseValidation, { ...base, test_date: 'x'.repeat(51) }).success).toBe(false);
	});

	it('response test case mengembalikan scenario & test_date (null bila kosong)', () => {
		expect(toTestCaseResponse({ id_test_case: 1, id_project: 1, scenario: 'Login', test_date: '7/11/2025' })).toMatchObject({
			scenario: 'Login',
			test_date: '7/11/2025'
		});
		expect(toTestCaseResponse({ id_test_case: 1, id_project: 1 })).toMatchObject({ scenario: null, test_date: null });
	});

	it('request project menerima field metadata V4 dan membatasi panjangnya', () => {
		const parsed = safeParse(projectRequest.updateProjectValidation, {
			release_version: 'v2.3.0',
			tester_name: 'Hana',
			link_figma: 'https://figma.com/x',
			ip_dev: null
		});
		expect(parsed.success).toBe(true);
		expect(safeParse(projectRequest.createProjectValidation, { name: 'Project A', brd_id: 'B'.repeat(101) }).success).toBe(false);
	});

	it('pickProjectMetadata: hanya field yang dikirim, string kosong jadi null', () => {
		expect(pickProjectMetadata({ tester_name: ' Hana ', ip_dev: '', brd_id: null })).toEqual({
			tester_name: 'Hana',
			ip_dev: null,
			brd_id: null
		});
		expect(pickProjectMetadata({})).toEqual({});
	});

	it('response project menyertakan semua field metadata', () => {
		const res = toProjectResponse({ id_project: 1, name: 'A', task_dev: 'TASK-1' });
		expect(res).toMatchObject({ task_dev: 'TASK-1', release_version: null, link_task_pb: null, link_figma: null });
	});
});

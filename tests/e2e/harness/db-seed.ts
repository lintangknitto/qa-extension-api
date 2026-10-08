import { Pool } from 'pg';
import { hashPassword } from '../../../src/libs/helpers/password';

export interface ISeedResult {
	user: {
		id: number;
		username: string;
		passwordPlain: string;
		nama: string;
		level: string;
	};
	program: {
		id: number;
		name: string;
		code: string;
		baseUrl: string;
	};
	project: {
		id: number;
		name: string;
		code: string;
	};
	testCase: {
		id: number;
		testCaseNo: string;
		title: string;
	};
}

export const seedFixtureData = async (
	pool: Pool,
	options: { baseUrl: string; customSuffix?: string }
): Promise<ISeedResult> => {
	const suffix = options.customSuffix || Math.random().toString(36).substring(2, 7);
	const username = `qa_tester_${suffix}`;
	const passwordPlain = `TestPass!_${suffix}_99`;
	const hashedPassword = await hashPassword(passwordPlain);

	// 1. Seed QA User
	const userRes = await pool.query<{ id_user: string }>(
		`INSERT INTO users (username, password, nama, level, is_active)
		 VALUES ($1, $2, $3, 'QA', TRUE)
		 RETURNING id_user`,
		[username, hashedPassword, `Tester QA ${suffix}`]
	);
	const userId = parseInt(userRes.rows[0].id_user, 10);

	// 2. Seed Master Program
	const programCode = `PRG-${suffix.toUpperCase()}`;
	const programRes = await pool.query<{ id_program: string }>(
		`INSERT INTO programs (name, code, description, base_url, repo_url, is_active, created_by_user_id)
		 VALUES ($1, $2, $3, $4, $5, TRUE, $6)
		 RETURNING id_program`,
		[
			`Program Test ${suffix}`,
			programCode,
			'Program fixture untuk pengujian E2E',
			options.baseUrl,
			'https://github.com/knittotextile/e2e-target.git',
			userId
		]
	);
	const programId = parseInt(programRes.rows[0].id_program, 10);

	// 3. Seed Project
	const projectCode = `PRJ-${suffix.toUpperCase()}`;
	const projectRes = await pool.query<{ id_project: string }>(
		`INSERT INTO projects (name, code, description, is_active, id_program, created_by_user_id)
		 VALUES ($1, $2, $3, TRUE, $4, $5)
		 RETURNING id_project`,
		[
			`Project E2E ${suffix}`,
			projectCode,
			'Project fixture untuk pengujian E2E',
			programId,
			userId
		]
	);
	const projectId = parseInt(projectRes.rows[0].id_project, 10);

	// 4. Seed Relasi Many-to-Many project_programs
	await pool.query(
		`INSERT INTO project_programs (id_project, id_program)
		 VALUES ($1, $2)
		 ON CONFLICT (id_project, id_program) DO NOTHING`,
		[projectId, programId]
	);

	// 5. Seed Test Case
	const testCaseNo = `TC-E2E-${suffix.toUpperCase()}`;
	const testCaseRes = await pool.query<{ id_test_case: string }>(
		`INSERT INTO test_cases (id_project, id_program, test_case_id, title, test_steps, expected_result, status, created_by_user_id)
		 VALUES ($1, $2, $3, $4, $5, $6, 'Progress', $7)
		 RETURNING id_test_case`,
		[
			projectId,
			programId,
			testCaseNo,
			'Verifikasi Pembelian Produk Melalui Portal',
			'1. Buka form 2. Isi data 3. Submit',
			'Produk masuk keranjang',
			userId
		]
	);
	const testCaseId = parseInt(testCaseRes.rows[0].id_test_case, 10);

	return {
		user: {
			id: userId,
			username,
			passwordPlain,
			nama: `Tester QA ${suffix}`,
			level: 'QA'
		},
		program: {
			id: programId,
			name: `Program Test ${suffix}`,
			code: programCode,
			baseUrl: options.baseUrl
		},
		project: {
			id: projectId,
			name: `Project E2E ${suffix}`,
			code: projectCode
		},
		testCase: {
			id: testCaseId,
			testCaseNo,
			title: 'Verifikasi Pembelian Produk Melalui Portal'
		}
	};
};

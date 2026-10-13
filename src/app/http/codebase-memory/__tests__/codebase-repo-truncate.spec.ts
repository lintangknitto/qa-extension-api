jest.mock('@/libs/config/postgresConnection', () => ({ __esModule: true, default: { raw: jest.fn() } }));

import postgresConnection from '@/libs/config/postgresConnection';
import { insertCodebaseSymbols } from '../repo/codebase.repo';

describe('insertCodebaseSymbols', () => {
	it('nama/scope simbol lebih dari 255 karakter dipotong agar tidak gagal "value too long for type character varying(255)"', async () => {
		await insertCodebaseSymbols(1, 2, [
			{ name: 'n'.repeat(600), kind: 'route_handler', signature: 'GET', start_line: 1, end_line: 2, scope_path: 's'.repeat(300), metadata: {} }
		]);
		const params = (postgresConnection.raw as jest.Mock).mock.calls[0][1] as unknown[];
		expect((params[2] as string).length).toBe(255);
		expect((params[2] as string).endsWith('…')).toBe(true);
		expect((params[8] as string).length).toBe(255);
	});
});

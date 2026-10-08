import { searchCodebaseUseCase } from '../use-case/search-codebase.use-case';
import * as projectQueries from '@/app/http/project/queries/project.queries';
import * as codebaseQueries from '../queries/codebase.queries';
import embeddingService from '@/libs/services/embedding.service';

jest.mock('@/app/http/project/queries/project.queries');
jest.mock('../queries/codebase.queries');
jest.mock('@/libs/services/embedding.service');

describe('Codebase Use Cases', () => {
	afterEach(() => {
		jest.clearAllMocks();
	});

	it('searchCodebaseUseCase men-generate query embedding dan mengembalikan ranked items', async () => {
		jest.spyOn(projectQueries, 'findProjectById').mockResolvedValue({
			id_project: 1,
			name: 'Knitto Portal'
		});

		jest.spyOn(embeddingService, 'generateEmbedding').mockResolvedValue([0.1, 0.2]);
		jest.spyOn(embeddingService, 'formatVectorForPg').mockReturnValue('[0.1,0.2]');

		jest.spyOn(codebaseQueries, 'searchCodebaseChunksByVector').mockResolvedValue([
			{
				id_chunk: 10,
				id_file: 2,
				id_project: 1,
				file_path: 'src/user/user.service.ts',
				chunk_type: 'symbol',
				content: 'export const createUser = async () => {}',
				start_line: 10,
				end_line: 25,
				similarity: 0.885,
				metadata: {}
			}
		]);

		jest.spyOn(codebaseQueries, 'searchCodebaseSymbols').mockResolvedValue([]);

		const result = await searchCodebaseUseCase({
			id_project: 1,
			userId: 1,
			userLevel: 'ADMIN',
			query: 'create user service'
		});

		expect(result.total_results).toBe(1);
		expect(result.items[0].file_path).toBe('src/user/user.service.ts');
		expect(result.items[0].similarity_percentage).toBe(88.5);
	});

	it('menolak akses codebase milik project QA lain sebelum memanggil layanan embedding', async () => {
		jest.spyOn(projectQueries, 'findProjectById').mockResolvedValue({
			id_project: 1,
			name: 'Project privat',
			created_by_user_id: 20
		});

		await expect(searchCodebaseUseCase({
			id_project: 1,
			userId: 21,
			userLevel: 'QA',
			query: 'secret source'
		})).rejects.toThrow();

		expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
	});
});

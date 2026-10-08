import { EmbeddingService } from '../embedding.service';

describe('EmbeddingService', () => {
	const originalFetch = global.fetch;

	afterEach(() => {
		global.fetch = originalFetch;
		jest.restoreAllMocks();
	});

	it('formatVectorForPg harus memformat array numerik menjadi string vector PostgreSQL', () => {
		const service = new EmbeddingService();
		const formatted = service.formatVectorForPg([0.123, -0.456, 0.789]);
		expect(formatted).toBe('[0.123,-0.456,0.789]');
	});

	it('formatVectorForPg harus melempar exception jika array kosong', () => {
		const service = new EmbeddingService();
		expect(() => service.formatVectorForPg([])).toThrow('Vector embedding tidak boleh kosong.');
	});

	it('generateEmbedding mengembalikan zero-vector jika teks kosong', async () => {
		const service = new EmbeddingService({ dimensions: 4 });
		const vector = await service.generateEmbedding('   ');
		expect(vector).toEqual([0, 0, 0, 0]);
	});

	it('generateBatchEmbeddings memanggil API dan mengurutkan berdasarkan index response', async () => {
		const mockFetch = jest.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				model: 'openrouter/openai/text-embedding-3-small',
				data: [
					{ index: 1, embedding: [0.2, 0.3] },
					{ index: 0, embedding: [0.1, 0.1] }
				]
			})
		});
		global.fetch = mockFetch as unknown as typeof fetch;

		const service = new EmbeddingService({
			baseUrl: 'http://localhost:20128/v1',
			apiKey: 'test-key',
			model: 'test-model'
		});

		const result = await service.generateBatchEmbeddings(['text1', 'text2']);

		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual([0.1, 0.1]);
		expect(result[1]).toEqual([0.2, 0.3]);
	});

	it('melempar exception jika response HTTP not ok', async () => {
		const mockFetch = jest.fn().mockResolvedValue({
			ok: false,
			status: 500,
			statusText: 'Internal Server Error',
			text: async () => 'Proxy timeout'
		});
		global.fetch = mockFetch as unknown as typeof fetch;

		const service = new EmbeddingService({ baseUrl: 'http://localhost:20128/v1' });

		await expect(service.generateEmbedding('hello')).rejects.toThrow(
			'Embedding API HTTP 500: Proxy timeout'
		);
	});
});

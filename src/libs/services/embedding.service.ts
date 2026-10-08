import { embeddingConfig } from '@/libs/config';
import { GeneralException } from '@knittotextile/knitto-core-backend/dist/CoreException';

export interface IEmbeddingResponse {
	embedding: number[];
	model: string;
	dimensions: number;
}

export class EmbeddingService {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly model: string;
	private readonly dimensions: number;

	constructor(config?: {
		baseUrl?: string;
		apiKey?: string;
		model?: string;
		dimensions?: number;
	}) {
		this.baseUrl = (config?.baseUrl || embeddingConfig.BASE_URL).replace(/\/+$/, '');
		this.apiKey = config?.apiKey || embeddingConfig.API_KEY;
		this.model = config?.model || embeddingConfig.MODEL;
		this.dimensions = config?.dimensions || embeddingConfig.DIMENSIONS;
	}

	public formatVectorForPg(vector: number[]): string {
		if (!Array.isArray(vector) || vector.length === 0) {
			throw new GeneralException('Vector embedding tidak boleh kosong.');
		}
		return `[${vector.join(',')}]`;
	}

	public async generateEmbedding(text: string): Promise<number[]> {
		const trimmed = text.trim();
		if (!trimmed) {
			return new Array(this.dimensions).fill(0);
		}

		const results = await this.generateBatchEmbeddings([trimmed]);
		return results[0];
	}

	public async generateBatchEmbeddings(
		texts: string[],
		batchSize = 16
	): Promise<number[][]> {
		if (texts.length === 0) return [];

		const allEmbeddings: number[][] = [];

		for (let i = 0; i < texts.length; i += batchSize) {
			const batch = texts.slice(i, i + batchSize);
			const batchResults = await this.callEmbeddingApi(batch);
			allEmbeddings.push(...batchResults);
		}

		return allEmbeddings;
	}

	private async callEmbeddingApi(inputTexts: string[]): Promise<number[][]> {
		const endpoint = `${this.baseUrl}/embeddings`;
		const safeInputs = inputTexts.map((t) => (t.length > 6000 ? t.slice(0, 6000) : t));
		const body = {
			model: this.model,
			input: safeInputs.length === 1 ? safeInputs[0] : safeInputs
		};

		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};

		if (this.apiKey) {
			headers['Authorization'] = `Bearer ${this.apiKey}`;
		}

		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new GeneralException(
					`Embedding API HTTP ${response.status}: ${errorText || response.statusText}`
				);
			}

			const json = (await response.json()) as {
				data?: Array<{ embedding: number[]; index?: number }>;
				error?: { message?: string };
			};

			if (json.error) {
				throw new GeneralException(`Embedding API error: ${json.error.message || 'Unknown error'}`);
			}

			if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
				throw new GeneralException('Format response embedding API tidak valid: field data kosong.');
			}

			// Sort by index if present to guarantee ordering matches input
			const sorted = [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
			return sorted.map((item) => {
				if (!Array.isArray(item.embedding)) {
					throw new GeneralException('Data embedding tidak berformat array numerik.');
				}
				return item.embedding;
			});
		} catch (err: unknown) {
			if (err instanceof GeneralException) throw err;
			throw new GeneralException(
				`Gagal menghubungi endpoint embedding (${endpoint}): ${(err as Error).message}`
			);
		}
	}
}

export default new EmbeddingService();

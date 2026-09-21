import OpenAI from 'openai';
import { openAiConfig } from '.';

/**
 * Completer abstraction supaya logika generation bisa diuji tanpa memanggil
 * provider AI sungguhan.
 */
export interface IAiCompletionRequest {
	system: string;
	user: string;
}

export interface IAiCompleter {
	complete(request: IAiCompletionRequest): Promise<string>;
}

let sharedClient: OpenAI | null = null;

export const getOpenAiClient = (): OpenAI => {
	if (!sharedClient) {
		sharedClient = new OpenAI({
			apiKey: openAiConfig.API_KEY,
			baseURL: openAiConfig.BASE_URL,
			timeout: openAiConfig.TIMEOUT_MS,
			maxRetries: 0
		});
	}
	return sharedClient;
};

export const resetOpenAiClient = (): void => {
	sharedClient = null;
};

export const createOpenAiCompleter = (client: OpenAI = getOpenAiClient()): IAiCompleter => ({
	async complete({ system, user }: IAiCompletionRequest): Promise<string> {
		const response = await client.chat.completions.create(
			{
				model: openAiConfig.MODEL,
				max_tokens: openAiConfig.MAX_OUTPUT_TOKENS,
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user }
				]
			},
			{ timeout: openAiConfig.TIMEOUT_MS }
		);

		return response.choices?.[0]?.message?.content ?? '';
	}
});

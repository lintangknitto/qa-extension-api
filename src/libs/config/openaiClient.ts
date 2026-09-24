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

export const sanitizeAiResponseText = (rawText: string): string => {
	// Memotong trailing SSE artifact seperti 'data: [DONE]' yang kadang dikirim proxy non-standar pada respon non-streaming
	return rawText.replace(/data:\s*\[DONE\]\s*$/i, '').trim();
};

export const createAiFetchWrapper = (baseFetch: typeof fetch = fetch): typeof fetch => {
	return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const response = await baseFetch(input, init);
		const contentType = response.headers.get('content-type') || '';
		if (contentType.includes('application/json') || contentType.includes('text/')) {
			const rawText = await response.text();
			const cleaned = sanitizeAiResponseText(rawText);
			return new Response(cleaned, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers
			});
		}
		return response;
	};
};

let sharedClient: OpenAI | null = null;

export const getOpenAiClient = (): OpenAI => {
	if (!sharedClient) {
		sharedClient = new OpenAI({
			apiKey: openAiConfig.API_KEY,
			baseURL: openAiConfig.BASE_URL,
			timeout: openAiConfig.TIMEOUT_MS,
			maxRetries: 0,
			fetch: createAiFetchWrapper()
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

		const choice = response.choices?.[0];
		const message = choice?.message as
			| (typeof choice.message & { reasoning_content?: string; reasoning?: string })
			| undefined;

		return message?.content ?? message?.reasoning_content ?? message?.reasoning ?? '';
	}
});

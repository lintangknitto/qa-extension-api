import type OpenAI from 'openai';
import { openAiConfig } from '..';
import {
	createOpenAiCompleter,
	sanitizeAiResponseText,
	createAiFetchWrapper
} from '../openaiClient';

const fakeOpenAi = (
	messagePayload: { content?: string | null; reasoning?: string; reasoning_content?: string } | null
): OpenAI =>
	({
		chat: {
			completions: {
				create: async () => ({
					choices: [
						{
							message: messagePayload ?? { content: null }
						}
					]
				})
			}
		}
	}) as unknown as OpenAI;

describe('openaiClient', () => {
	it('mengembalikan konten dari provider OpenAI-compatible', async () => {
		const completer = createOpenAiCompleter(fakeOpenAi({ content: 'hasil ringkasan' }));
		await expect(completer.complete({ system: 's', user: 'u' })).resolves.toBe('hasil ringkasan');
	});

	it('mengembalikan string kosong bila provider tidak memberi konten', async () => {
		const completer = createOpenAiCompleter(fakeOpenAi(null));
		await expect(completer.complete({ system: 's', user: 'u' })).resolves.toBe('');
	});

	it('fallback ke reasoning atau reasoning_content jika content kosong', async () => {
		const completerReasoning = createOpenAiCompleter(
			fakeOpenAi({ content: null, reasoning: 'alasan analisis' })
		);
		await expect(completerReasoning.complete({ system: 's', user: 'u' })).resolves.toBe(
			'alasan analisis'
		);

		const completerReasoningContent = createOpenAiCompleter(
			fakeOpenAi({ content: null, reasoning_content: 'alasan deepseek' })
		);
		await expect(completerReasoningContent.complete({ system: 's', user: 'u' })).resolves.toBe(
			'alasan deepseek'
		);
	});

	it('sanitizeAiResponseText memotong trailing data: [DONE]', () => {
		const dirty = '{"id":"test","choices":[]}data: [DONE]\n\n';
		expect(sanitizeAiResponseText(dirty)).toBe('{"id":"test","choices":[]}');

		const clean = '{"id":"test","choices":[]}';
		expect(sanitizeAiResponseText(clean)).toBe('{"id":"test","choices":[]}');
	});

	it('createAiFetchWrapper membersihkan respon JSON yang mengandung SSE suffix', async () => {
		const mockBaseFetch = jest.fn().mockResolvedValue(
			new Response('{"id":"123","result":"ok"}data: [DONE]', {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
		);

		const wrappedFetch = createAiFetchWrapper(mockBaseFetch as unknown as typeof fetch);
		const res = await wrappedFetch('http://test.api/chat/completions');
		const json = await res.json();
		expect(json).toEqual({ id: '123', result: 'ok' });
	});

	it('memakai model dari konfigurasi environment', () => {
		// Model dibaca dari OPENAI_MODEL; default kosong bila belum diisi.
		expect(typeof openAiConfig.MODEL).toBe('string');
	});
});

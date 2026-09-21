import type OpenAI from 'openai';
import { openAiConfig } from '..';
import { createOpenAiCompleter } from '../openaiClient';

const fakeOpenAi = (content: string | null): OpenAI =>
	({
		chat: {
			completions: {
				create: async () => ({ choices: [{ message: { content } }] })
			}
		}
	}) as unknown as OpenAI;

describe('openaiClient', () => {
	it('mengembalikan konten dari provider OpenAI-compatible', async () => {
		const completer = createOpenAiCompleter(fakeOpenAi('hasil ringkasan'));
		await expect(completer.complete({ system: 's', user: 'u' })).resolves.toBe('hasil ringkasan');
	});

	it('mengembalikan string kosong bila provider tidak memberi konten', async () => {
		const completer = createOpenAiCompleter(fakeOpenAi(null));
		await expect(completer.complete({ system: 's', user: 'u' })).resolves.toBe('');
	});

	it('memakai model dari konfigurasi environment', () => {
		// Model dibaca dari OPENAI_MODEL; default kosong bila belum diisi.
		expect(typeof openAiConfig.MODEL).toBe('string');
	});
});

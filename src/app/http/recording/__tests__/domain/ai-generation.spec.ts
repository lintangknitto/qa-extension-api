import { InvalidParameterException } from '@knittotextile/knitto-core-backend/dist/CoreException';
import {
	assertGenerationKind,
	buildSystemPrompt,
	isGenerationKind,
	normalizeAiOutput,
	toGenerationResponse
} from '../../domain/ai-generation';

describe('ai-generation', () => {
	describe('isGenerationKind / assertGenerationKind', () => {
		it('menerima kind yang dikenal', () => {
			expect(isGenerationKind('markdown')).toBe(true);
			expect(isGenerationKind('playwright')).toBe(true);
			expect(assertGenerationKind('playwright')).toBe('playwright');
		});

		it('menolak kind yang tidak dikenal', () => {
			expect(isGenerationKind('pdf')).toBe(false);
			expect(() => assertGenerationKind('pdf')).toThrow(InvalidParameterException);
		});
	});

	describe('buildSystemPrompt', () => {
		it('mengembalikan prompt berbeda per kind dan tidak kosong', () => {
			const markdown = buildSystemPrompt('markdown');
			const playwright = buildSystemPrompt('playwright');
			expect(markdown.length).toBeGreaterThan(0);
			expect(playwright.length).toBeGreaterThan(0);
			expect(markdown).not.toBe(playwright);
		});
	});

	describe('normalizeAiOutput', () => {
		it('mempertahankan markdown apa adanya', () => {
			expect(normalizeAiOutput('markdown', '  # Judul  ')).toBe('# Judul');
		});

		it('membuang code fence pada draft Playwright', () => {
			const raw = '```ts\nimport { test } from "@playwright/test";\n```';
			expect(normalizeAiOutput('playwright', raw)).toBe('import { test } from "@playwright/test";');
		});

		it('menerima output Playwright tanpa fence', () => {
			expect(normalizeAiOutput('playwright', 'const a = 1;')).toBe('const a = 1;');
		});

		it('menolak output kosong', () => {
			expect(() => normalizeAiOutput('markdown', '   ')).toThrow(InvalidParameterException);
		});
	});

	describe('toGenerationResponse', () => {
		it('menormalkan attempt_count menjadi angka', () => {
			expect(toGenerationResponse({ id_generation: 1 }).attempt_count).toBe(0);
			expect(toGenerationResponse({ id_generation: 1, attempt_count: 3 }).attempt_count).toBe(3);
		});
	});
});

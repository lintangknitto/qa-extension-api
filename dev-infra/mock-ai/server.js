const http = require('http');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
	const url = req.url || '';
	
	if (req.method === 'GET' && (url === '/health' || url === '/')) {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ status: 'ok', service: 'mock-ai' }));
		return;
	}

	if (req.method === 'POST' && (url.endsWith('/chat/completions') || url.endsWith('/completions'))) {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
		});

		req.on('end', () => {
			let kind = 'markdown';
			let userMessage = '';
			try {
				const parsed = JSON.parse(body);
				const systemMessage = (parsed.messages || []).find((m) => m.role === 'system')?.content || '';
				userMessage = (parsed.messages || []).find((m) => m.role === 'user')?.content || '';
				if (systemMessage.toLowerCase().includes('menginvestigasi')) {
					kind = 'investigation';
				} else if (systemMessage.toLowerCase().includes('playwright')) {
					kind = 'playwright';
				}
			} catch (_) {
				// fallback default
			}

			let content = '';
			if (kind === 'investigation') {
				// Kutip baris log dari blok "Cuplikan" di konteks, seperti yang diminta prompt investigasi.
				const quoted = [];
				let inBlock = false;
				for (const raw of userMessage.split('\n')) {
					const line = raw.trim();
					if (line === '```') {
						inBlock = !inBlock;
						continue;
					}
					if (inBlock && line) quoted.push(`> ${line}`);
				}
				content = [
					'## Ringkasan',
					'Mock investigasi deterministik.',
					'## Bukti',
					...(quoted.length > 0 ? quoted : ['Log tidak ditemukan.'])
				].join('\n');
			} else if (kind === 'playwright') {
				content = [
					"import { test, expect } from '@playwright/test';",
					"",
					"test('E2E Generated Test', async ({ page }) => {",
					"  await page.goto('http://localhost:3000');",
					"  await expect(page).toBeDefined();",
					"});"
				].join('\n');
			} else {
				content = [
					'# Ringkasan Pengujian QA',
					'',
					'- **Status**: PASS',
					'- **Test Case**: TC-E2E-001',
					'- **Hasil**: Seluruh checkpoint dan aksi tervalidasi dengan baik.',
					'- **Catatan**: Mock AI deterministic output.'
				].join('\n');
			}

			const responsePayload = {
				id: `chatcmpl-mock-${Date.now()}`,
				object: 'chat.completion',
				created: Math.floor(Date.now() / 1000),
				model: 'mock-gpt-4o',
				choices: [
					{
						index: 0,
						message: {
							role: 'assistant',
							content
						},
						finish_reason: 'stop'
					}
				],
				usage: {
					prompt_tokens: 100,
					completion_tokens: 50,
					total_tokens: 150
				}
			};

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(responsePayload));
		});
		return;
	}

	res.writeHead(404, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
	console.log(`Mock AI server listening on port ${PORT}`);
});

import { chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

declare const chrome: any;

export interface IBrowserHarness {
	context: BrowserContext;
	page: Page;
	userDataDir: string;
	close: () => Promise<void>;
}

export const ensureExtensionBuilt = (extensionRootPath?: string): string => {
	const resolvedRoot = extensionRootPath || process.env.QA_EXTENSION_PATH || path.resolve(__dirname, '../../../../qa-chrome-extension');
	const distPath = path.resolve(resolvedRoot, 'packages/extension/dist');

	const manifestPath = path.join(distPath, 'manifest.json');
	if (!fs.existsSync(manifestPath)) {
		console.info(`Membangun extension di ${resolvedRoot}...`);
		execSync('pnpm --dir packages/extension build', {
			cwd: resolvedRoot,
			stdio: 'inherit'
		});
	}

	if (!fs.existsSync(manifestPath)) {
		throw new Error(`Extension build gagal atau manifest.json tidak ditemukan di ${distPath}`);
	}

	return distPath;
};

export const launchBrowserHarness = async (options: {
	extensionPath?: string;
	apiBaseUrl: string;
	headless?: boolean;
}): Promise<IBrowserHarness> => {
	const distPath = ensureExtensionBuilt(options.extensionPath);

	// Profile sementara khusus E2E (DILARANG menggunakan profile Chrome pribadi)
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knitto-qa-e2e-profile-'));

	// Extension Chromium memerlukan headless: false atau --headless=new
	const isHeadless = options.headless ?? true;
	const args = [
		`--disable-extensions-except=${distPath}`,
		`--load-extension=${distPath}`,
		'--no-sandbox',
		'--disable-setuid-sandbox',
		'--disable-dev-shm-usage',
		'--disable-gpu'
	];

	if (isHeadless) {
		args.push('--headless=new');
	}

	const context = await chromium.launchPersistentContext(userDataDir, {
		headless: false, // Diganti dengan argument --headless=new di args agar extension tetap aktif
		args,
		viewport: { width: 1280, height: 800 }
	});

	// Konfigurasi API Base URL ke dalam chrome.storage.local extension
	let worker = context.serviceWorkers()[0];
	if (!worker) {
		worker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null as any);
	}

	if (worker) {
		await worker.evaluate(async (url) => {
			if (typeof chrome !== 'undefined' && chrome.storage?.local) {
				await chrome.storage.local.set({
					qa_recording_base_url: url,
					qa_fab_settings: { enabled: true, side: 'right' }
				});
				const check = await chrome.storage.local.get(['qa_recording_base_url', 'qa_fab_settings']);
				console.log('[E2E HARNESS] Storage bootstrap verified in worker:', JSON.stringify(check));
			}
		}, options.apiBaseUrl);
	} else {
		console.warn('[E2E HARNESS] Service worker tidak ditemukan setelah 15 detik!');
	}

	const page = context.pages()[0] || (await context.newPage());

	return {
		context,
		page,
		userDataDir,
		close: async () => {
			try {
				await context.close();
			} finally {
				// Bersihkan profile browser sementara
				try {
					fs.rmSync(userDataDir, { recursive: true, force: true });
				} catch (_) {
					// silent cleanup
				}
			}
		}
	};
};

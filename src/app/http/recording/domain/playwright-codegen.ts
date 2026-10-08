import type { IAiInputCheckpoint, IAiInputEvent } from './ai-input';

/**
 * Generator script Playwright deterministik (tanpa AI). Setiap aksi tester
 * dipetakan 1:1 ke satu baris aksi, dengan aturan penggabungan yang terdefinisi:
 * - input beruntun pada elemen yang sama → satu `fill` (nilai terakhir)
 * - change setelah input dengan nilai sama → dibuang
 * - click + change pada checkbox/radio → `check()`/`uncheck()`
 * - click + change pada <select> → `selectOption({ label })`
 * - navigasi ≤ NAVIGATION_FOLLOW_MS setelah click/Enter → `waitForURL` (bukan `goto`)
 * - redirect beruntun → satu `waitForURL` ke URL akhir
 * Input yang sama selalu menghasilkan output byte-identik.
 */

export const NAVIGATION_FOLLOW_MS = 1500;

/** Dicatat di kolom `model`/`prompt_version` generation agar jelas script bukan hasil AI. */
export const CODEGEN_MODEL = 'deterministic-codegen';
export const CODEGEN_VERSION = 'codegen-v1';

export type CodegenAction =
	| 'goto'
	| 'waitForURL'
	| 'fill'
	| 'click'
	| 'dblclick'
	| 'rightclick'
	| 'hover'
	| 'press'
	| 'check'
	| 'uncheck'
	| 'selectOption'
	| 'dragTo'
	| 'setInputFiles';

/** Waktu maksimum antara klik pertama dan event dblclick agar dianggap satu double-click. */
export const DBLCLICK_MERGE_MS = 700;

export interface CodegenStep {
	/** Nomor langkah 1-based di script. */
	no: number;
	action: CodegenAction;
	/** Ekspresi locator tanpa prefix `page.` (kosong untuk goto/waitForURL). */
	locator: string;
	/** Nilai literal: teks fill, key press, label opsi, atau URL. */
	value?: string;
	/** Nama env var untuk nilai sensitif (value tidak ditulis). */
	secretEnv?: string;
	/** Locator tujuan untuk `dragTo` (tanpa prefix `page.`). */
	targetLocator?: string;
	/** Nama file untuk `setInputFiles` (file asli tidak terekam). */
	files?: string[];
	ambiguous: boolean;
	/** Sequence event sumber (untuk korelasi dengan rekaman). */
	sequences: number[];
	comments: string[];
}

export interface CodegenResult {
	script: string;
	steps: CodegenStep[];
}

export interface CodegenInput {
	session: { test_case_no?: string | null; title?: string | null; target_url?: string | null };
	events: IAiInputEvent[];
	checkpoints: IAiInputCheckpoint[];
}

interface NormalizedAction {
	kind: 'navigation' | 'click' | 'dblclick' | 'rightclick' | 'hover' | 'drag' | 'upload' | 'input' | 'change' | 'keydown';
	sequence: number;
	timeMs: number | null;
	locator: string;
	ambiguous: boolean;
	tag: string;
	inputType: string;
	value: string | null;
	redacted: boolean;
	checked?: boolean;
	selectedText?: string;
	key?: string;
	url?: string;
	/** URL halaman saat aksi terjadi (bukan target navigasi). */
	pageUrl?: string;
	targetLocator?: string;
	files?: string[];
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/** Literal string JS bertanda kutip tunggal yang aman untuk teks apa pun. */
export const quoteJs = (value: string): string => {
	let out = '';
	for (const ch of value) {
		if (ch === '\\') out += '\\\\';
		else if (ch === "'") out += "\\'";
		else if (ch === '\r') out += '\\r';
		else if (ch === '\n') out += '\\n';
		else if (ch === LINE_SEPARATOR) out += '\\u2028';
		else if (ch === PARAGRAPH_SEPARATOR) out += '\\u2029';
		else out += ch;
	}
	return `'${out}'`;
};

const stripPagePrefix = (locator: string): string => locator.replace(/^page\./, '');

const isInternalEvent = (payload: Record<string, unknown>): boolean => {
	const element = asRecord(payload.element);
	const haystack = [
		...(Array.isArray(payload.locators) ? payload.locators : []),
		payload.selector,
		element.id,
		element.testId,
		element.cssPath
	]
		.filter((v): v is string => typeof v === 'string')
		.join(' ');
	return haystack.includes('qa-knitto');
};

/**
 * Prefix iframe: setiap level `<iframe>` (terluar → terdalam) menjadi `<locator>.contentFrame()`,
 * sehingga aksi di dalam iframe menghasilkan `page.<iframe>.contentFrame().<locator>`.
 */
const framePrefix = (payload: Record<string, unknown>): string => {
	const frames = Array.isArray(payload.frame_locators) ? payload.frame_locators.filter((f): f is string => typeof f === 'string' && f.length > 0) : [];
	return frames.map((frame) => `${stripPagePrefix(frame)}.contentFrame().`).join('');
};

/** Locator terbaik: unik dari engine > kandidat pertama > selector legacy. */
const pickLocator = (payload: Record<string, unknown>): string => {
	const unique = asString(payload.unique_locator);
	if (unique) return stripPagePrefix(unique);
	const locators = Array.isArray(payload.locators) ? payload.locators.filter((l): l is string => typeof l === 'string' && l.length > 0) : [];
	if (locators.length > 0) return stripPagePrefix(locators[0]);
	const legacy = asString(payload.selector) || asString(payload.locator);
	return legacy ? `locator(${quoteJs(legacy)})` : '';
};

const toTimeMs = (occurredAt?: string | null): number | null => {
	if (!occurredAt) return null;
	const ms = Date.parse(occurredAt);
	return Number.isNaN(ms) ? null : ms;
};

const ACTION_KINDS: Record<string, NormalizedAction['kind']> = {
	navigation: 'navigation',
	navigate: 'navigation',
	click: 'click',
	dblclick: 'dblclick',
	rightclick: 'rightclick',
	hover: 'hover',
	drag: 'drag',
	upload: 'upload',
	input: 'input',
	fill: 'input',
	change: 'change',
	keydown: 'keydown'
};

const withFrame = (payload: Record<string, unknown>, locator: string): string => (locator ? `${framePrefix(payload)}${locator}` : '');

const pickTargetLocator = (payload: Record<string, unknown>): string => {
	const unique = asString(payload.target_unique_locator);
	if (unique) return stripPagePrefix(unique);
	const locators = Array.isArray(payload.target_locators) ? payload.target_locators.filter((l): l is string => typeof l === 'string' && l.length > 0) : [];
	return locators.length > 0 ? stripPagePrefix(locators[0]) : '';
};

const baseOf = (event: IAiInputEvent, element: Record<string, unknown>) => {
	const payload = event.payload;
	return {
		sequence: event.sequence,
		timeMs: toTimeMs(event.occurredAt),
		locator: withFrame(payload, pickLocator(payload)),
		// Data rekaman lama tidak punya flag `ambiguous` → anggap tidak diketahui (false).
		ambiguous: payload.ambiguous === true,
		tag: asString(element.tagName).toLowerCase(),
		inputType: asString(element.type).toLowerCase(),
		value: typeof payload.value === 'string' ? payload.value : null,
		redacted: payload.value_redacted === true,
		pageUrl: event.url || asString(payload.pageUrl) || undefined
	};
};

const changeDetails = (payload: Record<string, unknown>, element: Record<string, unknown>) => ({
	checked: typeof payload.checked === 'boolean' ? payload.checked : undefined,
	selectedText: asString(payload.selectedText) || asString(element.selectedText) || undefined
});

/** Field khusus per jenis aksi (change, keydown, drag, upload). */
const kindDetails = (kind: NormalizedAction['kind'], payload: Record<string, unknown>, element: Record<string, unknown>): Partial<NormalizedAction> => {
	switch (kind) {
		case 'change':
			return changeDetails(payload, element);
		case 'keydown':
			return { key: asString(payload.key) || 'Enter' };
		case 'drag':
			return { targetLocator: withFrame(payload, pickTargetLocator(payload)) };
		case 'upload':
			return { files: Array.isArray(payload.files) ? payload.files.filter((f): f is string => typeof f === 'string') : [] };
		default:
			return {};
	}
};

const normalize = (event: IAiInputEvent): NormalizedAction | null => {
	const payload = event.payload;
	if (isInternalEvent(payload)) return null;
	const rawAction = asString(payload.action) || asString(payload.type) || (event.type === 'navigation' ? 'navigation' : '');
	const kind = ACTION_KINDS[rawAction.toLowerCase()];
	if (!kind) return null;
	const element = asRecord(payload.element);
	const base = { ...baseOf(event, element), kind };

	if (kind === 'navigation') {
		const url = asString(payload.url) || event.url || '';
		return url ? { ...base, url } : null;
	}
	return { ...base, ...kindDetails(kind, payload, element) };
};

const isToggle = (a: NormalizedAction): boolean => a.tag === 'input' && (a.inputType === 'checkbox' || a.inputType === 'radio');
const isSelect = (a: NormalizedAction): boolean => a.tag === 'select';

/** Menyusun langkah dari aksi ternormalisasi; satu method per jenis aksi. */
class StepBuilder {
	readonly steps: CodegenStep[] = [];
	private readonly secretByLocator = new Map<string, string>();
	/** Aksi terakhir yang bisa memicu navigasi (click, Enter, toggle/select). */
	private lastTrigger: NormalizedAction | null = null;
	/** Nilai fill terakhir per locator: `change` teks yang hanya meng-commit nilai ini bukan aksi baru. */
	private readonly lastFillValue = new Map<string, string | undefined>();

	add(action: NormalizedAction): void {
		if (action.kind === 'navigation') return this.navigation(action);
		if (!action.locator) return;
		// Rekaman lama: event input checkbox/radio (value "on") bukan ketikan; toggle dicatat dari click + change.
		if (action.kind === 'input') return isToggle(action) ? undefined : this.input(action);
		if (action.kind === 'change') return this.change(action);
		if (action.kind === 'click') {
			this.push({ action: 'click', locator: action.locator, ambiguous: action.ambiguous, sequences: [action.sequence] });
			this.lastTrigger = action;
			return;
		}
		if (action.kind === 'keydown') {
			this.push({ action: 'press', locator: action.locator, value: action.key ?? 'Enter', ambiguous: action.ambiguous, sequences: [action.sequence] });
			if (action.key === 'Enter') this.lastTrigger = action;
			return;
		}
		this.pointerAction(action);
	}

	/** dblclick, klik kanan, hover, drag, upload. */
	private pointerAction(action: NormalizedAction): void {
		const sequences = [action.sequence];
		const common = { locator: action.locator, ambiguous: action.ambiguous, sequences };
		if (action.kind === 'dblclick') return this.dblclick(action);
		if (action.kind === 'rightclick') this.push({ action: 'rightclick', ...common });
		else if (action.kind === 'hover') this.push({ action: 'hover', ...common });
		else if (action.kind === 'drag' && action.targetLocator) this.push({ action: 'dragTo', targetLocator: action.targetLocator, ...common });
		else if (action.kind === 'upload') this.push({ action: 'setInputFiles', files: action.files ?? [], ...common });
		else return;
		this.lastTrigger = action;
	}

	/** Klik pertama dari double-click sudah tercatat sebagai click: gabungkan menjadi satu dblclick. */
	private dblclick(action: NormalizedAction): void {
		const prev = this.last();
		const lastTime = this.lastTrigger?.timeMs ?? null;
		const merges =
			prev?.action === 'click' &&
			prev.locator === action.locator &&
			(action.timeMs === null || lastTime === null || action.timeMs - lastTime <= DBLCLICK_MERGE_MS);
		if (prev && merges) {
			prev.action = 'dblclick';
			prev.sequences.push(action.sequence);
		} else {
			this.push({ action: 'dblclick', locator: action.locator, ambiguous: action.ambiguous, sequences: [action.sequence] });
		}
		this.lastTrigger = action;
	}

	private push(step: Omit<CodegenStep, 'no' | 'comments'>): CodegenStep {
		const full: CodegenStep = { ...step, no: this.steps.length + 1, comments: [] };
		this.steps.push(full);
		return full;
	}

	private last(): CodegenStep | undefined {
		return this.steps[this.steps.length - 1];
	}

	private secretFor(locator: string): string {
		let name = this.secretByLocator.get(locator);
		if (!name) {
			name = `QA_SECRET_${this.secretByLocator.size + 1}`;
			this.secretByLocator.set(locator, name);
		}
		return name;
	}

	private followsTrigger(action: NormalizedAction): boolean {
		const trigger = this.lastTrigger;
		if (!trigger || action.timeMs === null || trigger.timeMs === null) return false;
		return action.timeMs - trigger.timeMs <= NAVIGATION_FOLLOW_MS;
	}

	private navigation(action: NormalizedAction): void {
		const url = action.url ?? '';
		const prev = this.last();
		const sequences = [action.sequence];
		if (!prev) {
			this.push({ action: 'goto', locator: '', value: url, ambiguous: false, sequences });
		} else if ((prev.action === 'waitForURL' || prev.action === 'goto') && prev.value === url) {
			prev.sequences.push(action.sequence);
		} else if (prev.action === 'waitForURL' && this.followsTrigger(action)) {
			// Redirect beruntun: tunggu URL akhir saja.
			prev.value = url;
			prev.sequences.push(action.sequence);
		} else {
			this.push({ action: this.followsTrigger(action) ? 'waitForURL' : 'goto', locator: '', value: url, ambiguous: false, sequences });
		}
	}

	private fillValue(action: NormalizedAction): { value?: string; secretEnv?: string } {
		this.lastFillValue.set(action.locator, action.redacted ? undefined : action.value ?? '');
		return action.redacted ? { secretEnv: this.secretFor(action.locator) } : { value: action.value ?? '' };
	}

	private input(action: NormalizedAction): void {
		const prev = this.last();
		const { value, secretEnv } = this.fillValue(action);
		if (prev && prev.action === 'fill' && prev.locator === action.locator) {
			prev.value = value;
			prev.secretEnv = secretEnv;
			prev.sequences.push(action.sequence);
			return;
		}
		this.push({ action: 'fill', locator: action.locator, value, secretEnv, ambiguous: action.ambiguous, sequences: [action.sequence] });
	}

	private change(action: NormalizedAction): void {
		if (isToggle(action)) return this.toggle(action);
		if (isSelect(action)) return this.select(action);
		// Teks: change yang meng-commit nilai fill terakhir (mis. blur/Enter) tidak menambah langkah.
		const committed =
			this.lastFillValue.has(action.locator) && (action.redacted || this.lastFillValue.get(action.locator) === (action.value ?? ''));
		if (committed) {
			const owner = [...this.steps].reverse().find((step) => step.action === 'fill' && step.locator === action.locator);
			owner?.sequences.push(action.sequence);
			return;
		}
		const { value, secretEnv } = this.fillValue(action);
		this.push({ action: 'fill', locator: action.locator, value, secretEnv, ambiguous: action.ambiguous, sequences: [action.sequence] });
	}

	private toggle(action: NormalizedAction): void {
		const prev = this.last();
		const verb: CodegenAction = action.checked === false ? 'uncheck' : 'check';
		if (prev && prev.locator === action.locator && prev.action === 'click') {
			prev.action = verb;
			prev.sequences.push(action.sequence);
		} else {
			this.push({ action: verb, locator: action.locator, ambiguous: action.ambiguous, sequences: [action.sequence] });
		}
		this.lastTrigger = action;
	}

	private select(action: NormalizedAction): void {
		const prev = this.last();
		const label = action.selectedText ?? action.value ?? '';
		if (prev && prev.locator === action.locator && (prev.action === 'click' || prev.action === 'selectOption')) {
			prev.action = 'selectOption';
			prev.value = label;
			prev.sequences.push(action.sequence);
		} else {
			this.push({ action: 'selectOption', locator: action.locator, value: label, ambiguous: action.ambiguous, sequences: [action.sequence] });
		}
		this.lastTrigger = action;
	}
}

const buildSteps = (actions: NormalizedAction[]): CodegenStep[] => {
	const builder = new StepBuilder();
	for (const action of actions) builder.add(action);
	return builder.steps;
};

const attachCheckpoints = (steps: CodegenStep[], checkpoints: IAiInputCheckpoint[]): string[] => {
	const trailing: string[] = [];
	for (const checkpoint of checkpoints) {
		const note = (checkpoint.note ?? '').replace(/\s+/g, ' ').trim();
		if (!note) continue;
		const line = `checkpoint: ${note}`;
		const sequence = checkpoint.sequence;
		if (sequence === null || sequence === undefined) {
			trailing.push(line);
			continue;
		}
		// Taruh setelah langkah terakhir yang terjadi sebelum/saat checkpoint dibuat.
		const owner = [...steps].reverse().find((step) => Math.min(...step.sequences) <= sequence);
		if (owner) owner.comments.push(line);
		else trailing.push(line);
	}
	return trailing;
};

const renderValue = (step: CodegenStep): string =>
	step.secretEnv ? `process.env.${step.secretEnv} ?? ''` : quoteJs(step.value ?? '');

const STEP_RENDERERS: Record<CodegenAction, (step: CodegenStep, target: string) => string> = {
	goto: (step) => `await page.goto(${quoteJs(step.value ?? '')});`,
	waitForURL: (step) => `await page.waitForURL(${quoteJs(step.value ?? '')});`,
	fill: (step, target) => `await ${target}.fill(${renderValue(step)});`,
	press: (step, target) => `await ${target}.press(${quoteJs(step.value ?? 'Enter')});`,
	check: (_step, target) => `await ${target}.check();`,
	uncheck: (_step, target) => `await ${target}.uncheck();`,
	selectOption: (step, target) => `await ${target}.selectOption({ label: ${quoteJs(step.value ?? '')} });`,
	click: (_step, target) => `await ${target}.click();`,
	dblclick: (_step, target) => `await ${target}.dblclick();`,
	rightclick: (_step, target) => `await ${target}.click({ button: 'right' });`,
	hover: (_step, target) => `await ${target}.hover();`,
	dragTo: (step, target) => `await ${target}.dragTo(page.${step.targetLocator ?? ''});`,
	setInputFiles: (step, target) => `await ${target}.setInputFiles([${(step.files ?? []).map((name) => quoteJs(`fixtures/${name}`)).join(', ')}]);`
};

export const renderStep = (step: CodegenStep): string => STEP_RENDERERS[step.action](step, `page.${step.locator}`);

const commentLine = (text: string): string => `\t// ${text.replace(/\r?\n/g, ' ')}`;

export const renderScript = (
	session: CodegenInput['session'],
	steps: CodegenStep[],
	trailingComments: string[] = [],
	leadingComments: string[] = []
): string => {
	const title = [session.test_case_no, session.title].filter((part) => part && String(part).trim()).join(' ') || 'Rekaman tester';
	const lines: string[] = ["import { test, expect } from '@playwright/test';", '', `test(${quoteJs(title)}, async ({ page }) => {`];

	const secrets = [...new Set(steps.map((step) => step.secretEnv).filter((name): name is string => Boolean(name)))];
	if (secrets.length > 0) lines.push(commentLine(`Nilai sensitif diambil dari env: ${secrets.join(', ')}`));
	for (const comment of leadingComments) lines.push(commentLine(comment));

	for (const step of steps) {
		if (step.ambiguous) lines.push(commentLine('⚠ locator tidak unik saat direkam'));
		lines.push(`\t${renderStep(step)}`);
		if (step.action === 'setInputFiles' && step.files?.length) lines.push(commentLine(`sediakan file uji di fixtures/: ${step.files.join(', ')}`));
		for (const comment of step.comments) lines.push(commentLine(comment));
	}
	for (const comment of trailingComments) lines.push(commentLine(comment));

	const lastUrl = [...steps].reverse().find((step) => step.action === 'goto' || step.action === 'waitForURL')?.value;
	if (lastUrl) lines.push(`\tawait expect(page).toHaveURL(${quoteJs(lastUrl)});`);

	lines.push('});', '');
	return lines.join('\n');
};

/** URL API backend bukan halaman yang bisa dibuka tester. */
const looksLikeApiUrl = (url: string): boolean => /\/\/api[-.]|\/api\//i.test(url);

/**
 * Rekaman yang dimulai di halaman yang sudah terbuka tidak punya event navigasi:
 * pakai URL halaman aksi pertama, lalu target_url sesi (selama bukan URL API).
 * Mengembalikan komentar peringatan bila tidak ada URL awal yang valid.
 */
const prependStartUrl = (steps: CodegenStep[], actions: NormalizedAction[], targetUrl?: string | null): string | null => {
	const fromAction = actions.find((action) => action.pageUrl)?.pageUrl;
	const candidate = fromAction ?? (targetUrl && !looksLikeApiUrl(targetUrl) ? targetUrl : undefined);
	if (!candidate) return '⚠ URL awal tidak terekam — tambahkan langkah navigasi awal secara manual';
	steps.unshift({ no: 0, action: 'goto', locator: '', value: candidate, ambiguous: false, sequences: [], comments: [] });
	steps.forEach((step, index) => (step.no = index + 1));
	return null;
};

export const generatePlaywrightScript = (input: CodegenInput): CodegenResult => {
	const actions = input.events
		.filter((event) => event.type === 'action' || event.type === 'navigation')
		.slice()
		.sort((a, b) => a.sequence - b.sequence)
		.map(normalize)
		.filter((action): action is NormalizedAction => action !== null);

	const steps = buildSteps(actions);
	const warning = steps[0]?.action !== 'goto' ? prependStartUrl(steps, actions, input.session.target_url) : null;
	const trailing = attachCheckpoints(steps, input.checkpoints);
	return { script: renderScript(input.session, steps, trailing, warning ? [warning] : []), steps };
};

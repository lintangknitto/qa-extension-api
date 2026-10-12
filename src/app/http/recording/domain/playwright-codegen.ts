import type { IAiInputCheckpoint, IAiInputEvent } from './ai-input';
import { isSafeLocator } from './locator-safety';
import { urlPattern, urlRegexLiteral } from './url-pattern';

const NAVIGATION_ACTIONS: string[] = ['goto', 'waitForURL', 'reload', 'goBack', 'goForward'];

/** Komentar header yang dibaca replay extension untuk menskalakan klik koordinat. */
export const VIEWPORT_COMMENT_PREFIX = 'Viewport rekaman:';

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
/** v2: scroll, jenis navigasi, klik koordinat, shortcut, multi-tab, assertion checkpoint, ringkasan header. */
export const CODEGEN_VERSION = 'codegen-v2';

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
	| 'setInputFiles'
	| 'mouseWheel'
	| 'scrollTo'
	| 'reload'
	| 'goBack'
	| 'goForward'
	/** Klik koordinat untuk aksi tanpa locator (`value: 'right'` untuk klik kanan). */
	| 'mouseClick'
	| 'mouseDblclick'
	/** Tombol tanpa elemen fokus: `page.keyboard.press(...)`. */
	| 'keyboardPress'
	/** Tab baru tanpa pemicu: `const pageN = await context.newPage();` (+ goto bila URL diketahui). */
	| 'newPage'
	| 'bringToFront';

/** Langkah yang bisa membuka popup (dibungkus `Promise.all([page.waitForEvent('popup'), ...])`). */
const POPUP_TRIGGER_ACTIONS: CodegenAction[] = ['click', 'dblclick', 'rightclick', 'mouseClick', 'mouseDblclick', 'press', 'keyboardPress', 'check', 'selectOption'];
/** Tab baru dianggap popup dari aksi terakhir bila muncul dalam rentang ini. */
export const POPUP_FOLLOW_MS = 3000;

/** Scroll yang diikuti aksi pada elemen di container yang sama dalam rentang ini dilewati (auto-scroll Playwright). */
export const SCROLL_FOLLOW_MS = 2000;
const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Space'];

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
	/** Nama file untuk `setInputFiles` (isi file tersimpan sebagai artifact `test_data_file` bila memungkinkan). */
	files?: string[];
	/** URL persis hasil rekaman untuk langkah navigasi (`value` waitForURL bisa berupa pola glob). */
	url?: string;
	/** Koordinat: delta untuk `mouseWheel`, posisi akhir untuk `scrollTo`. */
	x?: number;
	y?: number;
	/** Ukuran viewport saat rekam untuk klik koordinat. */
	viewport?: { w: number; h: number };
	ambiguous: boolean;
	/** Sequence event sumber (untuk korelasi dengan rekaman). */
	sequences: number[];
	comments: string[];
	/** Komentar sebelum baris langkah (event yang dilewati tepat sebelumnya). */
	preComments?: string[];
	/** Komentar di akhir baris langkah yang sama. */
	inlineComment?: string;
	/** Variabel page tab tempat langkah dijalankan (`page`, `page2`, …). */
	pageVar?: string;
	/** Langkah ini membuka tab baru: hasil popup disimpan ke variabel ini. */
	popupVar?: string;
	/** Assertion dari checkpoint yang dibuat setelah langkah ini (baris kode lengkap). */
	assertions?: string[];
}

/** Event aksi yang tidak menjadi langkah sendiri (dilewati atau digabung), untuk ringkasan header. */
export interface CodegenNote {
	reason: string;
	sequences: number[];
}

export interface CodegenResult {
	script: string;
	steps: CodegenStep[];
	notes: CodegenNote[];
	/** Komentar header (ringkasan + peringatan) dan penutup, dipakai ulang saat script di-patch AI. */
	leadingComments: string[];
	trailingComments: string[];
}

export interface CodegenInput {
	session: { test_case_no?: string | null; title?: string | null; target_url?: string | null };
	events: IAiInputEvent[];
	checkpoints: IAiInputCheckpoint[];
	/** File test data tersimpan (artifact `test_data_file`) untuk komentar sumber langkah upload. */
	testDataFiles?: Array<{ file_name: string; id_artifact: number }>;
}

/** Folder file uji relatif terhadap spec yang diunduh. */
export const TEST_DATA_DIR = 'test-data';

interface NormalizedAction {
	kind: 'navigation' | 'click' | 'dblclick' | 'rightclick' | 'hover' | 'drag' | 'upload' | 'input' | 'change' | 'keydown' | 'scroll' | 'tab' | 'unsupported';
	/** `tab_id` event (null untuk rekaman lama). */
	tabId: number | null;
	/** Event `tab`: pembukaan tab baru atau perpindahan tab. */
	tab?: { kind: string; tabId: number | null; openerTabId: number | null; fromTabId: number | null; toTabId: number | null; url: string };
	/** Nama aksi asli untuk event yang tidak bisa dipetakan. */
	rawAction?: string;
	/** Koordinat klik relatif viewport + ukuran viewport saat rekam. */
	point?: { x: number; y: number; w: number; h: number };
	sequence: number;
	timeMs: number | null;
	locator: string;
	/** Prefix iframe (`<iframe>.contentFrame().`), kosong untuk main frame. */
	frame: string;
	cssPath: string;
	scroll?: { x: number; y: number; dx: number; dy: number };
	/** `navigation_type` dari recorder; kosong untuk rekaman lama. */
	navigationType?: string;
	direction?: 'back' | 'forward';
	ambiguous: boolean;
	tag: string;
	inputType: string;
	value: string | null;
	redacted: boolean;
	checked?: boolean;
	selectedText?: string;
	key?: string;
	modifiers?: string[];
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
const frameLocators = (payload: Record<string, unknown>): string[] =>
	Array.isArray(payload.frame_locators) ? payload.frame_locators.filter((f): f is string => typeof f === 'string' && f.length > 0) : [];

/** Locator dari payload klien ditulis sebagai kode: rantai iframe hanya dipakai bila setiap levelnya lolos allowlist. */
const framesAreSafe = (payload: Record<string, unknown>): boolean => frameLocators(payload).every(isSafeLocator);

const framePrefix = (payload: Record<string, unknown>): string =>
	framesAreSafe(payload) ? frameLocators(payload).map((frame) => `${stripPagePrefix(frame)}.contentFrame().`).join('') : '';

/** Kandidat locator dari payload klien yang aman ditulis sebagai kode (lihat `locator-safety.ts`). */
const safeLocators = (...values: unknown[]): string[] =>
	values
		.flatMap((value) => (Array.isArray(value) ? value : [value]))
		.filter((l): l is string => typeof l === 'string' && l.length > 0 && isSafeLocator(l));

/** Locator terbaik: unik dari engine > kandidat pertama > selector legacy. */
const pickLocator = (payload: Record<string, unknown>): string => {
	const [best] = safeLocators(payload.unique_locator, payload.locators);
	if (best) return stripPagePrefix(best);
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
	keydown: 'keydown',
	scroll: 'scroll'
};

/** Urutan modifier di kombinasi tombol Playwright (`Control+Shift+K`). */
const MODIFIER_ORDER = ['Control', 'Meta', 'Alt', 'Shift'];

const asInt = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0);

const withFrame = (payload: Record<string, unknown>, locator: string): string =>
	locator && framesAreSafe(payload) ? `${framePrefix(payload)}${locator}` : '';

const pickTargetLocator = (payload: Record<string, unknown>): string => {
	const [best] = safeLocators(payload.target_unique_locator, payload.target_locators);
	return best ? stripPagePrefix(best) : '';
};

const baseOf = (event: IAiInputEvent, element: Record<string, unknown>) => {
	const payload = event.payload;
	return {
		sequence: event.sequence,
		timeMs: toTimeMs(event.occurredAt),
		locator: withFrame(payload, pickLocator(payload)),
		frame: framePrefix(payload),
		cssPath: asString(element.cssPath),
		// Data rekaman lama tidak punya flag `ambiguous` → anggap tidak diketahui (false).
		ambiguous: payload.ambiguous === true,
		tag: asString(element.tagName).toLowerCase(),
		inputType: asString(element.type).toLowerCase(),
		value: typeof payload.value === 'string' ? payload.value : null,
		redacted: payload.value_redacted === true,
		pageUrl: event.url || asString(payload.pageUrl) || undefined,
		tabId: typeof event.tabId === 'number' ? event.tabId : null
	};
};

const asTabId = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) ? value : null);

const normalizeTab = (event: IAiInputEvent): NormalizedAction => {
	const payload = event.payload;
	return {
		...baseOf(event, {}),
		kind: 'tab',
		tab: {
			kind: asString(payload.kind),
			tabId: asTabId(payload.tab_id) ?? asTabId(event.tabId),
			openerTabId: asTabId(payload.opener_tab_id),
			fromTabId: asTabId(payload.from_tab_id),
			toTabId: asTabId(payload.to_tab_id),
			url: asString(payload.url)
		}
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
			return {
				key: asString(payload.key) || 'Enter',
				modifiers: Array.isArray(payload.modifiers)
					? MODIFIER_ORDER.filter((m) => (payload.modifiers as unknown[]).includes(m))
					: []
			};
		case 'drag':
			return { targetLocator: withFrame(payload, pickTargetLocator(payload)) };
		case 'upload':
			return { files: Array.isArray(payload.files) ? payload.files.filter((f): f is string => typeof f === 'string') : [] };
		case 'scroll':
			return { scroll: { x: asInt(payload.scroll_x), y: asInt(payload.scroll_y), dx: asInt(payload.delta_x), dy: asInt(payload.delta_y) } };
		default:
			return {};
	}
};

const pointOf = (payload: Record<string, unknown>): NormalizedAction['point'] => {
	if (typeof payload.client_x !== 'number' || typeof payload.client_y !== 'number') return undefined;
	return { x: asInt(payload.client_x), y: asInt(payload.client_y), w: asInt(payload.viewport_w), h: asInt(payload.viewport_h) };
};

const normalize = (event: IAiInputEvent): NormalizedAction | null => {
	if (event.type === 'tab') return normalizeTab(event);
	const payload = event.payload;
	// Klik pada widget QA sendiri bukan langkah tester.
	if (isInternalEvent(payload)) return null;
	const rawAction = asString(payload.action) || asString(payload.type) || (event.type === 'navigation' ? 'navigation' : '');
	const element = asRecord(payload.element);
	const kind = ACTION_KINDS[rawAction.toLowerCase()];
	if (!kind) return { ...baseOf(event, element), kind: 'unsupported', rawAction: rawAction || '(tanpa nama)' };
	const base = { ...baseOf(event, element), kind, point: pointOf(payload) };

	if (kind === 'navigation') {
		const url = asString(payload.url) || event.url || '';
		const navigationType = asString(payload.navigation_type) || undefined;
		const direction = payload.direction === 'forward' ? 'forward' : payload.direction === 'back' ? 'back' : undefined;
		return { ...base, url, navigationType, direction };
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
	/** Event yang dilewati/digabung, untuk ringkasan header script. */
	readonly notes: CodegenNote[] = [];
	/** Komentar "Dilewati" yang ditulis tepat sebelum langkah berikutnya. */
	private readonly pendingComments: string[] = [];
	/** Tombol terakhir yang direkam: scroll akibat PageDown/panah sudah diwakili `press`. */
	private lastKey: NormalizedAction | null = null;
	/** Variabel page per `tab_id`: tab pertama `page`, tab berikutnya `page2`, `page3`, … */
	private readonly tabVars = new Map<number, string>();
	/** Variabel page dari aksi yang sedang diproses. */
	private currentVar = 'page';
	/** Tab hasil popup: navigasi pertamanya sudah berjalan, jadi ditunggu (bukan goto). */
	private readonly popupVars = new Set<string>();

	get tabVarMap(): ReadonlyMap<number, string> {
		return this.tabVars;
	}

	/** `page` sudah dipakai tab pertama (tab_id-nya bisa belum diketahui). */
	private pageClaimed = false;
	private varCount = 1;

	private claimPage(tabId: number): void {
		this.tabVars.set(tabId, 'page');
		this.pageClaimed = true;
	}

	private newVar(tabId: number): string {
		this.varCount += 1;
		const name = `page${this.varCount}`;
		this.tabVars.set(tabId, name);
		return name;
	}

	/** Variabel page untuk tab; tab tak dikenal tanpa event `opened` dibuat lewat `context.newPage()`. */
	private varFor(tabId: number | null, sequence: number): string {
		// Rekaman lama tanpa tab_id: semua di `page`.
		if (tabId === null) return this.pageClaimed ? this.currentVar : 'page';
		const known = this.tabVars.get(tabId);
		if (known) return known;
		if (!this.pageClaimed) {
			this.claimPage(tabId);
			return 'page';
		}
		const name = this.newVar(tabId);
		this.push({ action: 'newPage', locator: '', pageVar: name, ambiguous: false, sequences: [] });
		this.note('tab tanpa event pembukaan dibuat lewat context.newPage()', sequence);
		return name;
	}

	/**
	 * Event `tab`: `opened` membuat variabel page baru (popup dari aksi → `waitForEvent('popup')`,
	 * tanpa pemicu → `context.newPage()`), `switch` → `bringToFront()`.
	 */
	private tabEvent(action: NormalizedAction): void {
		const tab = action.tab;
		if (!tab) return this.skip(action, 'event tab tanpa data');
		if (tab.kind === 'switch') return this.tabSwitch(action, tab);
		if (tab.kind !== 'opened' || tab.tabId === null) return this.skip(action, `event tab "${tab.kind}" belum didukung codegen`);
		this.tabOpened(action, { ...tab, tabId: tab.tabId });
	}

	private tabSwitch(action: NormalizedAction, tab: NonNullable<NormalizedAction['tab']>): void {
		if (tab.fromTabId !== null && !this.pageClaimed) this.claimPage(tab.fromTabId);
		if (tab.toTabId === null) return this.skip(action, 'pindah tab tanpa tab tujuan');
		const known = this.tabVars.has(tab.toTabId);
		const name = this.varFor(tab.toTabId, action.sequence);
		const previous = this.steps[this.steps.length - 1];
		this.currentVar = name;
		// Tab yang baru dibuka otomatis aktif: tidak perlu bringToFront.
		const justOpened = !known || previous?.popupVar === name || (previous?.action === 'newPage' && previous.pageVar === name);
		if (justOpened) return this.note('pindah ke tab yang baru dibuka (otomatis aktif)', action.sequence);
		this.push({ action: 'bringToFront', locator: '', ambiguous: false, sequences: [action.sequence] });
	}

	private tabOpened(action: NormalizedAction, tab: NonNullable<NormalizedAction['tab']> & { tabId: number }): void {
		if (this.tabVars.has(tab.tabId)) return this.note('event pembukaan tab duplikat', action.sequence);
		// Tanpa pembuka yang diketahui, `page` tetap disimpan untuk tab pertama yang beraksi.
		if (tab.openerTabId !== null && !this.pageClaimed) this.claimPage(tab.openerTabId);
		const name = this.newVar(tab.tabId);
		const openerVar = tab.openerTabId !== null ? this.tabVars.get(tab.openerTabId) : undefined;
		const trigger = openerVar ? this.popupTrigger(openerVar, action) : undefined;
		if (trigger) {
			trigger.popupVar = name;
			trigger.sequences.push(action.sequence);
			this.popupVars.add(name);
			return;
		}
		this.push({ action: 'newPage', locator: '', pageVar: name, value: tab.url || undefined, url: tab.url || undefined, ambiguous: false, sequences: [action.sequence] });
	}

	/** Langkah terakhir di tab pembuka yang bisa membuka popup, bila terjadi sesaat sebelum tab baru muncul. */
	private popupTrigger(openerVar: string, opened: NormalizedAction): CodegenStep | undefined {
		const step = [...this.steps].reverse().find((s) => s.pageVar === openerVar);
		if (!step || step.popupVar || !POPUP_TRIGGER_ACTIONS.includes(step.action)) return undefined;
		const trigger = this.lastTrigger;
		if (trigger && opened.timeMs !== null && trigger.timeMs !== null && opened.timeMs - trigger.timeMs > POPUP_FOLLOW_MS) return undefined;
		return step;
	}

	/** `next` = aksi berikutnya (lookahead) untuk memutuskan apakah scroll bermakna. */
	add(action: NormalizedAction, next?: NormalizedAction): void {
		if (action.kind === 'tab') return this.tabEvent(action);
		this.currentVar = this.varFor(action.tabId, action.sequence);
		if (action.kind === 'unsupported') return this.skip(action, `aksi "${action.rawAction}" belum didukung codegen`);
		if (action.kind === 'navigation') return action.url ? this.navigation(action) : this.skip(action, 'navigasi tanpa URL');
		if (action.kind === 'scroll') return this.scroll(action, next);
		if (action.kind === 'keydown') return this.keydown(action);
		if (!action.locator) return this.withoutLocator(action);
		// Rekaman lama: event input checkbox/radio (value "on") bukan ketikan; toggle dicatat dari click + change.
		if (action.kind === 'input') return isToggle(action) ? this.note('input checkbox/radio diwakili check()', action.sequence) : this.input(action);
		if (action.kind === 'change') return this.change(action);
		if (action.kind === 'click') {
			this.push({ action: 'click', locator: action.locator, ambiguous: action.ambiguous, sequences: [action.sequence] });
			this.lastTrigger = action;
			return;
		}
		this.pointerAction(action);
	}

	/** Tombol/shortcut → `press('Control+Enter')`; tanpa elemen fokus (body) → `page.keyboard.press`. */
	private keydown(action: NormalizedAction): void {
		const combo = [...(action.modifiers ?? []), action.key ?? 'Enter'].join('+');
		const sequences = [action.sequence];
		if (action.locator) this.push({ action: 'press', locator: action.locator, value: combo, ambiguous: action.ambiguous, sequences });
		else if (action.frame) return this.skip(action, `tombol ${combo} tanpa elemen fokus di dalam iframe`);
		else this.push({ action: 'keyboardPress', locator: '', value: combo, ambiguous: false, sequences });
		this.lastKey = action;
		if (action.key === 'Enter') this.lastTrigger = action;
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
		else return this.skip(action, action.kind === 'drag' ? 'drag tanpa locator tujuan' : `aksi ${action.kind} tidak dikenali`);
		this.lastTrigger = action;
	}

	/**
	 * Aksi tanpa locator: klik/dblclick/klik kanan → klik koordinat + TODO (replay tetap jalan di viewport sama);
	 * selain itu dilewati dengan komentar. Koordinat di dalam iframe relatif ke iframe, jadi tidak dipakai.
	 */
	private withoutLocator(action: NormalizedAction): void {
		const pointer = action.kind === 'click' || action.kind === 'dblclick' || action.kind === 'rightclick';
		if (!pointer) return this.skip(action, `${action.kind} tanpa locator`);
		if (action.frame) return this.skip(action, `${action.kind} tanpa locator di dalam iframe`);
		if (!action.point) return this.skip(action, `${action.kind} tanpa locator dan tanpa koordinat (rekaman lama)`);
		const prev = this.last();
		const { x, y } = action.point;
		if (action.kind === 'dblclick' && prev?.action === 'mouseClick' && prev.x === x && prev.y === y) {
			prev.action = 'mouseDblclick';
			prev.sequences.push(action.sequence);
			this.note('klik pertama double-click digabung', action.sequence);
		} else {
			this.pushPointClick(action, action.point);
		}
		this.lastTrigger = action;
	}

	private pushPointClick(action: NormalizedAction, point: NonNullable<NormalizedAction['point']>): void {
		const { x, y, w, h } = point;
		const verb: CodegenAction = action.kind === 'dblclick' ? 'mouseDblclick' : 'mouseClick';
		const viewport = w > 0 && h > 0 ? { w, h } : undefined;
		const step = this.push({ action: verb, locator: '', x, y, viewport, ambiguous: false, sequences: [action.sequence] });
		if (action.kind === 'rightclick') step.value = 'right';
		step.inlineComment = `TODO: locator tidak stabil (${action.tag || 'elemen'})`;
	}

	/** Event yang tidak menjadi langkah: dicatat di header dan sebagai komentar di posisinya. */
	private skip(action: NormalizedAction, reason: string): void {
		this.note(`dilewati: ${reason}`, action.sequence);
		this.pendingComments.push(`Dilewati: ${reason} (event #${action.sequence})`);
	}

	/** Komentar "Dilewati" yang belum menempel ke langkah (event di akhir rekaman). */
	takePendingComments(): string[] {
		return this.pendingComments.splice(0);
	}

	note(reason: string, sequence: number): void {
		const existing = this.notes.find((note) => note.reason === reason);
		if (existing) existing.sequences.push(sequence);
		else this.notes.push({ reason, sequences: [sequence] });
	}

	/**
	 * Scroll window → `mouse.wheel(dx, dy)`; container (atau dokumen iframe) → `scrollTo(x, y)`.
	 * Dilewati bila ≤ SCROLL_FOLLOW_MS diikuti aksi pada elemen di container yang sama; beruntun digabung.
	 */
	private scroll(action: NormalizedAction, next?: NormalizedAction): void {
		const scroll = action.scroll ?? { x: 0, y: 0, dx: 0, dy: 0 };
		if (scrollLeadsTo(action, next)) return this.note('scroll diwakili auto-scroll Playwright', action.sequence);
		if (this.scrollFromKey(action)) return this.note('scroll diwakili tombol keyboard yang direkam', action.sequence);
		const isWindow = !action.locator;
		const prev = this.last();
		if (isWindow && !action.frame) {
			if (prev?.action === 'mouseWheel') {
				prev.x = (prev.x ?? 0) + scroll.dx;
				prev.y = (prev.y ?? 0) + scroll.dy;
				prev.sequences.push(action.sequence);
				return this.note('scroll beruntun digabung', action.sequence);
			}
			this.push({ action: 'mouseWheel', locator: '', x: scroll.dx, y: scroll.dy, ambiguous: false, sequences: [action.sequence] });
			return;
		}
		const locator = isWindow ? `${action.frame}locator('html')` : action.locator;
		if (prev?.action === 'scrollTo' && prev.locator === locator) {
			prev.x = scroll.x;
			prev.y = scroll.y;
			prev.sequences.push(action.sequence);
			return this.note('scroll beruntun digabung', action.sequence);
		}
		this.push({ action: 'scrollTo', locator, x: scroll.x, y: scroll.y, ambiguous: action.ambiguous, sequences: [action.sequence] });
	}

	private scrollFromKey(action: NormalizedAction): boolean {
		const key = this.lastKey;
		if (!key || !SCROLL_KEYS.includes(key.key ?? '') || (key.modifiers ?? []).length > 0) return false;
		if (key.frame !== action.frame || key.timeMs === null || action.timeMs === null) return false;
		return action.timeMs - key.timeMs <= SCROLL_FOLLOW_MS && this.last()?.sequences.includes(key.sequence) === true;
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
			this.note('klik pertama double-click digabung', action.sequence);
		} else {
			this.push({ action: 'dblclick', locator: action.locator, ambiguous: action.ambiguous, sequences: [action.sequence] });
		}
		this.lastTrigger = action;
	}

	private push(step: Omit<CodegenStep, 'no' | 'comments'>): CodegenStep {
		const full: CodegenStep = { pageVar: this.currentVar, ...step, no: this.steps.length + 1, comments: [] };
		if (this.pendingComments.length > 0) full.preComments = this.pendingComments.splice(0);
		this.steps.push(full);
		return full;
	}

	/** Langkah terakhir, hanya bila berada di tab yang sama (penggabungan tidak boleh lintas tab). */
	private last(): CodegenStep | undefined {
		const step = this.steps[this.steps.length - 1];
		return step && step.pageVar === this.currentVar ? step : undefined;
	}

	private lastOnTab(): CodegenStep | undefined {
		return [...this.steps].reverse().find((step) => step.pageVar === this.currentVar && step.action !== 'bringToFront');
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
		const prev = this.lastOnTab();
		const sequences = [action.sequence];
		const type = action.navigationType;
		if (!prev) return this.firstNavigation(action);
		if (prev.action === 'newPage' && prev.url === url) {
			prev.sequences.push(action.sequence);
			return this.note('navigasi ke URL yang sama digabung', action.sequence);
		}
		// Rekaman lama tanpa navigation_type: aturan lama (URL persis, gabung ke URL yang sama).
		if (!type) return this.legacyNavigation(action, prev);
		if (type === 'reload' || type === 'back_forward') {
			const verb: CodegenAction = type === 'reload' ? 'reload' : action.direction === 'forward' ? 'goForward' : 'goBack';
			this.push({ action: verb, locator: '', url, ambiguous: false, sequences });
			return;
		}
		this.typedNavigation(action, prev);
	}

	/** Navigasi pertama di tab: goto URL persis, kecuali tab popup yang sudah memuat URL-nya sendiri (cukup ditunggu). */
	private firstNavigation(action: NormalizedAction): void {
		const url = action.url ?? '';
		const sequences = [action.sequence];
		const popup = this.popupVars.has(this.currentVar);
		this.popupVars.delete(this.currentVar);
		if (popup) this.push({ action: 'waitForURL', locator: '', value: urlPattern(url), url, ambiguous: false, sequences });
		else this.push({ action: 'goto', locator: '', value: url, url, ambiguous: false, sequences });
	}

	/** link/same_document/sesaat setelah pemicu → `waitForURL(pola)`; typed/other → `goto(URL persis)`. */
	private typedNavigation(action: NormalizedAction, prev: CodegenStep): void {
		const url = action.url ?? '';
		const sequences = [action.sequence];
		const type = action.navigationType;
		const awaited = type === 'link' || type === 'same_document' || this.followsTrigger(action);
		if (prev.url === url && (prev.action === 'goto' || prev.action === 'waitForURL')) {
			prev.sequences.push(action.sequence);
			return this.note('navigasi ke URL yang sama digabung', action.sequence);
		}
		if (awaited && prev.action === 'waitForURL' && this.followsTrigger(action)) {
			// Redirect beruntun: tunggu URL akhir saja.
			prev.value = urlPattern(url);
			prev.url = url;
			prev.sequences.push(action.sequence);
			return this.note('redirect beruntun digabung ke URL akhir', action.sequence);
		}
		if (awaited) this.push({ action: 'waitForURL', locator: '', value: urlPattern(url), url, ambiguous: false, sequences });
		else this.push({ action: 'goto', locator: '', value: url, url, ambiguous: false, sequences });
	}

	private legacyNavigation(action: NormalizedAction, prev: CodegenStep): void {
		const url = action.url ?? '';
		if ((prev.action === 'waitForURL' || prev.action === 'goto') && prev.value === url) {
			prev.sequences.push(action.sequence);
			this.note('navigasi ke URL yang sama digabung', action.sequence);
		} else if (prev.action === 'waitForURL' && this.followsTrigger(action)) {
			prev.value = url;
			prev.url = url;
			prev.sequences.push(action.sequence);
			this.note('redirect beruntun digabung ke URL akhir', action.sequence);
		} else {
			this.push({ action: this.followsTrigger(action) ? 'waitForURL' : 'goto', locator: '', value: url, url, ambiguous: false, sequences: [action.sequence] });
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
			return this.note('input beruntun digabung ke satu fill', action.sequence);
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
			return this.note('change duplikat (nilai sama dengan fill)', action.sequence);
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
			this.note('click + change digabung ke check()/uncheck()', action.sequence);
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
			this.note('click + change digabung ke selectOption()', action.sequence);
		} else {
			this.push({ action: 'selectOption', locator: action.locator, value: label, ambiguous: action.ambiguous, sequences: [action.sequence] });
		}
		this.lastTrigger = action;
	}
}

/**
 * Scroll diikuti aksi pada elemen di container yang sama (≤ SCROLL_FOLLOW_MS) → auto-scroll Playwright cukup.
 * Window: elemen apa pun di frame yang sama. Container: cssPath elemen berada di bawah cssPath container.
 */
const scrollLeadsTo = (scroll: NormalizedAction, next?: NormalizedAction): boolean => {
	if (!next || next.kind === 'navigation' || next.kind === 'scroll' || !next.locator) return false;
	if (scroll.timeMs === null || next.timeMs === null || next.timeMs - scroll.timeMs > SCROLL_FOLLOW_MS) return false;
	if (next.frame !== scroll.frame) return false;
	if (!scroll.locator) return true;
	return Boolean(scroll.cssPath && next.cssPath.startsWith(`${scroll.cssPath} > `));
};

const buildSteps = (
	actions: NormalizedAction[]
): { steps: CodegenStep[]; notes: CodegenNote[]; trailing: string[]; tabVars: ReadonlyMap<number, string> } => {
	const builder = new StepBuilder();
	actions.forEach((action, index) => builder.add(action, actions[index + 1]));
	return { steps: builder.steps, notes: builder.notes, trailing: builder.takePendingComments(), tabVars: builder.tabVarMap };
};

/** `target_locators` dari kolom JSONB (array) atau string JSON lama. */
const checkpointLocators = (value: unknown): string[] => {
	let parsed = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value);
		} catch {
			return [];
		}
	}
	return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
};

/**
 * Assertion checkpoint: elemen pilihan tester → `toContainText(teks)` (atau `toBeVisible()` tanpa teks),
 * URL halaman → `toHaveURL(pola)` dengan ID dinamis diganti wildcard.
 */
const checkpointAssertions = (checkpoint: IAiInputCheckpoint, pageVar: string): string[] => {
	const lines: string[] = [];
	// Locator dari klien ditulis sebagai kode: hanya pakai yang lolos allowlist bentuk.
	const locator = checkpointLocators(checkpoint.target_locators).find(isSafeLocator);
	const text = (checkpoint.target_text ?? '').replace(/\s+/g, ' ').trim();
	if (locator) {
		const target = `${pageVar}.${stripPagePrefix(locator)}`;
		// Teks teredaksi tidak cocok dengan halaman asli: cukup pastikan elemen tampil.
		lines.push(text && !text.includes('[REDACTED]') ? `await expect(${target}).toContainText(${quoteJs(text)});` : `await expect(${target}).toBeVisible();`);
	}
	if (checkpoint.page_url) lines.push(`await expect(${pageVar}).toHaveURL(${urlRegexLiteral(checkpoint.page_url)});`);
	return lines;
};

const attachCheckpoints = (steps: CodegenStep[], checkpoints: IAiInputCheckpoint[], tabVars: ReadonlyMap<number, string>): string[] => {
	const trailing: string[] = [];
	const firstSequence = (step: CodegenStep, index: number): number =>
		// goto awal hasil prependStartUrl tidak punya event sumber: dianggap paling awal.
		step.sequences.length > 0 ? Math.min(...step.sequences) : index === 0 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
	for (const checkpoint of checkpoints) {
		const note = (checkpoint.note ?? '').replace(/\s+/g, ' ').trim();
		const sequence = checkpoint.sequence;
		// Taruh setelah langkah terakhir yang terjadi sebelum/saat checkpoint dibuat; tanpa sequence → akhir script.
		const ownerIndex =
			sequence === null || sequence === undefined
				? steps.length - 1
				: steps.map((step, index) => firstSequence(step, index) <= sequence).lastIndexOf(true);
		const owner = ownerIndex >= 0 ? steps[ownerIndex] : undefined;
		if (!owner) {
			if (note) trailing.push(`checkpoint: ${note}`);
			continue;
		}
		const tabVar = typeof checkpoint.tab_id === 'number' ? tabVars.get(checkpoint.tab_id) : undefined;
		if (note) owner.comments.push(`checkpoint: ${note}`);
		owner.assertions = [...(owner.assertions ?? []), ...checkpointAssertions(checkpoint, tabVar ?? owner.pageVar ?? 'page')];
	}
	return trailing;
};

const renderValue = (step: CodegenStep): string =>
	step.secretEnv ? `process.env.${step.secretEnv} ?? ''` : quoteJs(step.value ?? '');

/** `target` = `<page>.<locator>`, `p` = variabel page tab langkah. */
const STEP_RENDERERS: Record<CodegenAction, (step: CodegenStep, target: string, p: string) => string> = {
	goto: (step, _t, p) => `await ${p}.goto(${quoteJs(step.value ?? '')});`,
	waitForURL: (step, _t, p) => `await ${p}.waitForURL(${quoteJs(step.value ?? '')});`,
	fill: (step, target) => `await ${target}.fill(${renderValue(step)});`,
	press: (step, target) => `await ${target}.press(${quoteJs(step.value ?? 'Enter')});`,
	check: (_step, target) => `await ${target}.check();`,
	uncheck: (_step, target) => `await ${target}.uncheck();`,
	selectOption: (step, target) => `await ${target}.selectOption({ label: ${quoteJs(step.value ?? '')} });`,
	click: (_step, target) => `await ${target}.click();`,
	dblclick: (_step, target) => `await ${target}.dblclick();`,
	rightclick: (_step, target) => `await ${target}.click({ button: 'right' });`,
	hover: (_step, target) => `await ${target}.hover();`,
	dragTo: (step, target, p) => `await ${target}.dragTo(${p}.${step.targetLocator ?? ''});`,
	setInputFiles: (step, target) => `await ${target}.setInputFiles([${(step.files ?? []).map((name) => quoteJs(`${TEST_DATA_DIR}/${name}`)).join(', ')}]);`,
	reload: (_s, _t, p) => `await ${p}.reload();`,
	goBack: (_s, _t, p) => `await ${p}.goBack();`,
	goForward: (_s, _t, p) => `await ${p}.goForward();`,
	mouseClick: (step, _t, p) => `await ${p}.mouse.click(${step.x ?? 0}, ${step.y ?? 0}${step.value === 'right' ? ", { button: 'right' }" : ''});`,
	mouseDblclick: (step, _t, p) => `await ${p}.mouse.dblclick(${step.x ?? 0}, ${step.y ?? 0});`,
	keyboardPress: (step, _t, p) => `await ${p}.keyboard.press(${quoteJs(step.value ?? 'Enter')});`,
	mouseWheel: (step, _t, p) => `await ${p}.mouse.wheel(${step.x ?? 0}, ${step.y ?? 0});`,
	scrollTo: (step, target) => `await ${target}.evaluate((el) => el.scrollTo(${step.x ?? 0}, ${step.y ?? 0}));`,
	newPage: (step, _t, p) => `const ${p} = await context.newPage();${step.value ? `\n\tawait ${p}.goto(${quoteJs(step.value)});` : ''}`,
	bringToFront: (_s, _t, p) => `await ${p}.bringToFront();`
};

/** Pemicu popup: `const [page2] = await Promise.all([page.waitForEvent('popup'), <aksi>]);`. */
const wrapPopup = (line: string, p: string, popupVar: string): string => {
	const expression = line.replace(/^await /, '').replace(/;$/, '');
	return `const [${popupVar}] = await Promise.all([${p}.waitForEvent('popup'), ${expression}]);`;
};

export const renderStep = (step: CodegenStep): string => {
	const p = step.pageVar ?? 'page';
	const line = STEP_RENDERERS[step.action](step, `${p}.${step.locator}`, p);
	return step.popupVar ? wrapPopup(line, p, step.popupVar) : line;
};

/** Script memakai lebih dari satu tab (butuh fixture `context`). */
const usesContext = (steps: CodegenStep[]): boolean => steps.some((step) => (step.pageVar ?? 'page') !== 'page' || Boolean(step.popupVar));

// Semua line terminator JS (\n, \r, U+2028, U+2029) dinetralkan agar teks rekaman tidak keluar dari komentar `//`.
export const singleLine = (text: string): string => text.replace(/\r\n|[\r\n\u2028\u2029]/g, ' ');
const commentLine = (text: string): string => `\t// ${singleLine(text)}`;

export const renderScript = (
	session: CodegenInput['session'],
	steps: CodegenStep[],
	trailingComments: string[] = [],
	leadingComments: string[] = []
): string => {
	const title = [session.test_case_no, session.title].filter((part) => part && String(part).trim()).join(' ') || 'Rekaman tester';
	const fixtures = usesContext(steps) ? '{ page, context }' : '{ page }';
	const finalUrl = finalUrlAssertion(steps);
	return [
		"import { test, expect } from '@playwright/test';",
		'',
		`test(${quoteJs(title)}, async (${fixtures}) => {`,
		...headerLines(steps, leadingComments),
		...steps.flatMap(stepLines),
		...trailingComments.map(commentLine),
		...(finalUrl ? [finalUrl] : []),
		'});',
		''
	].join('\n');
};

/** Komentar awal: env rahasia, komentar header (ringkasan/peringatan), dan viewport rekaman. */
const headerLines = (steps: CodegenStep[], leadingComments: string[]): string[] => {
	const lines: string[] = [];
	const secrets = [...new Set(steps.map((step) => step.secretEnv).filter((name): name is string => Boolean(name)))];
	if (secrets.length > 0) lines.push(commentLine(`Nilai sensitif diambil dari env: ${secrets.join(', ')}`));
	lines.push(...leadingComments.map(commentLine));
	// Replay extension menskalakan klik koordinat bila viewport berbeda dari baris ini.
	const viewport = steps.find((step) => step.viewport)?.viewport;
	if (viewport) lines.push(commentLine(`${VIEWPORT_COMMENT_PREFIX} ${viewport.w}x${viewport.h}`));
	return lines;
};

const stepLines = (step: CodegenStep): string[] => {
	const inline = step.inlineComment ? ` // ${singleLine(step.inlineComment)}` : '';
	return [
		...(step.preComments ?? []).map(commentLine),
		...(step.ambiguous ? [commentLine('⚠ locator tidak unik saat direkam')] : []),
		`\t${renderStep(step)}${inline}`,
		...step.comments.map(commentLine),
		...(step.assertions ?? []).map((assertion) => `\t${assertion}`)
	];
};

/** `toHaveURL` penutup dari navigasi terakhir; string persis untuk goto, RegExp untuk pola ID dinamis. */
const finalUrlAssertion = (steps: CodegenStep[]): string | null => {
	const lastNav = [...steps].reverse().find((step) => NAVIGATION_ACTIONS.includes(step.action));
	const url = lastNav ? lastNav.url ?? lastNav.value ?? '' : '';
	if (!lastNav || !url) return null;
	const exact = lastNav.action === 'goto' || (lastNav.action === 'waitForURL' && lastNav.value === lastNav.url);
	return `\tawait expect(${lastNav.pageVar ?? 'page'}).toHaveURL(${exact ? quoteJs(url) : urlRegexLiteral(url)});`;
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
	steps.unshift({ no: 0, action: 'goto', locator: '', value: candidate, url: candidate, ambiguous: false, sequences: [], comments: [] });
	steps.forEach((step, index) => (step.no = index + 1));
	return null;
};

/** Komentar sumber tiap file langkah upload: artifact rekaman, atau perlu disediakan manual. */
const attachTestDataSources = (steps: CodegenStep[], files: Array<{ file_name: string; id_artifact: number }>): void => {
	const byName = new Map(files.map((file) => [file.file_name, file]));
	for (const step of steps) {
		if (step.action !== 'setInputFiles') continue;
		for (const name of step.files ?? []) {
			const source = byName.get(name);
			step.comments.push(
				source
					? `${TEST_DATA_DIR}/${name}: file rekaman (artifact #${source.id_artifact}, GET /sessions/:id/test-data-files)`
					: `${TEST_DATA_DIR}/${name}: file tidak tersimpan saat rekam, sediakan manual`
			);
		}
	}
};

/** Maksimal nomor event yang ditulis per alasan di ringkasan header. */
const SUMMARY_MAX_SEQUENCES = 10;

/**
 * Ringkasan header: kenapa script lebih pendek dari rekaman (event yang digabung/dilewati beserta alasannya).
 * Urutan alasan mengikuti kemunculan pertama di rekaman agar output deterministik.
 */
export const buildSummary = (eventCount: number, stepCount: number, notes: CodegenNote[], ignoredInternal: number): string[] => {
	const lines = [`Ringkasan: ${eventCount} event aksi → ${stepCount} langkah.`];
	const entries = notes.map((note) => {
		const sequences = [...note.sequences].sort((a, b) => a - b);
		const shown = sequences.slice(0, SUMMARY_MAX_SEQUENCES).map((s) => `#${s}`).join(', ');
		const more = sequences.length > SUMMARY_MAX_SEQUENCES ? `, … +${sequences.length - SUMMARY_MAX_SEQUENCES}` : '';
		return `- ${note.reason}: ${sequences.length} event (${shown}${more})`;
	});
	if (ignoredInternal > 0) entries.push(`- klik pada widget QA diabaikan: ${ignoredInternal} event`);
	if (entries.length > 0) lines.push('Digabung/dilewati:', ...entries);
	return lines;
};

export const generatePlaywrightScript = (input: CodegenInput): CodegenResult => {
	const sources = input.events
		.filter((event) => event.type === 'action' || event.type === 'navigation' || event.type === 'tab')
		.slice()
		.sort((a, b) => a.sequence - b.sequence);
	const actions = sources.map(normalize).filter((action): action is NormalizedAction => action !== null);

	const built = buildSteps(actions);
	const { steps } = built;
	const warning = steps[0]?.action !== 'goto' ? prependStartUrl(steps, actions, input.session.target_url) : null;
	attachTestDataSources(steps, input.testDataFiles ?? []);
	const trailingComments = [...built.trailing, ...attachCheckpoints(steps, input.checkpoints, built.tabVars)];
	const leadingComments = [...buildSummary(actions.length, steps.length, built.notes, sources.length - actions.length), ...(warning ? [warning] : [])];
	return { script: renderScript(input.session, steps, trailingComments, leadingComments), steps, notes: built.notes, leadingComments, trailingComments };
};

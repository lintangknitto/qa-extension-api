/**
 * Locator dari klien (checkpoint "Pilih elemen") ditulis apa adanya ke script Playwright, jadi harus
 * dipastikan hanya berupa rantai pemanggilan locator dengan argumen literal — bukan kode bebas.
 * Tokenizer sederhana: identifier wajib dari allowlist, string literal tanpa line terminator/backtick,
 * angka, true/false, dan tanda baca `.(),{}:`. Apa pun di luar itu (`;`, `=`, `+`, template, regex) ditolak.
 */

const METHODS = new Set([
	'locator',
	'frameLocator',
	'contentFrame',
	'getByRole',
	'getByText',
	'getByLabel',
	'getByPlaceholder',
	'getByAltText',
	'getByTitle',
	'getByTestId',
	'nth',
	'first',
	'last',
	'filter',
	'and',
	'or'
]);
const OPTION_KEYS = new Set(['name', 'exact', 'hasText', 'hasNotText', 'checked', 'disabled', 'expanded', 'includeHidden', 'level', 'pressed', 'selected']);
const LITERALS = new Set(['true', 'false']);

type Token = { kind: 'ident' | 'string' | 'number' | 'punct'; value: string };

const tokenize = (input: string): Token[] | null => {
	const tokens: Token[] = [];
	let i = 0;
	while (i < input.length) {
		const ch = input[i];
		if (ch === ' ') {
			i++;
		} else if (/[A-Za-z_$]/.test(ch)) {
			const match = /^[A-Za-z_$][\w$]*/.exec(input.slice(i));
			tokens.push({ kind: 'ident', value: match[0] });
			i += match[0].length;
		} else if (/\d/.test(ch)) {
			const match = /^\d+/.exec(input.slice(i));
			tokens.push({ kind: 'number', value: match[0] });
			i += match[0].length;
		} else if (ch === "'" || ch === '"') {
			let j = i + 1;
			while (j < input.length && input[j] !== ch) {
				if (/[\r\n\u2028\u2029]/.test(input[j])) return null;
				// Escape (`\'`, `\\`) melompati karakter berikutnya.
				j += input[j] === '\\' ? 2 : 1;
			}
			if (j >= input.length) return null;
			tokens.push({ kind: 'string', value: input.slice(i, j + 1) });
			i = j + 1;
		} else if ('.(),{}:'.includes(ch)) {
			tokens.push({ kind: 'punct', value: ch });
			i++;
		} else {
			return null;
		}
	}
	return tokens;
};

const CLOSING: Record<string, string> = { ')': '(', '}': '{' };

/** Identifier hanya boleh berupa method locator (diikuti `(`), kunci opsi di dalam `{}`, atau true/false. */
const isAllowedIdent = (tokens: Token[], k: number, stack: string[]): boolean => {
	const { value } = tokens[k];
	const next = tokens[k + 1]?.value;
	if (METHODS.has(value)) return next === '(' && (k === 0 || tokens[k - 1].value === '.');
	if (OPTION_KEYS.has(value)) return next === ':' && stack[stack.length - 1] === '{';
	return LITERALS.has(value) && stack.length > 0;
};

/** Tanda baca menjaga kurung seimbang; `.` hanya boleh di level atas (antar pemanggilan). */
const applyPunct = (value: string, stack: string[]): boolean => {
	if (value === '(' || value === '{') {
		stack.push(value);
		return true;
	}
	if (CLOSING[value]) return stack.pop() === CLOSING[value];
	return value !== '.' || stack.length === 0;
};

/** `true` bila locator aman ditulis sebagai kode Playwright (opsional berawalan `page.`). */
export const isSafeLocator = (locator: string): boolean => {
	if (locator.length === 0 || locator.length > 2000) return false;
	const tokens = tokenize(locator.replace(/^page\./, ''));
	if (!tokens || tokens.length === 0 || tokens[0].kind !== 'ident') return false;
	const stack: string[] = [];
	for (let k = 0; k < tokens.length; k++) {
		const { kind, value } = tokens[k];
		const ok =
			kind === 'ident' ? isAllowedIdent(tokens, k, stack) : kind === 'punct' ? applyPunct(value, stack) : stack.length > 0;
		if (!ok) return false;
	}
	return stack.length === 0;
};

// Hanya URL http/https tanpa karakter kontrol/line terminator (URL ini dipakai di script hasil generate).
export const isHttpUrl = (value: string): boolean => {
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(value)) return false;
	try {
		return ['http:', 'https:'].includes(new URL(value).protocol);
	} catch {
		return false;
	}
};

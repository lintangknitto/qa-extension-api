export const escapeHtml = (str: unknown): string => {
	const val = typeof str === 'string' ? str : (str === null || str === undefined ? '' : String(str));
	return val
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
};

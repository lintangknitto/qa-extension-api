import { createLogger, setLogger } from '@knittotextile/knitto-core-backend';

// Hide sensitive data di dalam log
const redactedFields = [
	// Password di level nesting mana pun (object)
	'*.password',
	'*.*.password',
	'*.*.*.password',
	'*.*.*.*.password',
	// Password di dalam array
	'[*].password',
	'*[*].password',
	'*.*[*].password',
	'*.*.*[*].password'
];

const logger = createLogger({
	redact: redactedFields,
	timeZone: 'Asia/Jakarta'
});

setLogger(logger.child({ channel: 'app-log' }));

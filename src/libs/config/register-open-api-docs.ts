import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { logger } from '@knittotextile/knitto-core-backend';
import type { ExpressServerInstance } from '@knittotextile/knitto-http';
import { APP_NAME } from '@/libs/config/index';

const OPENAPI_SPEC_RELATIVE = path.join('docs', 'openapi', 'openapi.yaml');
const OPENAPI_SPEC_URL = '/api-docs/openapi.yaml';

/** Accent sidebar/header only; uses Scalar CSS variables (no CDN fonts — withDefaultFonts: false). */
const SCALAR_CUSTOM_CSS = `
.light-mode,
.dark-mode {
	--scalar-color-accent: #1e6b8a;
}
.light-mode .t-doc__sidebar,
.dark-mode .t-doc__sidebar {
	--scalar-sidebar-item-active-background: color-mix(in srgb, var(--scalar-color-accent) 14%, var(--scalar-background-2));
}
`.trim();

export const registerOpenApiDocs = async (server: ExpressServerInstance): Promise<void> => {
	const specPath = path.join(process.cwd(), OPENAPI_SPEC_RELATIVE);
	const { apiReference } = await import("@scalar/express-api-reference");

	if (!fs.existsSync(specPath)) {
		logger.warn(`OpenAPI spec tidak ditemukan (${OPENAPI_SPEC_RELATIVE}), skip mount /api-docs`);
		return;
	}

	const rawSpec = fs.readFileSync(specPath, 'utf8');
	YAML.parse(rawSpec);

	server.app.get(OPENAPI_SPEC_URL, (_req, res) => {
		res.type('application/yaml');
		res.send(rawSpec);
	});

	server.app.get(
		'/api-docs',
		apiReference({
			url: OPENAPI_SPEC_URL,
			theme: 'elysiajs',
			layout: 'modern',
			metaData: {
				title: APP_NAME
			},
			hideModels: true,
			withDefaultFonts: false,
			defaultOpenFirstTag: false,
			customCss: SCALAR_CUSTOM_CSS,
			agent: {
				disabled: true
			},
			telemetry: false,
			showDeveloperTools: 'never',
			persistAuth: true,
			hideDarkModeToggle: true,
		})
	);
};

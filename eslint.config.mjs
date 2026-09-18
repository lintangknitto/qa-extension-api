import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Selaras dengan script `pnpm lint` — hanya layer HTTP aplikasi. */
const httpTypeScriptFiles = ['src/app/http/**/*.ts'];

const knittoHttpRules = {
	'@typescript-eslint/explicit-function-return-type': 'off',
	'@typescript-eslint/no-floating-promises': 'off',
	'@typescript-eslint/no-misused-promises': 'off',
	'@typescript-eslint/strict-boolean-expressions': 'off',
	'@typescript-eslint/no-explicit-any': 'off',
	'@typescript-eslint/no-unsafe-argument': 'off',
	'@typescript-eslint/no-unsafe-assignment': 'off',
	'@typescript-eslint/no-unsafe-call': 'off',
	'@typescript-eslint/no-unsafe-member-access': 'off',
	'@typescript-eslint/no-unsafe-return': 'off',
	'@typescript-eslint/prefer-nullish-coalescing': 'off',
	'@typescript-eslint/consistent-type-imports': 'off',
	'@typescript-eslint/require-await': 'off',
	'@typescript-eslint/space-before-function-paren': 'off',
	'@typescript-eslint/naming-convention': [
		'error',
		{
			selector: 'variable',
			format: ['camelCase', 'snake_case', 'UPPER_CASE', 'PascalCase'],
			leadingUnderscore: 'allow'
		}
	],
	'@typescript-eslint/no-unused-vars': [
		'error',
		{
			argsIgnorePattern: '^_',
			varsIgnorePattern: '^_',
			caughtErrorsIgnorePattern: '^_'
		}
	],
	complexity: ['error', 15],
	'max-len': [
		'error',
		{
			code: 300,
			tabWidth: 4,
			ignoreUrls: true,
			ignoreStrings: true,
			ignoreTemplateLiterals: true,
			ignoreRegExpLiterals: true
		}
	],
	'no-console': 'error',
	'no-tabs': 'off',
	indent: ['error', 'tab', { SwitchCase: 1 }],
	quotes: ['error', 'single', { avoidEscape: true }],
	semi: ['error', 'always'],
	'quote-props': ['error', 'as-needed'],
	'comma-dangle': ['error', 'never'],
	'space-before-function-paren': [
		'error',
		{
			anonymous: 'always',
			named: 'never',
			asyncArrow: 'always'
		}
	]
};

export default tseslint.config(
	{
		ignores: [
			'**/tests/**',
			'node_modules/**',
			'eslint.config.mjs',
			'database/**',
			'dist/**',
			'jest.*',
			'coverage/**',
			'storage/**',
			'husky/**',
			'.github/**',
			'src/app/http/**/__tests__/**',
			'src/app/http/**/*.spec.ts'
		]
	},
	{
		files: httpTypeScriptFiles,
		extends: [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: knittoHttpRules
	},
	{
		files: ['**/*.js'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module'
		},
		rules: {
			indent: ['error', 'tab'],
			quotes: ['error', 'single'],
			semi: ['error', 'always'],
			'no-tabs': 'off',
			'no-console': 'error'
		}
	}
);

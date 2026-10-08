const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig');

/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	detectOpenHandles: true,
	clearMocks: true,
	// collectCoverage: true,
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/*.d.ts',
		'!src/**/*.spec.ts',
		'!src/**/*.test.ts',
		'!src/**/index.ts',
		'!src/**/__tests__/**',
		'!src/tests'
	],
	// coverageDirectory: 'coverage',
	verbose: true,
	testMatch: ['./__tests__/**/*.+(ts|js)', './**/*.spec.+(ts|js)'],
	// E2E harness specs start Docker + Chromium; they run via `pnpm e2e:postgres`, not unit tests.
	testPathIgnorePatterns: ['/node_modules/', '<rootDir>/dist/', '<rootDir>/tests/e2e/'],
	moduleFileExtensions: ['ts', 'js'],
	passWithNoTests: true,
	moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
		prefix: '<rootDir>/'
	})
};

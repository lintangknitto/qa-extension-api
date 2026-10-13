import astParserService from '../services/ast-parser.service';
import chunkerService from '../services/chunker.service';

describe('AstParserService & ChunkerService', () => {
	const sampleTsCode = `
import express, { Request, Response } from 'express';
import { ProjectService } from './project.service';

/**
 * Interface untuk Project DTO
 */
export interface IProjectDto {
	id_project: number;
	name: string;
}

export type TProjectStatus = 'active' | 'inactive';

export class ProjectController {
	/**
	 * Mengambil detail project
	 */
	public async getDetail(req: Request, res: Response): Promise<void> {
		const id = req.params.id;
		res.json({ id });
	}
}

export const createProjectHandler = async (req: Request, res: Response) => {
	const body = req.body;
	return res.status(201).json(body);
};

const router = express.Router();
router.get('/api/v1/projects', createProjectHandler);
router.post('/api/v1/projects', createProjectHandler);

export default router;
`;

	it('berhasil mem-parsing TypeScript dan mengekstrak symbols, interfaces, classes, routes', () => {
		const result = astParserService.parseSource('src/project.ts', sampleTsCode);

		expect(result.file_path).toBe('src/project.ts');
		expect(result.imports).toHaveLength(2);
		expect(result.imports[0].source).toBe('express');
		expect(result.imports[0].specifiers).toContain('Request');

		// Interface
		const iface = result.symbols.find((s) => s.name === 'IProjectDto');
		expect(iface).toBeDefined();
		expect(iface?.kind).toBe('interface');

		// Class and method
		const cls = result.symbols.find((s) => s.name === 'ProjectController');
		expect(cls).toBeDefined();
		expect(cls?.kind).toBe('class');

		const method = result.symbols.find((s) => s.name === 'ProjectController.getDetail');
		expect(method).toBeDefined();
		expect(method?.kind).toBe('method');

		// Function
		const func = result.symbols.find((s) => s.name === 'createProjectHandler');
		expect(func).toBeDefined();
		expect(func?.kind).toBe('function');

		// Routes
		expect(result.routes).toHaveLength(2);
		expect(result.routes[0].http_method).toBe('GET');
		expect(result.routes[0].path).toBe('/api/v1/projects');
		expect(result.routes[1].http_method).toBe('POST');
	});

	it('chunkerService menghitung hash SHA-256 secara konsisten', () => {
		const hash1 = chunkerService.computeFileHash(sampleTsCode);
		const hash2 = chunkerService.computeFileHash(sampleTsCode);
		expect(hash1).toBe(hash2);
		expect(hash1).toHaveLength(64);
	});

	it('chunkerService menghasilkan semantic chunks dari AST symbols', () => {
		const astResult = astParserService.parseSource('src/project.ts', sampleTsCode);
		const chunks = chunkerService.createChunks('src/project.ts', sampleTsCode, astResult);

		expect(chunks.length).toBeGreaterThan(0);
		const symbolNames = chunks.map((c) => c.symbol_name).filter(Boolean);
		expect(symbolNames).toContain('createProjectHandler');
		expect(symbolNames).toContain('IProjectDto');
	});

	it('middleware/route dengan handler sebagai argumen pertama tidak menjadikan isi fungsi sebagai nama simbol', () => {
		const body = 'x'.repeat(400);
		const code = `
const app = express();
app.use(async (req, res, next) => { console.log("${body}"); next(); });
app.get(PATHS.health, (req, res) => res.send("${body}"));
router.post('/messages', controller.send);
`;
		const result = astParserService.parseSource('src/app.ts', code);
		const routes = result.symbols.filter((s) => s.kind === 'route_handler');
		expect(routes.map((s) => s.name)).toEqual(['USE *', 'GET PATHS.health', 'POST /messages']);
		expect(routes.every((s) => s.name.length < 255 && (s.signature ?? '').length < 255)).toBe(true);
		expect(routes[2].signature).toBe('POST /messages -> controller.send');
	});
});

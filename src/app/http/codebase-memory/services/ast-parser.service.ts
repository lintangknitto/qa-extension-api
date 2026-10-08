import ts from 'typescript';

export interface IExtractedSymbol {
	name: string;
	kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'route_handler' | 'method';
	signature: string;
	docstring?: string;
	start_line: number;
	end_line: number;
	scope_path?: string;
	metadata?: Record<string, unknown>;
}

export interface IExtractedRoute {
	http_method: string;
	path: string;
	start_line: number;
	end_line: number;
	middlewares?: string[];
	handler_name?: string;
}

export interface IExtractedImport {
	source: string;
	specifiers: string[];
}

export interface IAstParseResult {
	file_path: string;
	total_lines: number;
	imports: IExtractedImport[];
	exports: string[];
	symbols: IExtractedSymbol[];
	routes: IExtractedRoute[];
	summary: {
		symbol_count: number;
		route_count: number;
		import_count: number;
		export_count: number;
	};
}

export class AstParserService {
	public parseSource(filePath: string, sourceCode: string): IAstParseResult {
		const sourceFile = ts.createSourceFile(
			filePath,
			sourceCode,
			ts.ScriptTarget.Latest,
			true,
			filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
				? ts.ScriptKind.TSX
				: ts.ScriptKind.TS
		);

		const lineStarts = sourceFile.getLineStarts();
		const totalLines = lineStarts.length;

		const imports: IExtractedImport[] = [];
		const exports: string[] = [];
		const symbols: IExtractedSymbol[] = [];
		const routes: IExtractedRoute[] = [];

		const getLine = (pos: number): number => {
			return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
		};

		const getDocstring = (node: ts.Node): string | undefined => {
			const fullText = sourceFile.getFullText();
			const commentRanges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
			if (!commentRanges || commentRanges.length === 0) return undefined;

			return commentRanges
				.map((r) => fullText.slice(r.pos, r.end).trim())
				.filter((c) => c.startsWith('/**') || c.startsWith('//'))
				.join('\n');
		};

		const getCleanSignature = (node: ts.Node): string => {
			if ('body' in node && (node as { body?: ts.Node }).body) {
				const bodyNode = (node as { body?: ts.Node }).body;
				if (bodyNode) {
					const nodeStart = node.getStart(sourceFile);
					const bodyStart = bodyNode.getStart(sourceFile);
					if (bodyStart > nodeStart) {
						return sourceCode.slice(nodeStart, bodyStart).trim();
					}
				}
			}

			const text = node.getText(sourceFile);
			const braceIndex = text.indexOf('{');
			if (braceIndex !== -1) {
				return text.slice(0, braceIndex).trim();
			}
			const firstLine = text.split('\n')[0];
			return firstLine.trim();
		};

		const checkRouteCall = (node: ts.CallExpression): IExtractedRoute | null => {
			const expr = node.expression;
			if (!ts.isPropertyAccessExpression(expr)) return null;

			const propName = expr.name.text.toLowerCase();
			const supportedMethods = ['get', 'post', 'put', 'delete', 'patch', 'all', 'use'];
			if (!supportedMethods.includes(propName)) return null;

			const callerText = expr.expression.getText(sourceFile).toLowerCase();
			if (!callerText.includes('router') && !callerText.includes('app') && !callerText.includes('route')) {
				return null;
			}

			if (node.arguments.length === 0) return null;

			const firstArg = node.arguments[0];
			let routePath = '';
			if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
				routePath = firstArg.text;
			} else {
				routePath = firstArg.getText(sourceFile);
			}

			const handlerArg = node.arguments[node.arguments.length - 1];

			return {
				http_method: propName.toUpperCase(),
				path: routePath,
				start_line: getLine(node.getStart(sourceFile)),
				end_line: getLine(node.getEnd()),
				handler_name: handlerArg ? handlerArg.getText(sourceFile) : undefined
			};
		};

		const processImport = (node: ts.ImportDeclaration): void => {
			const source = (node.moduleSpecifier as ts.StringLiteral).text;
			const specifiers: string[] = [];
			if (node.importClause) {
				if (node.importClause.name) {
					specifiers.push(node.importClause.name.text);
				}
				if (node.importClause.namedBindings) {
					if (ts.isNamedImports(node.importClause.namedBindings)) {
						node.importClause.namedBindings.elements.forEach((el) => {
							specifiers.push(el.name.text);
						});
					} else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
						specifiers.push(`* as ${node.importClause.namedBindings.name.text}`);
					}
				}
			}
			imports.push({ source, specifiers });
		};

		const processFunction = (node: ts.FunctionDeclaration, currentScope?: string): void => {
			if (!node.name) return;
			const name = node.name.text;
			const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			if (isExported) exports.push(name);

			symbols.push({
				name,
				kind: 'function',
				signature: getCleanSignature(node),
				docstring: getDocstring(node),
				start_line: getLine(node.getStart(sourceFile)),
				end_line: getLine(node.getEnd()),
				scope_path: currentScope,
				metadata: { isExported: Boolean(isExported) }
			});
		};

		const processVariable = (node: ts.VariableStatement, currentScope?: string): void => {
			const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			const doc = getDocstring(node);

			node.declarationList.declarations.forEach((decl) => {
				if (ts.isIdentifier(decl.name)) {
					const name = decl.name.text;
					if (isExported) exports.push(name);

					const init = decl.initializer;
					if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
						symbols.push({
							name,
							kind: 'function',
							signature: `const ${name} = ${getCleanSignature(init)}`,
							docstring: doc,
							start_line: getLine(decl.getStart(sourceFile)),
							end_line: getLine(decl.getEnd()),
							scope_path: currentScope,
							metadata: { isExported: Boolean(isExported), isArrow: true }
						});
					}
				}
			});
		};

		const processClass = (node: ts.ClassDeclaration, currentScope?: string): void => {
			if (!node.name) return;
			const className = node.name.text;
			const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			if (isExported) exports.push(className);

			symbols.push({
				name: className,
				kind: 'class',
				signature: getCleanSignature(node),
				docstring: getDocstring(node),
				start_line: getLine(node.getStart(sourceFile)),
				end_line: getLine(node.getEnd()),
				scope_path: currentScope,
				metadata: { isExported: Boolean(isExported) }
			});

			node.members.forEach((member) => {
				if (ts.isMethodDeclaration(member) && member.name) {
					const methodName = member.name.getText(sourceFile);
					symbols.push({
						name: `${className}.${methodName}`,
						kind: 'method',
						signature: getCleanSignature(member),
						docstring: getDocstring(member),
						start_line: getLine(member.getStart(sourceFile)),
						end_line: getLine(member.getEnd()),
						scope_path: className
					});
				}
			});
		};

		const processTypeOrInterface = (node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration): void => {
			const name = node.name.text;
			const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			if (isExported) exports.push(name);

			const kind: 'interface' | 'type' | 'enum' = ts.isInterfaceDeclaration(node)
				? 'interface'
				: ts.isTypeAliasDeclaration(node)
					? 'type'
					: 'enum';

			symbols.push({
				name,
				kind,
				signature: getCleanSignature(node),
				docstring: getDocstring(node),
				start_line: getLine(node.getStart(sourceFile)),
				end_line: getLine(node.getEnd()),
				metadata: { isExported: Boolean(isExported) }
			});
		};

		const visit = (node: ts.Node, currentScope?: string): void => {
			if (ts.isImportDeclaration(node)) processImport(node);
			else if (ts.isFunctionDeclaration(node)) processFunction(node, currentScope);
			else if (ts.isVariableStatement(node)) processVariable(node, currentScope);
			else if (ts.isClassDeclaration(node)) processClass(node, currentScope);
			else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) {
				processTypeOrInterface(node);
			} else if (ts.isCallExpression(node)) {
				const route = checkRouteCall(node);
				if (route) {
					routes.push(route);
					symbols.push({
						name: `${route.http_method} ${route.path}`,
						kind: 'route_handler',
						signature: `${route.http_method} ${route.path} -> ${route.handler_name || 'anonymous'}`,
						start_line: route.start_line,
						end_line: route.end_line,
						metadata: { http_method: route.http_method, path: route.path }
					});
				}
			}

			ts.forEachChild(node, (child) => visit(child, currentScope));
		};

		ts.forEachChild(sourceFile, (node) => visit(node));

		return {
			file_path: filePath,
			total_lines: totalLines,
			imports,
			exports: Array.from(new Set(exports)),
			symbols,
			routes,
			summary: {
				symbol_count: symbols.length,
				route_count: routes.length,
				import_count: imports.length,
				export_count: exports.length
			}
		};
	}
}

export default new AstParserService();

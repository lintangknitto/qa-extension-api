import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Import and run the knitto-mcp-grafana entrypoint
import('@knittotextile/knitto-mcp-grafana')
	.then(() => {
		// Server started
	})
	.catch((err) => {
		console.error('Failed to start Grafana MCP Server:', err);
		process.exit(1);
	});

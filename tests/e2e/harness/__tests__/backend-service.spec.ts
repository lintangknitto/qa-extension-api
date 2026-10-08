import { spawn } from 'child_process';
import { stopProcessTree } from '../backend-service';

const isAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

describe('stopProcessTree', () => {
	jest.setTimeout(20000);

	it('menghentikan proses beserta proses turunannya (tidak ada proses yatim)', async () => {
		// Parent prints its grandchild's pid, then both idle — like a wrapper around the real server.
		const script = `
			const { spawn } = require('child_process');
			const gc = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
			console.log(gc.pid);
			setInterval(() => {}, 1000);
		`;
		const parent = spawn(process.execPath, ['-e', script], {
			stdio: ['ignore', 'pipe', 'ignore'],
			detached: process.platform !== 'win32'
		});
		const grandchildPid = await new Promise<number>((resolve) => {
			parent.stdout!.once('data', (d) => resolve(Number(String(d).trim())));
		});
		expect(isAlive(parent.pid!)).toBe(true);
		expect(isAlive(grandchildPid)).toBe(true);

		await stopProcessTree(parent, 2000);

		expect(parent.exitCode !== null || parent.signalCode !== null).toBe(true);
		// Give the OS a moment to reap the grandchild after the tree kill.
		await new Promise((r) => setTimeout(r, 500));
		expect(isAlive(grandchildPid)).toBe(false);
	});

	it('tidak melakukan apa-apa untuk proses yang sudah selesai', async () => {
		const child = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore' });
		await new Promise((r) => child.once('exit', r));
		await expect(stopProcessTree(child)).resolves.toBeUndefined();
	});
});

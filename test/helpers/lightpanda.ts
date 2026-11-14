import { spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findExecutable } from '../../src/utils/find-executable.js';

/** A wrapper around the Lightpanda binary that records the PID of every process started through it. */
export interface RecordingExecutable {
	/** Path of the wrapper, for the plugin's `executablePath` option. */
	path: string;
	/** PIDs of the processes started so far, in order. */
	pids(): Promise<number[]>;
	/** Remove the wrapper. */
	remove(): Promise<void>;
}

/** Create a {@link RecordingExecutable}. The wrapper `exec`s Lightpanda, so the recorded PID is Lightpanda's. */
export async function recordingExecutable(): Promise<RecordingExecutable> {
	const dir = await mkdtemp(join(tmpdir(), 'osmotic-lightpanda-'));
	const log = join(dir, 'pids');
	const path = join(dir, 'lightpanda');
	await writeFile(path, `#!/bin/sh\necho $$ >> '${log}'\nexec '${findExecutable()}' "$@"\n`);
	await chmod(path, 0o755);
	return {
		path,
		pids: async () => (await readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(Number),
		remove: () => rm(dir, { recursive: true, force: true }),
	};
}

/** Whether a process with this PID is running. */
export function isRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** A Lightpanda CDP server started by a test, as a user would run one for the `endpoint` option. */
export interface LightpandaServer {
	/** `ws://127.0.0.1:<port>/` */
	endpoint: string;
	process: ChildProcess;
	stop(): Promise<void>;
}

/** Start `lightpanda serve` on a free port. */
export async function serveLightpanda(): Promise<LightpandaServer> {
	const child = spawn(findExecutable(), ['serve', '--host', '127.0.0.1', '--port', '0'], {
		stdio: ['ignore', 'ignore', 'pipe'],
		env: { ...process.env, LIGHTPANDA_DISABLE_TELEMETRY: 'true' },
	});
	const address = await new Promise<string>((resolve, reject) => {
		let log = '';
		child.stderr!.on('data', (chunk) => {
			log += chunk;
			const match = /address=(\S+)/.exec(log);
			if (match) resolve(match[1]);
		});
		child.once('error', reject);
		child.once('exit', (code) => reject(new Error(`lightpanda serve exited with ${code}: ${log}`)));
	});
	return {
		endpoint: `ws://${address}/`,
		process: child,
		stop: () =>
			new Promise((resolve) => {
				if (child.exitCode !== null || child.signalCode !== null) return resolve();
				child.once('exit', () => resolve());
				child.kill();
			}),
	};
}

/** Resolve once `check()` is true, polling every 20 ms; reject after `ms`. */
export async function until(check: () => boolean | Promise<boolean>, ms = 5000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!(await check())) {
		if (Date.now() > deadline) throw new Error(`Condition not met within ${ms} ms`);
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

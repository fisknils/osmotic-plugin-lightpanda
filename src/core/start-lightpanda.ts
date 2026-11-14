import { spawn, type ChildProcess } from 'node:child_process';

/** A Lightpanda process serving CDP, and the WebSocket URL to reach it. */
export interface StartedLightpanda {
	child: ChildProcess;
	endpoint: string;
}

// The line Lightpanda logs once it listens, e.g. msg="server running" address=127.0.0.1:40301
const READY = /server running.*?address[=:]\s*"?([^\s"]+:\d+)/;

/**
 * Start `lightpanda serve` on a free port on 127.0.0.1, with `args` appended, and resolve
 * once it accepts connections. Telemetry is off unless `LIGHTPANDA_DISABLE_TELEMETRY` says
 * otherwise. The process is killed if Node exits first.
 */
export function startLightpanda(bin: string, args: string[] = [], timeout = 10000): Promise<StartedLightpanda> {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, ['serve', '--host', '127.0.0.1', '--port', '0', ...args], {
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { LIGHTPANDA_DISABLE_TELEMETRY: 'true', ...process.env },
		});
		const killOnExit = () => child.kill('SIGKILL');
		process.once('exit', killOnExit);
		child.once('exit', () => process.off('exit', killOnExit));

		let log = '';
		let ready = false;
		const fail = (err: Error) => {
			clearTimeout(timer);
			child.kill('SIGKILL');
			reject(err);
		};
		const timer = setTimeout(
			() => fail(new Error(`Lightpanda didn't start within ${timeout} ms: ${tail(log)}`)),
			timeout,
		);
		const read = (chunk: Buffer) => {
			if (ready) return;
			log += chunk;
			const match = READY.exec(log);
			if (!match) return;
			ready = true;
			clearTimeout(timer);
			resolve({ child, endpoint: `ws://${match[1]}/` });
		};
		// Keep reading after start, so a full pipe never blocks Lightpanda
		child.stdout!.on('data', read);
		child.stderr!.on('data', read);

		child.once('error', (err: NodeJS.ErrnoException) => {
			if (ready) return;
			if (err.code === 'ENOENT') {
				fail(
					new Error(
						`Lightpanda wasn't found at ${bin}. Install it with \`npm install @lightpanda/browser\` ` +
							'(Linux and macOS; on Windows, run in WSL or Docker), or set the executablePath or endpoint option.',
						{ cause: err },
					),
				);
			} else {
				fail(new Error(`Couldn't start Lightpanda at ${bin}: ${err.message}`, { cause: err }));
			}
		});
		child.once('exit', (code, signal) => {
			if (!ready) fail(new Error(`Lightpanda exited (${signal ?? `code ${code}`}) before it was ready: ${tail(log)}`));
		});
	});
}

/** Stop `child`, with SIGKILL if it hasn't exited after `grace` milliseconds. */
export function stopLightpanda(child: ChildProcess, grace = 5000): Promise<void> {
	return new Promise((resolve) => {
		if (child.exitCode !== null || child.signalCode !== null) return resolve();
		const timer = setTimeout(() => child.kill('SIGKILL'), grace);
		child.once('exit', () => {
			clearTimeout(timer);
			resolve();
		});
		child.kill('SIGTERM');
	});
}

// The end of the log, for error messages
const tail = (log: string) => log.trim().split('\n').slice(-5).join('\n') || '(no output)';

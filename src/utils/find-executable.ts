import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The Lightpanda binary to start: `explicit` if given, then `LIGHTPANDA_EXECUTABLE_PATH`, then
 * the binary `@lightpanda/browser` downloads on install, if it's there, then `lightpanda`, which
 * the system looks up on the `PATH`.
 */
export function findExecutable(explicit?: string): string {
	if (explicit) return explicit;
	if (process.env.LIGHTPANDA_EXECUTABLE_PATH) return process.env.LIGHTPANDA_EXECUTABLE_PATH;
	const downloaded = join(homedir(), '.cache', 'lightpanda-node', 'lightpanda');
	return existsSync(downloaded) ? downloaded : 'lightpanda';
}

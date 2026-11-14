import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Osmotic } from 'osmotic';
import lightpanda from '../src/index.cjs';
import {
	createSite,
	isRunning,
	recordingExecutable,
	runChain,
	scripted,
	until,
	type RecordingExecutable,
	type Site,
} from './helpers/index.js';

const ready = scripted(`document.body.insertAdjacentHTML('beforeend', '<p class="ready">ready</p>')`);

let site: Site;
let lightpandaBin: RecordingExecutable;

before(async () => {
	site = await createSite({
		'/a': '<p>a</p>',
		'/b': '<p>b</p>',
		'/plain': '<p>plain</p>',
		'/list': '<a href="/crash">crash</a> <a href="/after">after</a>',
		'/crash': scripted(''),
		'/after': ready,
	});
	lightpandaBin = await recordingExecutable();
	Osmotic.plugins([lightpanda({ executablePath: lightpandaBin.path })]);
});

after(async () => {
	await site.close();
	await lightpandaBin.remove();
});

test('a run that renders nothing never starts Lightpanda', async () => {
	const { rows } = await runChain(new Osmotic().render(false).get(site.url('/plain')).set({ p: 'p' }));
	assert.deepEqual(rows, [{ p: 'plain' }]);
	assert.deepEqual(await lightpandaBin.pids(), []);
});

test('concurrent runs share one process, and it is stopped after the last one ends', async () => {
	const [a, b] = await Promise.all([
		runChain(Osmotic.get(site.url('/a')).set({ p: 'p' })),
		runChain(Osmotic.get(site.url('/b')).set({ p: 'p' })),
	]);
	assert.deepEqual([...a.rows, ...b.rows], [{ p: 'a' }, { p: 'b' }]);
	const pids = await lightpandaBin.pids();
	assert.equal(pids.length, 1);
	assert.equal(isRunning(pids[0]), false);
});

test('a later run starts a new process', async () => {
	await runChain(Osmotic.get(site.url('/a')));
	const pids = await lightpandaBin.pids();
	assert.equal(pids.length, 2);
	assert.equal(isRunning(pids[1]), false);
});

test('the process is stopped when a run fails', async () => {
	const chain = Osmotic.get(site.url('/a'))
		.set({ p: 'p' })
		.data(() => {
			throw new Error('boom');
		})
		.config({ respectRobots: false });
	await assert.rejects(chain.run(), /boom/);
	const pids = await lightpandaBin.pids();
	assert.equal(pids.length, 3);
	assert.equal(isRunning(pids[2]), false);
});

test('a crash fails the page in flight, and the next page starts a new process', async () => {
	const started = (await lightpandaBin.pids()).length;
	// One page at a time: /crash is loading when Lightpanda is killed, /after loads after it
	const chain = new Osmotic()
		.render(false)
		.get(site.url('/list'))
		.render({ waitFor: '.ready', timeout: 20000 })
		.follow('a@href')
		.set({ ready: '.ready' })
		.config({ concurrency: 1 });
	const run = runChain(chain);
	await until(() => site.paths().includes('/crash'));
	const [pid] = (await lightpandaBin.pids()).slice(started);
	const killed = Date.now();
	process.kill(pid, 'SIGKILL');
	const { rows, errors } = await run;
	assert.ok(Date.now() - killed < 10000, 'the crashed page fails without waiting for its timeout');
	assert.deepEqual(
		errors.map((e) => e.url),
		[site.url('/crash')],
	);
	assert.deepEqual(rows, [{ ready: 'ready' }]);
	const pids = (await lightpandaBin.pids()).slice(started);
	assert.equal(pids.length, 2);
	assert.equal(isRunning(pids[1]), false);
});

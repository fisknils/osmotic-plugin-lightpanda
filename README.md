# osmotic-plugin-lightpanda

An [osmotic](https://www.npmjs.com/package/osmotic) plugin that loads pages in [Lightpanda](https://lightpanda.io/),
a lightweight headless browser. Content that a page builds with JavaScript is in the HTML osmotic parses, so `find()`,
`set()` and the rest work on single-page apps and other script-heavy sites, without downloading and running Chromium.

```js
const { Osmotic } = require('osmotic');

Osmotic.plugins([require('osmotic-plugin-lightpanda')]);

Osmotic.get('https://quotes.toscrape.com/js/')
	.recurse('li.next a@href')
	.find('.quote')
	.set({ text: '.text', author: '.author', tags: ['.tag'] })
	.csv('quotes.csv')
	.run();
```

- Every page is rendered by default; nothing else in the chain changes
- `robots.txt`, `Crawl-delay`, `maxPages`, concurrency and events work as before
- Per-slot proxies, user agents and headers are applied in the browser
- Wait for the network to go idle, or for a selector, and click or fill in forms before the HTML is captured
- Block scripts, `fetch()` requests and other resources
- One shared Lightpanda process, started when first needed and stopped when the run ends, or one you run yourself
- Page scripts run in Lightpanda's own process, never in Node's

## Installation

```sh
npm install osmotic osmotic-plugin-lightpanda @lightpanda/browser
```

`osmotic` (version 3) is a peer dependency. [`@lightpanda/browser`](https://www.npmjs.com/package/@lightpanda/browser)
downloads the latest nightly Lightpanda binary when it's installed, into `~/.cache/lightpanda-node/`; the plugin finds
it there. It's an optional peer dependency, since you can provide Lightpanda in other ways:

- Set `LIGHTPANDA_EXECUTABLE_PATH`, or the [`executablePath`](#options) option, to a binary you downloaded from
  [Lightpanda's releases](https://github.com/lightpanda-io/browser/releases).
- Put `lightpanda` on the `PATH`.
- Run Lightpanda yourself, for example [in a container](#lightpanda-in-a-container), and connect with
  [`endpoint`](#options).

Lightpanda runs on Linux and macOS (x64 and arm64). **It doesn't run on Windows**: use
[WSL](https://learn.microsoft.com/windows/wsl/) and run Node there, or run Lightpanda in Docker and connect with
`endpoint`.

npm 11 asks before running install scripts. If it skipped `@lightpanda/browser`'s, allow it with
`npm approve-scripts @lightpanda/browser`, or download the binary with `npx @lightpanda/browser upgrade`.

## Usage

Load the plugin once, before building any chains:

```js
// CommonJS
const { Osmotic } = require('osmotic');
Osmotic.plugins([require('osmotic-plugin-lightpanda')]);

// ES modules / TypeScript
import { Osmotic } from 'osmotic';
import lightpanda from 'osmotic-plugin-lightpanda';
Osmotic.plugins([lightpanda]);
```

To pass [options](#options), call the plugin with them:

```js
Osmotic.plugins([require('osmotic-plugin-lightpanda')({ waitUntil: 'networkidle' })]);
```

### How it works

The plugin adds fetch middleware. Instead of making the HTTP request, it opens the URL in a new Lightpanda page over
the Chrome DevTools Protocol, waits for it to load, and gives osmotic the rendered HTML as the response. osmotic then
parses it as usual.

The response keeps the page's real status and headers, so non-2xx pages and non-HTML responses are skipped as before,
and the `page` event reports the URL after redirects. Headers that describe the original body, such as
`Content-Length` and `Content-Encoding`, are left out, since the body is the rendered HTML. Navigation errors and
timeouts are reported as `error` events.

`robots.txt` is still fetched directly, without the browser.

### Middleware in front of the plugin

The plugin makes the request itself and doesn't call `next()`, so fetch middleware loaded after it never runs.
Middleware that needs to see or change requests must come before it: load its plugin first, or add it with the chain's
`useFetch()`.

- Headers it adds are sent by the browser. A `Cookie` header is set as cookies for the page's site in the browser
  context, so the page's own requests to that site send them too, and other sites don't.
- It sees the page's response headers, `Set-Cookie` once per cookie.
- Responses it handles itself, such as a challenge it solves, can be returned to it unrendered with
  [`passThrough`](#render-options).

```js
Osmotic.plugins([
	require('some-middleware-plugin'),
	require('osmotic-plugin-lightpanda')({
		passThrough: (res) => res.headers['x-challenge'] === '1',
	}),
]);
```

## Commands

### `.render(options = {})`

Sets [render options](#render-options) for the pages loaded **after** this step, on top of the plugin's options and
any earlier `render()`. It also turns rendering on for those pages when the plugin was loaded with `renderAll: false`.

```js
new Osmotic().render({ waitFor: '.price' }).get('https://example.com/product/1').set({ price: '.price' }).run();
```

`Osmotic.get(url)` loads its page before any `render()` step can run, so start the chain with
`new Osmotic().render(...)` when the first page needs options.

Options apply to the branch they're set on, including pages loaded by `follow()` and `recurse()`:

```js
new Osmotic()
	.render(false) // the listing is plain HTML
	.get('https://example.com/products')
	.render({ waitFor: '.price' })
	.follow('.product a@href') // product pages are rendered
	.set({ title: 'h1', price: '.price' })
	.run();
```

### `.render(false)`

Fetches the pages loaded after this step without the browser, as plain osmotic would.

## Render options

These can be set when loading the plugin, as defaults for every page, and with `render()`.

| Option        | Default  | Description                                                                                                      |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `waitUntil`   | `'load'` | When navigation is done: `'load'`, `'domcontentloaded'`, `'networkidle'` or `'commit'`.                          |
| `waitFor`     | none     | Wait until an element matching this CSS selector is in the page.                                                 |
| `timeout`     | `30000`  | Milliseconds for the response, again for `waitUntil`, and again for `waitFor`.                                   |
| `block`       | `[]`     | Resource types to fail, such as `'script'`, `'xhr'`, `'fetch'` or `'image'`.                                     |
| `actions`     | none     | `async (page, url) => {}`, run before the HTML is captured. See [the page handle](#actions-and-the-page-handle). |
| `passThrough` | none     | `({ url, status, headers }) => boolean`. Matching responses are returned as sent, unrendered.                    |

`'networkidle'` waits until the page has made no requests for 500 ms, which suits pages that load their content with
`fetch()` after the `load` event. `'commit'` captures the page as soon as the response arrives.

`block` fails matching requests before they're sent, so a blocked script never runs and a blocked `fetch()` rejects in
the page. Lightpanda reports `fetch()` requests as `'xhr'`, so `'fetch'` and `'xhr'` both block them. Lightpanda
doesn't load images or stylesheets unless told to (see [`args`](#options)).

`waitFor` and `actions` only run for 2xx HTML responses. A response `passThrough` matches is returned as soon as it
arrives, with the server's body and headers, whatever its status: no `waitUntil`, `waitFor` or `actions`, and the
page's scripts don't get to change it. `headers` has lowercase names.

`waitFor` takes a CSS selector, checked with the page's own `document.querySelector()`; modern selectors such as
`:has()` and `:is()` work. osmotic's own selector extras, such as `:text-is()`, and Playwright's `text=` forms are not
available there.

### `actions` and the page handle

`actions` gets a small handle on the page, not a Playwright `Page`:

| Method                           | Does                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `evaluate(fn, arg)`              | Calls `fn(arg)` in the page and returns the result, awaited. A string is evaluated too.                      |
| `click(selector)`                | Calls `click()` on the first matching element. Fails if there is none.                                       |
| `fill(selector, value)`          | Sets the element's value and fires `input` and `change`. Fails if there is none.                             |
| `waitFor(selector, { timeout })` | Waits for an element matching the CSS selector. `timeout` defaults to the render option's.                   |
| `content()`, `url()`             | The page's current HTML and URL.                                                                             |
| `send(method, params)`           | Sends a [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) command to the page. |

```js
.render({
	actions: async (page) => {
		await page.fill('#search', 'lightpanda');
		await page.click('button[type=submit]');
		await page.waitFor('.results li');
	},
})
```

Code passed to `evaluate()` runs in the page, in Lightpanda, not in Node: it is sent as source code, so it can't use
variables from the surrounding Node code. Pass what it needs as `arg`, which, like the result, must survive
`JSON.stringify()`. `click()` calls the element's `click()` method rather than moving a mouse, since Lightpanda doesn't
lay pages out.

If an action makes the page navigate, such as by submitting a form, wait for something on the new page with
`waitFor()` before returning. The HTML and URL are captured from the page loaded when `actions` returns, while the
status and headers stay those of the first response.

## Options

The plugin's own options, alongside the [render options](#render-options):

| Option           | Default                            | Description                                                                |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| `renderAll`      | `true`                             | Render every page. When `false`, only pages after a `render()` step are.   |
| `endpoint`       | none                               | WebSocket URL of a Lightpanda you run, e.g. `'ws://127.0.0.1:9222'`.       |
| `executablePath` | [found automatically](#lightpanda) | The Lightpanda binary to start.                                            |
| `args`           | `[]`                               | Extra arguments for `lightpanda serve`, e.g. `['--http-timeout', '60000']` |

```js
Osmotic.plugins([
	require('osmotic-plugin-lightpanda')({
		args: ['--http-timeout', '60000', '--locale', 'sv-SE'],
		waitUntil: 'networkidle',
	}),
]);
```

`lightpanda help serve` lists the arguments Lightpanda takes. Some useful ones: `--timezone`, `--locale`,
`--block-urls`, `--load-resources image`, `--cdp-max-connections` and `--watchdog-ms`.

## osmotic options in the browser

| osmotic option         | In the browser                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `userAgent`            | The page's user agent, so `navigator.userAgent` matches the header.                     |
| `headers`              | Sent with every request the page makes. `Cookie` goes to the page's site only.          |
| `slots[].proxy`        | The proxy for that slot's pages. Credentials in the URL (`http://user:pass@host`) work. |
| `concurrency`, `slots` | One page per slot at most, so they limit open pages too.                                |
| `delay`, `maxPages`    | As before: they apply to page loads, not to the requests a page makes.                  |

The plugin keeps one browser context per proxy, so cookies persist across pages loaded through the same proxy, as in a
normal browser session. Each context has its own connection to Lightpanda, which accepts 16 at a time by default; for
more distinct proxies, raise it with `args: ['--cdp-max-connections', '64']`.

osmotic's default user agent, `osmotic/0.1`, is sent by the browser too. Some sites treat unknown user agents
differently; set `userAgent` if pages don't render as they do in your own browser. Lightpanda still names itself in
the `Sec-CH-UA` client hints.

## Lightpanda

One Lightpanda process is shared by every chain. It is started on the first rendered request, so a run that renders
nothing never starts it, and stopped when the last running chain finishes, also when a run fails. If it crashes, the
pages loading in it fail with an `error` event, and the next request starts a new one.

The process listens on a free port on `127.0.0.1` only. The plugin turns off Lightpanda's telemetry for it, by setting
`LIGHTPANDA_DISABLE_TELEMETRY`. The binary is the first of:

1. the `executablePath` option,
2. the `LIGHTPANDA_EXECUTABLE_PATH` environment variable,
3. `~/.cache/lightpanda-node/lightpanda`, where `@lightpanda/browser` downloads it,
4. `lightpanda` on the `PATH`.

If none is there, the page fails with an error saying how to install it.

With `endpoint`, the plugin connects to that Lightpanda instead and never starts or stops it.

### Lightpanda in a container

In production, or on Windows, you can run Lightpanda in Docker and connect to it:

```sh
docker run -d --name lightpanda -p 127.0.0.1:9222:9222 lightpanda/browser:nightly
```

```js
Osmotic.plugins([require('osmotic-plugin-lightpanda')({ endpoint: 'ws://127.0.0.1:9222' })]);
```

Publish the port on `127.0.0.1` as above, not on every interface: anyone who can reach a CDP server can make the
browser load any URL, including ones on your internal network. Inside the container, Lightpanda resolves `localhost`
to the container itself, so it can't reach a site served on the host's `localhost`.

## Limits

Lightpanda is a new browser, written from scratch for headless use. Compared with
[osmotic-plugin-playwright](https://www.npmjs.com/package/osmotic-plugin-playwright), which drives Chromium, Firefox or
WebKit:

- It is much lighter: no browser download beyond one binary, little memory per page, and fast startup.
- Its Web API support is partial, so some sites don't render as in a full browser. Use the Playwright plugin for those.
- It doesn't paint pages: no screenshots, PDFs or layout-dependent behavior.
- It doesn't load images or stylesheets unless `--load-resources` says so.
- It names itself in the `Sec-CH-UA` client hints, whatever the user agent.
- `actions` gets [a small page handle](#actions-and-the-page-handle) instead of Playwright's `Page`, so actions
  written for the Playwright plugin need rewriting. There is no mouse or keyboard input.
- A page stuck in an endless script trips Lightpanda's watchdog after 30 seconds (`--watchdog-ms`), which closes the
  connection to Lightpanda. Other pages loading through the same proxy fail with it; the next page reconnects.
- Lightpanda only publishes nightly builds, which `@lightpanda/browser` installs. This version was tested with
  `1.1.0-nightly.12159`.

## TypeScript

Type declarations are included. Loading the package's types also declares `render()` on `Osmotic`. The options types
are exported:

```ts
import lightpanda, {
	type LightpandaPage,
	type LightpandaPluginOptions,
	type PassThroughResponse,
	type RenderOptions,
} from 'osmotic-plugin-lightpanda';
```

## Development

Development needs Linux, macOS or WSL, since the tests run Lightpanda.

```sh
npm run build          # clean dist/ and compile src/ with tsc
npm test               # build, type check test-d/, and run the tests in test/
npm run format         # format everything with Prettier
```

The tests use `node:test`, run against `src/` through `tsx`, serve their pages from a local HTTP server, and run the
Lightpanda binary that `@lightpanda/browser` downloaded on `npm install`, or the one `LIGHTPANDA_EXECUTABLE_PATH`
names, as in CI. Type tests in `test-d/` are compiled, never
run.

| File                              | Responsibility                                            |
| --------------------------------- | --------------------------------------------------------- |
| `src/index.cts` / `src/index.mts` | CommonJS and ESM entry points                             |
| `src/core/plugin.ts`              | The plugin: middleware, `render()` command, settings      |
| `src/core/LightpandaPool.ts`      | The shared Lightpanda process and its connections         |
| `src/core/start-lightpanda.ts`    | Starting and stopping `lightpanda serve`                  |
| `src/core/CdpConnection.ts`       | A minimal Chrome DevTools Protocol client on `WebSocket`  |
| `src/core/PageSession.ts`         | One page: its commands, events and scripts                |
| `src/core/PageHandle.ts`          | The page handle `actions` get                             |
| `src/core/render-page.ts`         | Loading a page and capturing its HTML                     |
| `src/types/options.ts`            | Options types and the `render()` declaration              |
| `src/utils/`                      | Helpers: finding the binary, headers, timeouts, responses |
| `test/`, `test/helpers/`          | Runtime tests, one file per behavior, and test fixtures   |
| `test-d/`                         | Type tests                                                |

Examples are in [`examples/`](examples/).

## License

ISC. Lightpanda itself is licensed under AGPL-3.0; the plugin talks to a separately installed binary and doesn't
include it.

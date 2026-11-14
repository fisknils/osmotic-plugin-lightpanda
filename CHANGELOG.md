# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-14

### Added

- Fetch middleware that loads pages in Lightpanda over the Chrome DevTools Protocol and gives osmotic the rendered
  HTML, with the page's status, headers and final URL.
- `render(options | false)` command, and the `waitUntil`, `waitFor` and `timeout` render options.
- Plugin options `renderAll`, `endpoint`, `executablePath` and `args`.
- One shared Lightpanda process, started on the first rendered request on `127.0.0.1` with telemetry off, and stopped
  when the last run ends. A crash fails the pages loading in it, and the next request starts a new process.

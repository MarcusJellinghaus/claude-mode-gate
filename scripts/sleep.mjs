// Cross-platform sleep for skills that wait on GitHub Actions: `npm run sleep -- <seconds>`.
// Replaces the sleep tool of mcp-tools-py, which this repo does not use.
const seconds = Number(process.argv[2]);

if (!Number.isFinite(seconds) || seconds < 0 || seconds > 300) {
  console.error("usage: npm run sleep -- <seconds 0-300>");
  process.exit(1);
}

setTimeout(() => {
  console.log(`slept ${String(seconds)}s`);
}, seconds * 1000);

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { get } from "node:http";

const require = createRequire(import.meta.url);
const { createArtifactBrowser } = require("../electron/artifact-browser.cjs");
const html = '<!doctype html><html><body><h1>Figure</h1></body></html>';

test("desktop artifact handoff serves only private, read-only copies outside the app origin", async () => {
	const targets: string[] = [];
	const trusted = {};
	const owner = createArtifactBrowser({ isTrusted: (event: unknown) => event === trusted, openExternal: async (url: string) => { targets.push(url); } });
	try {
		await assert.rejects(owner.open({}, html), /Untrusted/);
		for (const input of [null, 42, "https://example.com", "<script>invalid document</script>"]) {
			await assert.rejects(owner.open(trusted, input), /Invalid artifact/);
		}
		assert.equal(targets.length, 0, "untrusted or invalid requests never open the browser");
		await Promise.all([owner.open(trusted, html), owner.open(trusted, html)]);
		assert.equal(targets.length, 2);
		assert.notEqual(targets[0], targets[1], "each click has its own page");
		const url = new URL(targets[0]!);
		assert.equal(url.hostname, "127.0.0.1");
		assert.match(url.pathname, /^\/[0-9a-f]{48}$/);
		const response = await fetch(url);
		assert.equal(response.status, 200);
		assert.equal(await response.text(), html);
		assert.equal(response.headers.get("cache-control"), "no-store");
		assert.equal(response.headers.get("content-security-policy"), "sandbox allow-scripts allow-downloads");
		for (const path of ["/", "/api/settings", "/auth.json", "/data/settings.json", "/not-a-token"]) {
			assert.equal((await fetch(new URL(path, url))).status, 404);
		}
		assert.equal((await fetch(url, { method: "POST", body: "write" })).status, 404);
		// Fetch controls Host itself; use a raw request to exercise rejection.
		const wrongHostStatus = await new Promise((resolve, reject) => {
			get(url, { headers: { Host: "other.invalid" } }, (response) => {
				response.resume();
				resolve(response.statusCode);
			}).on("error", reject);
		});
		assert.equal(wrongHostStatus, 404);
	} finally { await owner.close(); }
	await assert.rejects(owner.open(trusted, html), /Invalid artifact/);
});

test("a failed browser launch removes its exported page", async () => {
	let target = "";
	const owner = createArtifactBrowser({ isTrusted: () => true, openExternal: async (url: string) => { target = url; throw new Error("Browser failed"); } });
	try {
		await assert.rejects(owner.open({}, html), /Browser failed/);
		assert.equal((await fetch(target)).status, 404);
	} finally { await owner.close(); }
});

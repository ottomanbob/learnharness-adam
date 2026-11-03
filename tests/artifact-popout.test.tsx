import React, { act } from "react";
(globalThis as { React?: typeof React }).React = React;
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { openArtifactPopout, type PopoutArtifact } from "../components/artifacts/popout.tsx";
import { VisualOutputCard } from "../components/artifacts/visual-card.tsx";
import { DemoOutputCard } from "../components/artifacts/demo-card.tsx";

const dom = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element,
	HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const originalOpen = window.open;
const originalBridge = window.lh;
const originalImplementation = Object.getOwnPropertyDescriptor(document, "implementation");
afterEach(() => {
	window.open = originalOpen;
	window.lh = originalBridge;
	if (originalImplementation) Object.defineProperty(document, "implementation", originalImplementation);
	else Reflect.deleteProperty(document, "implementation");
});

const svg = '<svg width="200" height="100"><text>Note&nbsp;one</text><script>window.injected=true</script></svg>';
const html = '<!doctype html><html><body><input type="range" value="3"><script>window.fresh=true</script></body></html>';

function fakePopup() {
	const popup = parseHTML("<html><head></head><body></body></html>");
	const value = { document: popup.document, opener: window, focus() {} };
	window.open = () => value as unknown as Window;
	return { ...popup, value };
}

for (const artifact of [
	{ kind: "visual", svg, inverted: true },
	{ kind: "demo", title: 'Notes </h1><script>bad()</script>', html, inverted: true },
] satisfies PopoutArtifact[]) {
	test(`${artifact.kind} pop-out preserves isolation, dark mode, and original download`, async () => {
		const popup = fakePopup();
		assert.equal(await openArtifactPopout(artifact), true);
		assert.equal(popup.value.opener, null);
		assert.equal(popup.document.querySelector("input")!.checked, true);
		assert.equal(popup.document.querySelectorAll("script").length, 0, "generated code never enters the window's document");
		if (artifact.kind === "visual") {
			const image = popup.document.querySelector("img")!;
			assert.equal(decodeURIComponent(image.getAttribute("src")!.split(",").slice(1).join(",")), svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ').replace("&nbsp;", "&#160;"));
		} else {
			assert.equal(popup.document.querySelector("h1")!.textContent, artifact.title);
			const frame = popup.document.querySelector("iframe")!;
			assert.equal(frame.getAttribute("sandbox"), "allow-scripts");
			assert.equal(frame.srcdoc, html);
		}
		const checkbox = popup.document.querySelector("input")!;
		assert.equal(checkbox.checked, true);
		checkbox.checked = false;
		checkbox.dispatchEvent(new popup.window.Event("change"));
		assert.equal(checkbox.checked, false);
		assert.equal(artifact.inverted, true, "the chat's appearance is not mutated");
		const download = popup.document.querySelector("a")!;
		const mime = artifact.kind === "visual" ? "image/svg+xml" : "text/html";
		const href = download.getAttribute("href")!;
		assert.ok(href.startsWith(`data:${mime};charset=utf-8,`));
		assert.equal(decodeURIComponent(href.split(",").slice(1).join(",")), artifact.kind === "visual" ? svg : html);
		assert.ok(download.download.endsWith(artifact.kind === "visual" ? ".svg" : ".html"));
	});

	test(`desktop ${artifact.kind} exports the same standalone controls through its narrow bridge`, async () => {
		let exported = "";
		Object.defineProperty(document, "implementation", { configurable: true, value: {
			createHTMLDocument: () => parseHTML("<html><head></head><body></body></html>").document,
		} });
		window.lh = { expandWindow() {}, openArtifactPopout: async (source) => { exported = source; } };
		window.open = () => { throw new Error("Desktop must not use the blocked window.open path"); };
		assert.equal(await openArtifactPopout(artifact), true);
		assert.ok(exported.startsWith("<!doctype html>"));
		const copy = parseHTML(exported).document;
		assert.ok(copy.querySelector("input")!.hasAttribute("checked"), "serialized copy preserves dark mode");
		assert.ok(copy.querySelector('a[download]'));
		assert.equal(copy.querySelectorAll("script").length, 0);
		if (artifact.kind === "demo") {
			assert.equal(copy.querySelector("iframe")!.getAttribute("sandbox"), "allow-scripts");
			assert.equal(copy.querySelector("iframe")!.srcdoc, html);
		} else assert.ok(copy.querySelector('img[src^="data:image/svg+xml"]'));
	});
}

test("both artifact cards open fresh copies with current inversion and report blocked pop-ups", async () => {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const render = () => <><VisualOutputCard output={{ svg }} initialInverted /><DemoOutputCard output={{ title: "Notes", html }} /></>;
	try {
		await act(async () => root.render(render()));
		window.open = () => null;
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Pop out figure"]')!.click());
		assert.match(host.querySelector('[role="alert"]')!.textContent ?? "", /Allow pop-ups/);
		const figure = fakePopup();
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Pop out figure"]')!.click());
		assert.equal(host.querySelector('[role="alert"]'), null);
		assert.equal(figure.document.querySelector("input")!.checked, true);
		const demo = fakePopup();
		await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Pop out demo"]')!.click());
		assert.equal(demo.document.querySelector("iframe")!.srcdoc, html);
		assert.equal(demo.document.querySelector("input")!.checked, false);
		assert.ok(host.querySelector('[data-testid="visual-card"]'));
		assert.ok(host.querySelector('[data-testid="demo-card"]'));
		await act(async () => root.unmount());
		// Closing/navigating the chat must leave independent windows intact.
		assert.ok(figure.document.querySelector("img"));
		assert.ok(demo.document.querySelector("iframe"));
	} finally {
		if (host.childNodes.length) await act(async () => root.unmount());
		host.remove();
	}
});

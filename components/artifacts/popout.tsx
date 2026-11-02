"use client";

import { useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { slugFilename } from "@/components/artifacts/download";
import { svgImageSource } from "@/components/artifacts/svg-image";

export type PopoutArtifact =
	| { kind: "visual"; svg: string; inverted: boolean }
	| { kind: "demo"; title: string; html: string; inverted: boolean };

const POPOUT_STYLES = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { display: flex; flex-direction: column; background: #fafafa; color: #171717; font: 14px system-ui, sans-serif; }
body:has(#artifact-dark-mode:checked) { color-scheme: dark; background: #171717; color: #fafafa; }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #8886; }
h1 { flex: 1; margin: 0; font-size: 14px; overflow-wrap: anywhere; }
label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
a { font: inherit; color: inherit; text-decoration: none; background: transparent; border: 1px solid #8888; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
main { flex: 1; min-height: 0; overflow: auto; }
.figure { display: flex; align-items: center; justify-content: center; padding: 16px; }
.canvas { max-width: 100%; background: white; }
img { display: block; max-width: 100%; height: auto; }
iframe { display: block; width: 100%; height: 100%; border: 0; background: white; }
body:has(#artifact-dark-mode:checked) .canvas, body:has(#artifact-dark-mode:checked) iframe { filter: invert(1) hue-rotate(180deg); }
`;

/** A standalone copy: no React root, session state, or generated markup in
 * the window's document. It can stay open while the learner changes chats.
 * Figures remain image documents; demos retain the inline card's sandbox. */
export function openArtifactPopout(artifact: PopoutArtifact): boolean {
	// Open synchronously from the click so browsers recognize the user gesture.
	const popup = window.open("", "_blank", "popup,width=900,height=700,resizable=yes,scrollbars=yes");
	if (!popup) return false;
	popup.opener = null;
	const doc = popup.document;
	const title = artifact.kind === "visual" ? "Figure" : artifact.title;
	doc.documentElement.lang = "en";
	doc.title = `${title} — LearnHarness`;
	const style = doc.createElement("style");
	style.textContent = POPOUT_STYLES;
	doc.head.append(style);
	const header = doc.createElement("header");
	const heading = doc.createElement("h1");
	heading.textContent = title;
	const label = doc.createElement("label");
	const dark = doc.createElement("input");
	dark.type = "checkbox";
	dark.id = "artifact-dark-mode";
	dark.checked = artifact.inverted;
	label.append(dark, doc.createTextNode("Dark mode"));
	// Native controls keep working after the opener's JS context is gone.
	// Original bytes go in the download URL, never the document's markup.
	const download = doc.createElement("a");
	download.textContent = artifact.kind === "visual" ? "Download SVG" : "Download HTML";
	download.download = artifact.kind === "visual" ? "figure.svg" : `${slugFilename(artifact.title)}.html`;
	const mime = artifact.kind === "visual" ? "image/svg+xml" : "text/html";
	const source = artifact.kind === "visual" ? artifact.svg : artifact.html;
	download.setAttribute("href", `data:${mime};charset=utf-8,${encodeURIComponent(source)}`);
	header.append(heading, label, download);
	const main = doc.createElement("main");
	if (artifact.kind === "visual") {
		main.className = "figure";
		const canvas = doc.createElement("div");
		canvas.className = "canvas";
		const image = doc.createElement("img");
		image.alt = "Figure";
		image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgImageSource(artifact.svg))}`;
		canvas.append(image);
		main.append(canvas);
	} else {
		const frame = doc.createElement("iframe");
		frame.title = artifact.title;
		frame.setAttribute("sandbox", "allow-scripts");
		frame.srcdoc = artifact.html;
		main.append(frame);
	}
	doc.body.replaceChildren(header, main);
	popup.focus();
	return true;
}

export function ArtifactPopoutButton({ artifact }: { artifact: PopoutArtifact }) {
	const [blocked, setBlocked] = useState(false);
	const label = artifact.kind === "visual" ? "figure" : "demo";
	return <>
		<button
			type="button"
			aria-label={`Pop out ${label}`}
			title="Pop out into a separate window"
			data-testid={`${artifact.kind}-popout`}
			onClick={() => setBlocked(!openArtifactPopout(artifact))}
			className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			<ExternalLinkIcon className="size-3.5" />
		</button>
		{blocked && <span role="alert" className="text-xs text-muted-foreground">Allow pop-ups for this site, then try again.</span>}
	</>;
}

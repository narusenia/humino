// SPDX-License-Identifier: MIT

import * as esbuild from "esbuild";
import * as fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const production = process.argv.includes("--production");

// The dialog is loaded as a data: URL, so its script, styles and font are
// inlined into one HTML string at build time (ADR-0008, ADR-0010).
const ui = await esbuild.build({
  entryPoints: ["ui/dialog.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  minify: production,
});
const font = fs.readFileSync("assets/fonts/AlloVariable.woff2").toString("base64");
const html = fs
  .readFileSync("ui/dialog.html", "utf8")
  .replace("/*STYLES*/", () =>
    fs.readFileSync("ui/styles.css", "utf8").replace("FONT_BASE64", font),
  )
  .replace("/*SCRIPT*/", () => ui.outputFiles[0]!.text.replaceAll("</script", "<\\/script"));

// The Extension Host does not resolve node_modules, so bundle everything
// (including @humino/core via tsconfig paths) into one file.
await esbuild.build({
  entryPoints: ["src/extension.ts"],
  outfile: manifest.entry,
  bundle: true,
  format: "cjs",
  platform: "node",
  sourcesContent: false,
  logLevel: "info",
  minify: production,
  sourcemap: !production,
  define: { __DIALOG_HTML__: JSON.stringify(html) },
});

import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(projectRoot, "dist");
const files = [
  "invite.css", "research.css", "styles.css",
];

if (dirname(outputDir) !== projectRoot || outputDir === projectRoot) {
  throw new Error("Refusing to build outside the project-specific dist directory");
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
for (const file of files) await cp(join(projectRoot, file), join(outputDir, file));
await cp(join(projectRoot, "js"), join(outputDir, "js"), { recursive: true });

const repositoryUrl = String(process.env.PUBLIC_REPOSITORY_URL ?? "").replace(/\/$/, "");
const issuesUrl = repositoryUrl ? `${repositoryUrl}/issues` : null;
await writeFile(
  join(outputDir, "site-config.js"),
  `window.__PLAYTEST_CONFIG__ = ${JSON.stringify({ repositoryUrl: repositoryUrl || null, issuesUrl }, null, 2)};\n`,
);

const gameHtml = await readFile(join(projectRoot, "index.html"), "utf8");
const inviteHtml = (await readFile(join(projectRoot, "invite.html"), "utf8"))
  .replaceAll("./index.html", "./game.html");
const privacyHtml = (await readFile(join(projectRoot, "privacy.html"), "utf8"))
  .replaceAll("./index.html", "./game.html");
const researchHtml = (await readFile(join(projectRoot, "research.html"), "utf8"))
  .replaceAll("./index.html", "./game.html");
await writeFile(join(outputDir, "game.html"), gameHtml);
await writeFile(join(outputDir, "index.html"), inviteHtml);
await writeFile(join(outputDir, "invite.html"), inviteHtml);
await writeFile(join(outputDir, "privacy.html"), privacyHtml);
await writeFile(join(outputDir, "research.html"), researchHtml);

const htmlFiles = ["index.html", "invite.html", "game.html", "privacy.html", "research.html"];
for (const htmlFile of htmlFiles) {
  const html = await readFile(join(outputDir, htmlFile), "utf8");
  const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
  for (const reference of references) {
    if (/^(?:https?:|mailto:|#)/.test(reference)) continue;
    const localPath = reference.split(/[?#]/)[0].replace(/^\.\//, "");
    if (!localPath) continue;
    await stat(join(outputDir, localPath)).catch(() => {
      throw new Error(`${htmlFile} references missing file: ${localPath}`);
    });
  }
}

const runtimeFiles = ["site-config.js", ...files, ...htmlFiles, ...["app.js", "content.js", "engine.js", "research-analysis.js", "research-dashboard.js", "site-contact.js"].map((file) => `js/${file}`)];
for (const file of runtimeFiles) {
  const text = await readFile(join(outputDir, file), "utf8");
  if (/https?:\/\/(?:localhost|127\.0\.0\.1)/.test(text)) {
    throw new Error(`Localhost reference found in publish asset: ${file}`);
  }
}

await writeFile(join(outputDir, "version.json"), `${JSON.stringify({ name: "在答案之前", version: "0.6.0", builtAt: new Date().toISOString(), entry: "index.html" }, null, 2)}\n`);
await writeFile(join(outputDir, "DEPLOY.txt"), "Upload every file in this directory to the root of any static web host. The root index.html is the playtest invitation; game.html is the game. No server runtime or database is required.\n");

console.log(`Built ${outputDir}`);
console.log("Validated local asset references and absence of localhost URLs in publish assets.");

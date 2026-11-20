// Generates standalone.html from the canonical, replaceable data/data.json.
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const data = JSON.parse(fs.readFileSync(path.join(root, "data", "data.json"), "utf8"));
const inline = `<script>window.FESTIVAL_DATA = ${JSON.stringify(data).replace(/<\//g, "<\\/")};</script>`;
const standalone = html.replace('<script src="app.js" defer></script>', `${inline}\n  <script src="app.js" defer></script>`);
fs.writeFileSync(path.join(root, "standalone.html"), standalone, "utf8");
console.log("standalone.html updated");

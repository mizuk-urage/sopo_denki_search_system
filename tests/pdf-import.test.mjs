import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
globalThis.DOMMatrix ||= class {
  constructor(values = []) {
    [this.a, this.b, this.c, this.d, this.e, this.f] = [values[0] ?? 1, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1, values[4] ?? 0, values[5] ?? 0];
    this.is2D = true;
  }
  static fromMatrix(matrix) { return new this([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]); }
};
globalThis.Path2D ||= class {};
globalThis.ImageData ||= class {};
globalThis.window = {};

await import(pathToFileURL(path.join(root, "pdf-import.js")));
const { extractPowerSheet } = await globalThis.window.FestivalPdfImportReady;

for (const [area, filename, expectedCount] of [
  ["indoor", "indoor-power-sheet.pdf", 22],
  ["outdoor", "outdoor-power-sheet.pdf", 18]
]) {
  const file = new Blob([fs.readFileSync(path.join(root, "data", "pdfs", filename))]);
  file.name = filename;
  const result = await extractPowerSheet(file);
  assert.equal(result.projects.length, expectedCount, `${area} project count`);
  assert.ok(result.projects.every(project => project.projectNumber && project.projectName), `${area} records have names and IDs`);
  assert.equal(new Set(result.projects.map(project => project.projectNumber)).size, expectedCount, `${area} project numbers are unique`);
  assert.ok(result.projects.every(project => project.localReferences[0].pageEnd >= project.localReferences[0].pageStart), `${area} page ranges are valid`);
}

console.log("PDF import tests passed");

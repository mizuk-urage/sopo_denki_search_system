import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const samplePdfRoot = path.resolve(root, "..", "sopo_search_system_test_samples", "data", "pdfs");
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
const { extractPowerSheet, splitPowerColumns } = await globalThis.window.FestivalPdfImportReady;

const powerHeading = { x: 40, value: "使用許可電力" };
const split = splitPowerColumns([
  { y: 500, items: [powerHeading, { x: 300, value: "使用系統" }] },
  { y: 470, items: [{ x: 85, value: "1800" }, { x: 325, value: "青 1" }] }
], powerHeading);
assert.deepEqual(split, { approvedPower: "1800", powerDetails: "青 1" }, "power-sheet columns use the usage-system heading as their divider");

const fixtures = [
  ["indoor", "電力シート_屋内_1エリ.pdf", 22],
  ["outdoor", "電力シート_屋外_1エリ.pdf", 18]
];
if (fixtures.every(([, filename]) => fs.existsSync(path.join(samplePdfRoot, filename)))) {
  for (const [area, filename, expectedCount] of fixtures) {
    const file = new Blob([fs.readFileSync(path.join(samplePdfRoot, filename))]);
    file.name = filename;
    const result = await extractPowerSheet(file);
    assert.equal(result.projects.length, expectedCount, `${area} project count`);
    assert.ok(result.projects.every(project => project.projectNumber && project.projectName), `${area} records have names and IDs`);
    assert.equal(new Set(result.projects.map(project => project.projectNumber)).size, expectedCount, `${area} project numbers are unique`);
    assert.ok(result.projects.every(project => project.localReferences[0].pageEnd >= project.localReferences[0].pageStart), `${area} page ranges are valid`);
  }
  console.log("PDF import sample checks passed (local fixtures)");
} else {
  console.log("PDF import sample checks skipped (local test sample folder not present)");
}

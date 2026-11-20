/* Offline PDF text reader. Vendored PDF.js is licensed under Apache-2.0. */
import * as pdfjs from "./vendor/pdfjs/pdf.min.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.js", import.meta.url).href;

function linesOf(items) {
  const rows = [];
  for (const item of items) {
    const value = String(item.str || "").trim();
    if (!value) continue;
    const x = item.transform?.[4] || 0;
    const y = item.transform?.[5] || 0;
    let row = rows.find(candidate => Math.abs(candidate.y - y) <= 2.5);
    if (!row) rows.push(row = { y, items: [] });
    row.items.push({ x, width: item.width || 0, value });
  }
  return rows.map(row => {
    row.items.sort((a, b) => a.x - b.x);
    let text = "", end = null;
    for (const item of row.items) {
      if (end !== null && item.x - end > 2.5) text += " ";
      text += item.value;
      end = item.x + item.width;
    }
    return { y: row.y, items: row.items, text: text.trim() };
  }).sort((a, b) => b.y - a.y);
}

function clean(value) { return String(value || "").replace(/\s+/g, " ").replace(/^[\s:：]+|[\s:：]+$/g, "").trim(); }

function parseProjectPage(pageNumber, rows, fullText) {
  const numberLabel = rows.flatMap(row => row.items).find(item => item.value.includes("企画番号") || item.value === "番号");
  const nameLabel = rows.flatMap(row => row.items).find(item => item.value === "企画名");
  const groupLabelRow = rows.find(row => row.y > (nameLabel ? 500 : 0) && row.items.some(item => item.value === "団体名"));
  const groupLabel = groupLabelRow?.items.find(item => item.value === "団体名");
  if (!numberLabel || !nameLabel || !groupLabel) return null;
  const locationLabel = rows.flatMap(row => row.items).find(item => item.value.includes("企画実施場所"));
  const lowerBoundary = locationLabel ? labelY(rows, locationLabel) : numberLabelY(rows, numberLabel) - 120;
  const valueRows = rows.filter(row => row.y < numberLabelY(rows, numberLabel) - 8 && row.y > lowerBoundary + 8);
  const nameX = nameLabel.x, groupX = groupLabel.x;
  const column = (minX, maxX) => valueRows.map(row => row.items.filter(item => item.x >= minX && item.x < maxX).map(item => item.value).join(" ").trim()).filter(Boolean).join(" ");
  const projectNumber = clean(column(0, nameX));
  const projectName = clean(column(nameX, groupX));
  const organization = clean(column(groupX, 900));
  if (!projectNumber || !projectName) return null;

  const placeRow = locationLabel && rows.filter(row => row.y < locationLabelY(rows, locationLabel) - 8 && row.y > locationLabelY(rows, locationLabel) - 75).sort((a,b) => b.y-a.y)[0];
  const placeText = placeRow?.items.filter(item => item.x < 280).map(item => item.value).join(" ").trim() || "";
  const controlRoom = clean(placeRow?.items.filter(item => item.x >= 280).map(item => item.value).join(" ").trim() || "");
  const powerLabel = rows.flatMap(row => row.items).find(item => item.value.includes("使用許可電力"));
  const powerRow = powerLabel && rows.filter(row => row.y < labelY(rows, powerLabel) - 8 && row.y > labelY(rows, powerLabel) - 75).sort((a,b) => b.y-a.y)[0];
  const powerText = powerRow?.items.filter(item => item.x < 250).map(item => item.value).join(" ").trim() || "";
  const powerDetails = clean(powerRow?.items.filter(item => item.x >= 250).map(item => item.value).join(" ").trim() || "");
  const isOutdoor = fullText.includes("屋外企画用");
  const area = isOutdoor ? "outdoor" : "indoor";
  return {
    id: `power-import-${pageNumber}`,
    projectNumber,
    projectName,
    organization,
    area,
    location: isOutdoor ? "" : placeText,
    tentNumber: isOutdoor ? placeText : "",
    controlRoom: isOutdoor || /^(なし|無|-)$/u.test(controlRoom) ? "" : controlRoom,
    approvedPower: clean(powerText || (/0\s*W\s*と申請/.test(fullText) ? "0W" : "")),
    powerDetails,
    keywords: [],
    otherText: "",
    searchText: clean(fullText),
    references: [],
    sourcePage: pageNumber
  };
}

function labelY(rows, target) {
  for (const row of rows) if (row.items.includes(target)) return row.y;
  return 0;
}
const numberLabelY = labelY;
const locationLabelY = labelY;

async function extractPowerSheet(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({
    data: bytes,
    cMapUrl: new URL("./vendor/pdfjs/cmaps/", import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("./vendor/pdfjs/standard_fonts/", import.meta.url).href,
    useWorkerFetch: false
  }).promise;
  const pages = [], allPageText = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = linesOf(content.items);
    const fullText = rows.map(row => row.text).join(" ");
    allPageText[pageNumber] = fullText;
    const hasProjectNumberLabel=rows.some(row=>row.items.some(item=>item.value.includes("企画番号")||item.value==="番号"));
    const hasProjectNameLabel=rows.some(row=>row.items.some(item=>item.value==="企画名"));
    if (!hasProjectNumberLabel || !hasProjectNameLabel) continue;
    const project = parseProjectPage(pageNumber, rows, fullText);
    if (project) pages.push({ project, fullText });
  }
  pages.forEach((entry, index) => {
    const lastPage = (pages[index + 1]?.project.sourcePage || (pdf.numPages + 1)) - 1;
    entry.project.localReferences = [{ pageStart: entry.project.sourcePage, pageEnd: lastPage, label: "電力シート", role: "power" }];
    entry.project.searchText = allPageText.slice(entry.project.sourcePage, lastPage + 1).join(" ").trim();
  });
  const result={ pageCount: pdf.numPages, projects: pages.map(entry => entry.project) };
  await pdf.destroy();
  return result;
}

async function inspectPdf(file) {
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: new URL("./vendor/pdfjs/cmaps/", import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL("./vendor/pdfjs/standard_fonts/", import.meta.url).href,
    useWorkerFetch: false
  }).promise;
  const text=[];
  for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    const page=await pdf.getPage(pageNumber);
    const content=await page.getTextContent();
    text.push(content.items.map(item=>item.str||"").filter(Boolean).join(" "));
  }
  const result={ pageCount: pdf.numPages, text: text.join(" ").replace(/\s+/g," ").trim() };
  await pdf.destroy();
  return result;
}

window.FestivalPdfImportReady = Promise.resolve({ extractPowerSheet, inspectPdf });

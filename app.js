/* App logic is intentionally independent of replaceable data.json. */
function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("ja").replace(/[\s　‐‑‒–—-]/g, "");
}

function searchable(record) {
  return normalize([
    record.projectNumber, record.projectName, record.tentNumber,
    ...(record.keywords || []), record.location, record.organization, record.approvedPower, record.powerDetails, record.region, record.otherText, record.searchText
  ].join(" "));
}

if (typeof document !== "undefined") {
const state = { records: [], filter: "all" };
const input = document.querySelector("#query");
const results = document.querySelector("#results");
const status = document.querySelector("#status");
const uploadStatus = document.querySelector("#upload-status");
let installPromptEvent = null;
const installButton = document.querySelector("#install-app");
const installHelp = document.querySelector("#install-help");
const installStatus = document.querySelector("#install-status");
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
if (isStandalone) {
  document.querySelector("#install-title").textContent = "ホーム画面から起動中です";
  installHelp.textContent = "このアイコンから、いつでも企画を検索できます。";
} else if (isIOS) {
  installHelp.textContent = "iPhoneではSafariの共有ボタンから「ホーム画面に追加」を選んでください。";
} else {
  installHelp.textContent = "スマートフォンではホーム画面に追加できます。対応ブラウザーなら下のボタンから進めます。";
}
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault(); installPromptEvent = event; installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!installPromptEvent) return;
  await installPromptEvent.prompt();
  const choice = await installPromptEvent.userChoice;
  installStatus.textContent = choice.outcome === "accepted" ? "インストールを開始しました。" : "インストールはキャンセルされました。ブラウザーのメニューからも追加できます。";
  installPromptEvent = null; installButton.hidden = true;
});
window.addEventListener("appinstalled", () => {
  installButton.hidden = true; installPromptEvent = null;
  document.querySelector("#install-title").textContent = "アプリを追加しました";
  installHelp.textContent = "ホーム画面の「企画検索」アイコンから開けます。";
});
document.querySelector("#share-app").addEventListener("click", async () => {
  try {
    if (navigator.share) await navigator.share({ title: document.title, text: "学園祭 企画検索", url: location.href.split("#")[0] });
    else { await navigator.clipboard.writeText(location.href.split("#")[0]); installStatus.textContent = "アプリのリンクをコピーしました。"; }
  } catch (error) { if (error.name !== "AbortError") installStatus.textContent = "リンクを共有できませんでした。ブラウザーのアドレスをコピーしてください。"; }
});
if(location.protocol==="file:"){
  document.querySelector("#upload-submit").disabled=true;
  uploadStatus.textContent="資料の登録にはGitHub PagesなどHTTPSのURLで開いてください。この単体HTMLは検索・閲覧用です。";
}
let documentResults = document.querySelector("#document-results");
const localDocuments = [];
let pendingProjectImport = [];
let pendingDocument = null;
const generatedStorageKey = "festival-search-generated-projects-v1";

const dbReady = typeof indexedDB === "undefined" ? Promise.reject(new Error("このブラウザーでは端末保存を使えません")) : new Promise((resolve, reject) => {
  const request = indexedDB.open("festival-search-local", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("documents", { keyPath: "id" });
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
dbReady.catch(() => {});
function dbAction(mode, action, value) { return dbReady.then(db => new Promise((resolve, reject) => { const tx = db.transaction("documents", mode); const req = action === "getAll" ? tx.objectStore("documents").getAll() : tx.objectStore("documents")[action](value); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); })).catch(error => { throw new Error(error?.message || "端末保存を利用できません。HTTPSのアプリとして開いてください。"); }); }
async function xlsxText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()), view = new DataView(bytes.buffer);
  const decoder = new TextDecoder(); let end = -1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0) throw new Error("Excelファイルを読み取れません");
  const entries=new Map(), count=view.getUint16(end+10,true); let p=view.getUint32(end+16,true);
  for(let i=0;i<count;i++){if(view.getUint32(p,true)!==0x02014b50)break;const method=view.getUint16(p+10,true),size=view.getUint32(p+20,true),nameLen=view.getUint16(p+28,true),extraLen=view.getUint16(p+30,true),commentLen=view.getUint16(p+32,true),offset=view.getUint32(p+42,true),name=decoder.decode(bytes.slice(p+46,p+46+nameLen));entries.set(name,{method,size,offset});p+=46+nameLen+extraLen+commentLen;}
  async function xml(path){const e=entries.get(path);if(!e)return "";const n=e.offset+30+view.getUint16(e.offset+26,true)+view.getUint16(e.offset+28,true),compressed=bytes.slice(n,n+e.size);if(e.method===0)return decoder.decode(compressed);if(e.method!==8||!globalThis.DecompressionStream)throw new Error("この端末ではExcelの圧縮形式を開けません");const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));return await new Response(stream).text();}
  const sharedXml=await xml("xl/sharedStrings.xml"), shared=sharedXml?Array.from(new DOMParser().parseFromString(sharedXml,"application/xml").getElementsByTagName("si"),si=>si.textContent):[];
  let sheet="xl/worksheets/sheet1.xml";const workbook=await xml("xl/workbook.xml"),rels=await xml("xl/_rels/workbook.xml.rels");
  if(workbook&&rels){const wdoc=new DOMParser().parseFromString(workbook,"application/xml"),rdoc=new DOMParser().parseFromString(rels,"application/xml"),first=wdoc.getElementsByTagName("sheet")[0],rid=first?.getAttribute("r:id");const rel=Array.from(rdoc.getElementsByTagName("Relationship")).find(x=>x.getAttribute("Id")===rid);if(rel){const target=rel.getAttribute("Target").replace(/^\//,"");sheet=target.startsWith("xl/")?target:`xl/${target}`;}}
  const sheetXml=await xml(sheet);if(!sheetXml)throw new Error("Excelのシートを見つけられません");const doc=new DOMParser().parseFromString(sheetXml,"application/xml");
  return Array.from(doc.getElementsByTagName("c"),cell=>{const type=cell.getAttribute("t"),v=cell.getElementsByTagName("v")[0]?.textContent||"";if(type==="s")return shared[Number(v)]||"";if(type==="inlineStr")return cell.getElementsByTagName("is")[0]?.textContent||"";return v;}).filter(Boolean).join(" ");
}
function staticDocuments() {
  const docs = new Map();
  state.records.forEach(record => (record.references || []).forEach(ref => {
    const key = `${ref.file}|${ref.label}`; if (!docs.has(key)) docs.set(key, { id:key, name:ref.file.split("/").pop(), type:ref.label.includes("電力シート")?"電力シート":ref.label.includes("配線図")?"配線図":"その他", area:record.area === "indoor" ? "屋内" : "屋外", terms:"", file:ref.file, pages:new Set(), projects:new Set() });
    const doc=docs.get(key); doc.pages.add(ref.page); doc.projects.add(record.projectName || record.projectNumber);
  })); return [...docs.values()];
}
function renderDocuments() {
  if (!documentResults) return;
  const q=normalize(document.querySelector("#doc-query").value);
  const docs=[...staticDocuments(),...localDocuments].filter(d=>!q||normalize([d.name,d.type,d.area,d.terms,[...(d.projects||[])].join(" ")].join(" ")).includes(q));
  document.querySelector("#doc-count").textContent=`${docs.length}件の資料`;
  documentResults.innerHTML=docs.length?docs.map(d=>{ const href=d.url || `data/${encodeURIComponent(d.file).replace(/%2F/g,"/")}`; const pages=d.pages?.size?` · 該当ページ ${[...d.pages].sort((a,b)=>a-b).join(", ")}`:""; const projects=d.projects?.size?` · 関連企画 ${[...d.projects].slice(0,4).map(safe).join("、")}`:""; const snippet=String(d.terms||"").slice(0,180); return `<article class="card"><h2>${safe(d.name)}</h2><p class="meta"><span class="badge">${safe(d.type)}</span><span class="badge">${safe(d.area)}</span>${safe(pages)}${safe(projects)}</p><p class="meta">${safe(snippet)}${d.terms?.length>180?"…":""}</p><div class="links"><a href="${safe(href)}" target="_blank" rel="noopener">資料を開く ↗</a></div></article>`;}).join(""):'<div class="empty">一致する資料はありません。</div>';
}
function syncManagementMode(){
  const replacing=document.querySelector("#doc-mode").value==="replace";
  const target=localDocuments.find(doc=>doc.id===document.querySelector("#replace-target").value);
  document.querySelector("#replace-target-wrap").hidden=!replacing;
  document.querySelector("#doc-type").disabled=replacing;
  document.querySelector("#doc-area").disabled=replacing;
  if(replacing&&target){document.querySelector("#doc-type").value=target.type;document.querySelector("#doc-area").value=target.area;}
  document.querySelector("#upload-submit").textContent=replacing?"選んだ資料と差し替える":"この端末に追加";
}
function refreshManagementOptions(){
  const options=localDocuments.map(doc=>`<option value="${safe(doc.id)}">${safe(doc.name)} · ${safe(doc.type)} · ${safe(doc.area)}</option>`).join("");
  document.querySelector("#replace-target").innerHTML=options||'<option value="">差し替えできる資料はありません</option>';
  document.querySelector("#delete-target").innerHTML=options||'<option value="">削除できる資料はありません</option>';
  document.querySelector('#doc-mode option[value="replace"]').disabled=!localDocuments.length;
  document.querySelector("#delete-target").disabled=!localDocuments.length;
  document.querySelector("#delete-doc").disabled=!localDocuments.length;
  syncManagementMode();
}
async function loadLocalDocuments() { try { localDocuments.forEach(d=>d.url&&URL.revokeObjectURL(d.url)); localDocuments.splice(0,localDocuments.length,...(await dbAction("readonly","getAll")).map(d=>({...d,local:true,url:URL.createObjectURL(d.blob)}))); } catch(e) { uploadStatus.textContent="端末保存を使えません。HTTPSで配布したアプリをインストールして開いてください。"; console.warn(e); } refreshManagementOptions(); renderDocuments(); }
function mergeGeneratedRecords(baseRecords) {
  try {
    const saved=JSON.parse(localStorage.getItem(generatedStorageKey)||"[]");
    const replaced=new Set(saved.map(record=>`${record.area}|${record.projectNumber}`));
    const byId=new Map(saved.map(record=>[record.id,record]));
    state.records=[...baseRecords.filter(record=>!replaced.has(`${record.area}|${record.projectNumber}`)),...byId.values()];
  } catch { state.records=baseRecords; }
}
document.querySelector("#projects-tab").addEventListener("click",()=>{document.querySelector("#project-search").hidden=false;document.querySelector("#document-search").hidden=true;document.querySelector("#results").hidden=false;document.querySelector("#projects-tab").classList.add("active");document.querySelector("#documents-tab").classList.remove("active");});
document.querySelector("#documents-tab").addEventListener("click",()=>{document.querySelector("#project-search").hidden=true;document.querySelector("#document-search").hidden=false;document.querySelector("#results").hidden=true;document.querySelector("#documents-tab").classList.add("active");document.querySelector("#projects-tab").classList.remove("active");loadLocalDocuments();renderDocuments();});
document.querySelector("#doc-query").addEventListener("input",renderDocuments);
document.querySelector("#doc-mode").addEventListener("change",syncManagementMode);
document.querySelector("#replace-target").addEventListener("change",syncManagementMode);
function renderImportReview(projects) {
  pendingProjectImport = projects;
  const review = document.querySelector("#import-review");
  document.querySelector("#import-preview").innerHTML = projects.map((record,index)=>`<article class="import-card" data-project-index="${index}"><h3>PDF ${record.sourcePage}ページから検出 · ${record.area === "indoor" ? "屋内" : "屋外"}</h3><label>企画番号<input data-field="projectNumber" value="${safe(record.projectNumber)}"></label><label>企画名<input data-field="projectName" value="${safe(record.projectName)}"></label><label>団体名<input data-field="organization" value="${safe(record.organization)}"></label><label>${record.area === "indoor" ? "実施場所" : "テント番号"}<input data-field="place" value="${safe(record.location || record.tentNumber)}"></label>${record.area === "indoor" ? `<label>控室<input data-field="controlRoom" value="${safe(record.controlRoom)}"></label>` : ""}<label>許可電力<input data-field="approvedPower" value="${safe(record.approvedPower)}"></label><label>${record.area === "indoor" ? "使用系統" : "電ドラ情報"}<input data-field="powerDetails" value="${safe(record.powerDetails)}"></label><p class="meta">この企画の電力シート：${record.localReferences[0].pageStart}〜${record.localReferences[0].pageEnd}ページ</p></article>`).join("");
  document.querySelector("#create-project-pages").textContent=pendingDocument?.replacing?"確認して資料を差し替え、企画ページを更新":"確認した内容で企画ページを作成";
  review.hidden = projects.length === 0;
}
document.querySelector("#upload-form").addEventListener("submit",async event=>{
  event.preventDefault(); const file=document.querySelector("#doc-file").files[0]; if(!file)return;
  const mode=document.querySelector("#doc-mode").value;
  const existing=mode==="replace"?localDocuments.find(doc=>doc.id===document.querySelector("#replace-target").value):null;
  if(mode==="replace"&&!existing){uploadStatus.textContent="差し替える資料を選んでください。";return;}
  const type=existing?.type||document.querySelector("#doc-type").value;
  const area=existing?.area||document.querySelector("#doc-area").value.trim()||"全エリア";
  const extension=file.name.split(".").pop().toLowerCase();
  if((type==="電力シート"||type==="配線図")&&extension!=="pdf"){uploadStatus.textContent="電力シートと配線図はPDFを選んでください。";return;}
  if(type==="企画一覧"&&!(["xlsx","csv","txt","json"].includes(extension))){uploadStatus.textContent="企画一覧はExcel（.xlsx）、CSV、TXT、JSONのいずれかを選んでください。";return;}
  const item={id:existing?.id||globalThis.crypto?.randomUUID?.()||`${Date.now()}-${file.name}`,name:file.name,type,area,terms:document.querySelector("#doc-terms").value,blob:file,local:true};
  try {
    let extracted=null, indexWarning="";
    if(/\.pdf$/i.test(file.name)) {
      uploadStatus.textContent="PDFをこの端末で読み取っています…";
      const parser=await window.FestivalPdfImportReady;
      if(!parser) throw new Error("PDFの読み取りにはHTTPSで開いたアプリが必要です。アプリをインストールして開いてください。");
      const info=await parser.inspectPdf(file); item.pageCount=info.pageCount; item.terms=[item.terms,info.text].filter(Boolean).join(" ").trim();
      if(item.type==="電力シート") {
        extracted=await parser.extractPowerSheet(file);
        if(!extracted.projects.length) throw new Error("企画情報のあるページを見つけられません。文字情報を含む電力シートPDFを選んでください。");
        item.terms=[item.terms,...extracted.projects.map(p=>`${p.projectNumber} ${p.projectName} ${p.organization}`)].join(" ").trim();
        extracted.projects.forEach(project=>{project.localReferences[0].docId=item.id;project.region=item.area;});
        pendingDocument={item,replacing:Boolean(existing)};
        renderImportReview(extracted.projects);
        uploadStatus.textContent=`${extracted.projects.length}件の企画候補を読み取りました。内容を確認してページを作成してください。`;
      } else {
        if(existing&&!window.confirm(`「${existing.name}」を選んだファイルで差し替えます。よろしいですか？`))return;
        await dbAction("readwrite","put",item);
        uploadStatus.textContent=`${info.pageCount}ページのPDFをこの端末に登録しました。企画ページから関連する配線図も開けます。`;
      }
    } else {
      if(file.name.toLowerCase().endsWith(".xlsx")){try{item.terms=`${item.terms} ${await xlsxText(file)}`.trim();}catch(e){indexWarning=" Excelの文字検索はこのブラウザーで使えないため、入力したキーワードだけが検索されます。";console.warn(e);}}
      else if(!file.type.includes("pdf")&&/\.(csv|txt|json)$/i.test(file.name)){item.terms=`${item.terms} ${await file.text()}`.trim();}
      if(existing&&!window.confirm(`「${existing.name}」を選んだファイルで差し替えます。よろしいですか？`))return;
      await dbAction("readwrite","put",item);
      uploadStatus.textContent=`この端末に${existing?"差し替えました":"登録しました"}。別の端末や利用者とは共有されません。${indexWarning}`;
    }
    event.target.reset(); syncManagementMode(); if(!pendingDocument)await loadLocalDocuments();
  } catch(e) { uploadStatus.textContent=`登録できませんでした：${e.message||"ブラウザーの保存容量または設定を確認してください"}`; console.error(e); }
});
document.querySelector("#create-project-pages").addEventListener("click",async()=>{
  if(!pendingDocument){uploadStatus.textContent="先に電力シートを選んでください。";return;}
  if(pendingDocument.replacing&&!window.confirm(`「${localDocuments.find(doc=>doc.id===pendingDocument.item.id)?.name||"登録済み資料"}」を選んだ電力シートに差し替え、企画ページを更新します。よろしいですか？`))return;
  const cards=[...document.querySelectorAll(".import-card")];
  const records=cards.map(card=>{
    const project={...pendingProjectImport[Number(card.dataset.projectIndex)]};
    const value=name=>card.querySelector(`[data-field="${name}"]`)?.value.trim()||"";
    project.projectNumber=value("projectNumber"); project.projectName=value("projectName"); project.organization=value("organization"); project.approvedPower=value("approvedPower");
    project.controlRoom=value("controlRoom"); project.powerDetails=value("powerDetails");
    if(project.area==="indoor") project.location=value("place"); else project.tentNumber=value("place");
    project.id=`${project.localReferences[0].docId}-page-${project.sourcePage}`;
    return project;
  }).filter(project=>project.projectNumber&&project.projectName);
  try {
    const existing=JSON.parse(localStorage.getItem(generatedStorageKey)||"[]");
    const importedKeys=new Set(records.map(record=>`${record.area}|${record.projectNumber}`));
    const docId=pendingDocument.item.id;
    const retained=existing.filter(record=>!(record.localReferences||[]).some(ref=>ref.docId===docId)&&!importedKeys.has(`${record.area}|${record.projectNumber}`));
    const byId=new Map([...retained,...records].map(record=>[record.id,record]));
    const saved=[...byId.values()];
    await dbAction("readwrite","put",pendingDocument.item);
    localStorage.setItem(generatedStorageKey,JSON.stringify(saved));
    state.records=[...state.records.filter(record=>!(record.localReferences||[]).some(ref=>ref.docId===docId)&&!importedKeys.has(`${record.area}|${record.projectNumber}`)),...saved];
    pendingDocument=null; pendingProjectImport=[];
    document.querySelector("#import-review").hidden=true;
    document.querySelector("#project-search").hidden=false; document.querySelector("#document-search").hidden=true; document.querySelector("#results").hidden=false;
    document.querySelector("#projects-tab").classList.add("active"); document.querySelector("#documents-tab").classList.remove("active");
    uploadStatus.textContent=`${records.length}件の企画ページを作成しました。検索一覧から開けます。`;
    await loadLocalDocuments();
    render();
  } catch(e) { uploadStatus.textContent="企画ページを保存できませんでした。端末の保存領域を確認してください。"; }
});
document.querySelector("#cancel-project-pages").addEventListener("click",()=>{pendingDocument=null;pendingProjectImport=[];document.querySelector("#import-review").hidden=true;uploadStatus.textContent="登録を取り消しました。端末内の資料は変更されていません。";});
document.querySelector("#delete-doc").addEventListener("click",async()=>{
  const id=document.querySelector("#delete-target").value,doc=localDocuments.find(item=>item.id===id);if(!doc)return;
  if(!window.confirm(`「${doc.name}」をこの端末から削除しますか？この資料から作った企画ページも削除されます。`))return;
  try{await dbAction("readwrite","delete",id);const saved=JSON.parse(localStorage.getItem(generatedStorageKey)||"[]").filter(record=>!(record.localReferences||[]).some(ref=>ref.docId===id));localStorage.setItem(generatedStorageKey,JSON.stringify(saved));state.records=state.records.filter(record=>!(record.localReferences||[]).some(ref=>ref.docId===id));uploadStatus.textContent=`「${doc.name}」と、その資料から作成した企画ページを削除しました。`;await loadLocalDocuments();render();}
  catch(e){uploadStatus.textContent=`削除できませんでした：${e.message||"端末の保存領域を確認してください"}`;}
});

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

function render() {
  const detailId = location.hash.match(/^#\/project\/([^/?#]+)$/)?.[1];
  if (detailId) { renderDetail(decodeURIComponent(detailId)); return; }
  renderList();
}

function renderList() {
  const q = normalize(input.value);
  const found = state.records.filter(record =>
    (state.filter === "all" || record.area === state.filter) && (!q || searchable(record).includes(q))
  );
  status.textContent = q ? `${found.length}件見つかりました` : `${state.records.length}件を登録しています。語句を入力して検索してください。`;
  if (!found.length) {
    results.innerHTML = '<div class="empty">一致する企画はありません。番号やキーワードを変えてみてください。</div>';
    return;
  }
  results.innerHTML = found.map(record => {
    const areaLabel = record.area === "indoor" ? "屋内" : "屋外";
    const heading = record.projectName || "名称未確認の資料";
    const meta = [record.projectNumber ? `企画番号：${safe(record.projectNumber)}` : "企画番号：未登録", record.tentNumber ? `テント：${safe(record.tentNumber)}` : "", record.location ? `場所：${safe(record.location)}` : "", record.organization ? `団体：${safe(record.organization)}` : "", record.approvedPower ? `許可電力：${safe(record.approvedPower)}` : ""].filter(Boolean).join("　 ·  ");
    return `<article class="card"><h2><span class="badge ${record.area === "outdoor" ? "outdoor" : ""}">${areaLabel}</span><a class="title-link" href="#/project/${encodeURIComponent(record.id)}">${safe(heading)}</a></h2><p class="meta">${meta}</p><a class="detail-link" href="#/project/${encodeURIComponent(record.id)}">企画ページを開く →</a></article>`;
  }).join("");
}

function renderDetail(id) {
  const record = state.records.find(item => item.id === id);
  if (!record) { results.innerHTML = '<div class="empty">企画が見つかりませんでした。</div><a class="back-link" href="#/">← 一覧に戻る</a>'; status.textContent = ""; return; }
  status.textContent = "企画ページ";
  const areaLabel = record.area === "indoor" ? "屋内" : "屋外";
  const fields = [
    ["企画番号", record.projectNumber], ["団体", record.organization],
    [record.area === "indoor" ? "実施場所" : "テント番号", record.location || record.tentNumber],
    ["控室", record.area === "indoor" ? (record.controlRoom || record.otherText.match(/控室\s*([^。]+)/)?.[1] || "") : ""],
    ["許可電力", record.approvedPower], [record.area === "indoor" ? "使用系統" : "電ドラ情報", record.powerDetails]
  ].filter(([, value]) => value);
  const docs = new Map();
  for (const ref of record.references || []) {
    const key = `${ref.label}|${ref.file}`;
    if (!docs.has(key)) docs.set(key, { label: ref.label, file: ref.file, pages: [] });
    if (!docs.get(key).pages.includes(Number(ref.page) || 1)) docs.get(key).pages.push(Number(ref.page) || 1);
  }
  for (const ref of record.localReferences || []) {
    const source=localDocuments.find(doc=>doc.id===ref.docId);
    if(!source) continue;
    const key=`${ref.label}|local:${ref.docId}`;
    if(!docs.has(key)) docs.set(key,{label:ref.label,local:true,url:source.url,pages:[],pageStart:ref.pageStart,pageEnd:ref.pageEnd,pageCount:source.pageCount||ref.pageEnd});
    for(let page=ref.pageStart;page<=ref.pageEnd;page++) docs.get(key).pages.push(page);
  }
  const projectTerms=[record.projectNumber,record.projectName].map(normalize).filter(term=>term.length>1);
  const localWires=localDocuments.filter(doc=>{
    if(doc.type!=="配線図") return false;
    const scopeMatch=["全エリア",record.region,record.area==="indoor"?"屋内":"屋外"].filter(Boolean).includes(doc.area);
    const text=normalize(doc.terms);
    return scopeMatch||projectTerms.some(term=>text.includes(term));
  });
  for(const wire of localWires){const key=`配線図|local:${wire.id}`;if(!docs.has(key))docs.set(key,{label:`関連配線図 · ${wire.area}`,local:true,wholeFile:true,url:wire.url,pages:[],pageCount:wire.pageCount||1});}
  const fieldHtml = fields.map(([label, value]) => `<div class="detail-field"><dt>${safe(label)}</dt><dd>${safe(value)}</dd></div>`).join("");
  const docHtml = [...docs.values()].map((doc, index) => {
    const first = doc.wholeFile ? 1 : Math.min(...doc.pages);
    const pages = doc.wholeFile ? `PDF全体（${doc.pageCount}ページ）` : doc.pages.sort((a,b) => a-b).map(page => `<a href="${doc.local?doc.url:`data/${safe(doc.file)}`}#page=${page}" target="_blank" rel="noopener">${page}ページ</a>`).join("");
    const href=doc.local?doc.url:`data/${safe(doc.file)}`;
    return `<section class="document-panel"><h3>${safe(doc.label)}</h3><p class="page-links">該当ページ：${pages}</p><iframe title="${safe(doc.label)}、${first}ページ" src="${href}#page=${first}&toolbar=1" loading="${index > 0 ? "lazy" : "eager"}"></iframe><a class="open-pdf" href="${href}#page=${first}" target="_blank" rel="noopener">PDFを別画面で開く ↗</a></section>`;
  }).join("");
  results.innerHTML = `<a class="back-link" href="#/">← 検索一覧に戻る</a><article class="card detail-card"><p class="eyebrow">${areaLabel} · 企画詳細</p><h2>${safe(record.projectName || "名称未確認の企画")}</h2><dl class="detail-fields">${fieldHtml}</dl>${record.otherText ? `<p class="detail-note">${safe(record.otherText)}</p>` : ""}</article><h2 class="section-heading">関連資料</h2>${docHtml}`;
}

input.addEventListener("input", render);
document.querySelector("#clear").addEventListener("click", () => { input.value = ""; input.focus(); render(); });
document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach(b => { const active = b === button; b.classList.toggle("active", active); b.setAttribute("aria-pressed", String(active)); });
  render();
}));
window.addEventListener("hashchange", render);

if (window.FESTIVAL_DATA) {
  mergeGeneratedRecords(window.FESTIVAL_DATA.records);
  loadLocalDocuments().then(render);
} else {
  fetch("data/data.json").then(response => { if (!response.ok) throw new Error("data.json を読めません"); return response.json(); })
    .then(data => { mergeGeneratedRecords(data.records); return loadLocalDocuments(); })
    .then(render)
    .catch(error => { status.textContent = "検索データを読み込めません。READMEの起動方法を確認してください。"; console.error(error); });
}
const list=document.createElement("section"); list.id="document-results"; list.className="results"; document.querySelector(".search-panel").after(list); documentResults=list;

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(console.warn));
}
}

if (typeof module !== "undefined") module.exports = { normalize, searchable };

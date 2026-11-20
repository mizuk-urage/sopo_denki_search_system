const CACHE = "festival-search-v10";
const CORE_FILES = ["./", "./index.html", "./styles.css", "./app.js", "./pdf-import.js", "./vendor/pdfjs/pdf.min.js", "./vendor/pdfjs/pdf.worker.min.js", "./vendor/pdfjs/assets.json", "./manifest.webmanifest", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png", "./data/data.json"];

self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE_FILES.map(file => new URL(file, self.registration.scope).href));
  const pdfAssetsResponse = await cache.match(new URL("./vendor/pdfjs/assets.json", self.registration.scope).href);
  const pdfAssets = await pdfAssetsResponse.json();
  const pdfSupportFiles = [
    ...pdfAssets.cmaps.map(file => `./vendor/pdfjs/cmaps/${encodeURIComponent(file)}`),
    ...pdfAssets.standardFonts.map(file => `./vendor/pdfjs/standard_fonts/${encodeURIComponent(file)}`)
  ].map(file => new URL(file, self.registration.scope).href);
  for (let index = 0; index < pdfSupportFiles.length; index += 24) {
    await cache.addAll(pdfSupportFiles.slice(index, index + 24));
  }
  const dataResponse = await cache.match(new URL("./data/data.json", self.registration.scope).href);
  const data = await dataResponse.json();
  const pdfs = [...new Set(data.records.flatMap(record => record.references || []).map(reference => {
    const url = new URL(`./data/${reference.file}`, self.registration.scope);
    if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL("./data/", self.registration.scope).pathname)) {
      throw new Error(`Invalid data reference: ${reference.file}`);
    }
    return url.href;
  }))];
  await cache.addAll(pdfs);
})()));

self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys =>
  Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
)));

self.addEventListener("fetch", event => event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
  if (event.request.method === "GET" && new URL(event.request.url).origin === self.location.origin) {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
  }
  return response;
}))));

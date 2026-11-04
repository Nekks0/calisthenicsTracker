'use strict';
// Ernährung: Einträge, Barcode-Scanner und Kalorienrechner.

// ---------- Einträge ----------
function addFood(k, f, meal = ui.meal) {
  const now = new Date();
  (state.nutrition[k] = state.nutrition[k] || []).push({
    id: uid(), name: f.name, kcal: num(f.kcal), protein: round1(f.protein), carbs: round1(f.carbs), fat: round1(f.fat),
    meal: MEALS.some(m => m.id === meal) ? meal : 'snack',
    time: k === today() ? `${pad(now.getHours())}:${pad(now.getMinutes())}` : '',
  });
  save(); render();
  toast(`✓ ${f.name} hinzugefügt`);
}

// ---------- Barcode-Scanner (Nährwerte von Open Food Facts) ----------
// Chrome/Android hat einen eingebauten BarcodeDetector, sonst wird ein Polyfill (ZXing/WASM) nachgeladen.
const BARCODE_POLYFILL = 'https://cdn.jsdelivr.net/npm/barcode-detector@2.2.11/dist/es/pure.min.js';
const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const scan = { id: 0, stream: null, timer: null, detector: null };

async function getDetector() {
  if (scan.detector) return scan.detector;
  let Detector = window.BarcodeDetector;
  if (Detector) {
    try { if (!(await Detector.getSupportedFormats()).includes('ean_13')) Detector = null; }
    catch (e) { Detector = null; }
  }
  if (!Detector) Detector = (await import(BARCODE_POLYFILL)).BarcodeDetector;
  scan.detector = new Detector({ formats: BARCODE_FORMATS });
  return scan.detector;
}

// Jeder Aufruf macht laufende Scans und Suchen ungültig (scan.id)
function stopScanner() {
  scan.id++;
  clearTimeout(scan.timer);
  scan.stream?.getTracks().forEach(t => t.stop());
  scan.stream = null;
}

function openScanner() {
  openModal('Barcode scannen', `
    <div class="scanner" id="scanBox"><video id="scanVideo" playsinline muted></video><div class="scan-frame"></div></div>
    <p class="tip" id="scanMsg">Kamera wird gestartet …</p>
    <form data-form="barcode" class="row mt">
      <input type="text" name="code" inputmode="numeric" autocomplete="off" placeholder="Oder Barcode eintippen" class="grow">
      <button class="btn">Suchen</button>
    </form>
    <small class="tip">Nährwerte von Open Food Facts. Gescannte Produkte bleiben auch offline gespeichert.</small>`);
  startScanner();
}

async function startScanner() {
  stopScanner();
  const id = scan.id;
  const msg = text => { const el = $('#scanMsg'); if (el) el.textContent = text; };
  const fail = text => { stopScanner(); msg(text); $('#scanBox')?.remove(); };
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    fail('📷 Die Kamera braucht HTTPS oder localhost. Gib den Barcode unten ein.');
    return;
  }
  try {
    const detector = await getDetector();
    if (id !== scan.id) return;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (id !== scan.id) { stream.getTracks().forEach(t => t.stop()); return; }
    scan.stream = stream;
    const video = $('#scanVideo');
    video.srcObject = stream;
    await video.play();
    if (id !== scan.id) return;
    msg('Halte den Barcode in den Rahmen.');
    let errors = 0;
    const loop = async () => {
      if (id !== scan.id) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          if (id !== scan.id) return;
          errors = 0;
          if (codes.length) {
            if (navigator.vibrate) navigator.vibrate(60);
            lookupBarcode(codes[0].rawValue);
            return;
          }
        }
      } catch (e) {
        if (++errors > 15) { fail('Scanner funktioniert hier nicht. Gib den Barcode unten ein.'); return; }
      }
      scan.timer = setTimeout(loop, 200);
    };
    loop();
  } catch (e) {
    if (id !== scan.id) return;
    fail(e?.name === 'NotAllowedError' ? '🚫 Kamerazugriff verweigert. Erlaube die Kamera in den Browser-Einstellungen oder gib den Barcode unten ein.'
      : e?.name === 'NotFoundError' ? 'Keine Kamera gefunden. Gib den Barcode unten ein.'
      : 'Scanner konnte nicht gestartet werden (offline?). Gib den Barcode unten ein.');
  }
}

async function lookupBarcode(raw) {
  const code = String(raw || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) { toast('Ungültiger Barcode (8–14 Ziffern)'); return; }
  stopScanner();
  const id = scan.id;
  if (state.products[code]) { showProduct(state.products[code]); return; }
  openModal('Produkt wird gesucht …', `<div class="empty">⏳ Lade Nährwerte für ${code} …</div>`);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_de,brands,nutriments,serving_quantity`);
    const data = await res.json();
    if (id !== scan.id) return;
    if (data.status !== 1 || !data.product) {
      openModal('Produkt nicht gefunden', `
        <p class="muted">Zum Barcode <b>${code}</b> gibt es keine Daten bei Open Food Facts. Trag die Nährwerte von der Verpackung manuell ein.</p>
        <div class="row mt"><button class="btn ghost grow" data-action="scan-open">Erneut scannen</button><button class="btn grow" data-action="food-focus">Manuell eintragen</button></div>`);
      return;
    }
    const prod = parseProduct(code, data.product);
    state.products[code] = prod;
    save();
    showProduct(prod);
  } catch (e) {
    if (id !== scan.id) return;
    openModal('Keine Verbindung', `
      <p class="muted">Die Produktdaten konnten nicht geladen werden. Prüfe deine Internetverbindung.</p>
      <div class="row mt"><button class="btn ghost grow" data-action="close-modal">Schließen</button><button class="btn grow" data-action="scan-lookup" data-code="${code}">Erneut versuchen</button></div>`);
  }
}

function parseProduct(code, p) {
  const n = p.nutriments || {};
  const val = key => (n[key] == null || n[key] === '' ? null : num(n[key], null));
  let kcal = val('energy-kcal_100g');
  if (kcal == null && val('energy_100g') != null) kcal = val('energy_100g') / 4.184; // energy_100g ist in kJ
  const name = String(p.product_name_de || p.product_name || '').trim();
  const brand = String(p.brands || '').split(',')[0].trim();
  return {
    code,
    name: [name, brand].filter(Boolean).join(' · ') || `Produkt ${code}`,
    per100: { kcal: kcal == null ? null : Math.round(kcal), protein: val('proteins_100g'), carbs: val('carbohydrates_100g'), fat: val('fat_100g') },
    serving: Math.max(0, num(p.serving_quantity)),
  };
}

function portion(prod, g) {
  const v = k => num(prod.per100[k]) * g / 100;
  return { name: `${prod.name} (${fmt1(g)} g)`, kcal: Math.round(v('kcal')), protein: round1(v('protein')), carbs: round1(v('carbs')), fat: round1(v('fat')) };
}

function scanPreview(prod, g) {
  const f = portion(prod, g);
  return `
    <div class="stat"><b style="color:var(--kcal)">${fmtNum(f.kcal)}</b><small>kcal</small></div>
    <div class="stat"><b style="color:var(--protein)">${fmt1(f.protein)} g</b><small>Protein</small></div>
    <div class="stat"><b style="color:var(--carbs)">${fmt1(f.carbs)} g</b><small>Kohlenhydrate</small></div>
    <div class="stat"><b style="color:var(--fat)">${fmt1(f.fat)} g</b><small>Fett</small></div>`;
}

function showProduct(prod) {
  ui.scanned = prod;
  const p = prod.per100;
  const incomplete = Object.values(p).some(v => v == null);
  const amount = prod.serving || 100;
  openModal('Produkt gefunden', `
    <h3>${esc(prod.name)}</h3>
    <small>Pro 100 g: ${p.kcal == null ? '?' : fmtNum(p.kcal)} kcal · ${macroLine(p)}</small>
    ${incomplete ? '<p class="tip">⚠️ Nicht alle Nährwerte sind hinterlegt. Fehlende Werte zählen als 0.</p>' : ''}
    <form data-form="scanned" data-live="scanned" class="mt">
      <div class="grid2">
        <label class="field"><span>Menge (g / ml)</span><input type="number" name="amount" inputmode="decimal" min="1" step="any" value="${amount}" required></label>
        <label class="field"><span>Mahlzeit</span>${mealSelect(ui.meal)}</label>
      </div>
      <div class="chips" style="margin-bottom:12px">
        ${prod.serving ? `<button type="button" class="chip" data-action="scan-amount" data-g="${prod.serving}">1 Portion (${fmt1(prod.serving)} g)</button>` : ''}
        ${[50, 100, 200].map(g => `<button type="button" class="chip" data-action="scan-amount" data-g="${g}">${g} g</button>`).join('')}
      </div>
      <div class="grid2" id="scanPreview">${scanPreview(prod, amount)}</div>
      <label class="checkbox mt"><input type="checkbox" name="fav"> Als Favorit speichern</label>
      <button class="btn block">Hinzufügen</button>
    </form>`);
}

// ---------- Kalorienrechner (Mifflin-St-Jeor) ----------
const calcInput = fd => ({
  sex: fd.get('sex') === 'f' ? 'f' : 'm',
  age: num(fd.get('age')),
  height: num(fd.get('height')),
  weight: num(fd.get('weight')),
  activity: num(fd.get('activity'), 1.55),
  calGoal: fd.get('calGoal'),
});
const calcValid = o => o.age >= 14 && o.age <= 100 && o.height >= 120 && o.height <= 230 && o.weight >= 30 && o.weight <= 300;

function calcTargets(o) {
  const goal = CALORIE_GOALS.find(g => g.id === o.calGoal) || CALORIE_GOALS[2];
  const bmr = 10 * o.weight + 6.25 * o.height - 5 * o.age + (o.sex === 'f' ? -161 : 5);
  const tdee = bmr * o.activity;
  const kcal = Math.max(o.sex === 'f' ? 1200 : 1500, Math.round((tdee + goal.delta) / 10) * 10);
  const protein = Math.round(o.weight * goal.protein);
  const fat = Math.round(kcal * 0.25 / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, carbs, fat };
}

function calcResult(o) {
  if (!calcValid(o)) return '<p class="tip">Bitte gib gültige Werte ein (Alter 14–100, Größe 120–230 cm, Gewicht 30–300 kg).</p>';
  const r = calcTargets(o);
  return `
    <div class="grid2">
      <div class="stat"><b>${fmtNum(r.bmr)}</b><small>Grundumsatz (kcal)</small></div>
      <div class="stat"><b>${fmtNum(r.tdee)}</b><small>Gesamtumsatz (kcal)</small></div>
    </div>
    <div class="stat mt"><b style="color:var(--kcal)">${fmtNum(r.kcal)} kcal</b><small>Dein Tagesziel</small></div>
    <div class="grid3 mt">
      <div class="stat"><b style="color:var(--protein)">${r.protein} g</b><small>Protein</small></div>
      <div class="stat"><b style="color:var(--carbs)">${r.carbs} g</b><small>Kohlenhydrate</small></div>
      <div class="stat"><b style="color:var(--fat)">${r.fat} g</b><small>Fett</small></div>
    </div>`;
}

function openCalculator() {
  const s = state.settings;
  openModal('Kalorienrechner', `
    <form data-form="calc" data-live="calc">
      <div class="grid2">
        <label class="field"><span>Geschlecht</span><select name="sex">
          <option value="m" ${s.sex !== 'f' ? 'selected' : ''}>Männlich</option>
          <option value="f" ${s.sex === 'f' ? 'selected' : ''}>Weiblich</option>
        </select></label>
        <label class="field"><span>Alter</span><input type="number" name="age" inputmode="numeric" min="14" max="100" value="${s.age}" required></label>
        <label class="field"><span>Größe (cm)</span><input type="number" name="height" inputmode="numeric" min="120" max="230" value="${s.height}" required></label>
        <label class="field"><span>Gewicht (kg)</span><input type="number" name="weight" inputmode="decimal" min="30" max="300" step="0.1" value="${s.weight}" required></label>
      </div>
      <label class="field"><span>Aktivität</span><select name="activity">${ACTIVITY_LEVELS.map(a =>
        `<option value="${a.value}" ${+a.value === +s.activity ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>
      <label class="field"><span>Ziel</span><select name="calGoal">${CALORIE_GOALS.map(g =>
        `<option value="${g.id}" ${g.id === s.calGoal ? 'selected' : ''}>${g.name}</option>`).join('')}</select></label>
      <div id="calcOut">${calcResult(s)}</div>
      <p class="tip">Berechnung nach Mifflin-St-Jeor. Protein je nach Ziel 1,8–2,2 g pro kg, Fett 25 % der Kalorien, der Rest Kohlenhydrate. Das sind Richtwerte – passe sie nach 2–3 Wochen an deinen Fortschritt an.</p>
      <button class="btn block mt">Als Ziele übernehmen</button>
    </form>`);
}

function focusFoodForm() {
  const sel = $('[data-meal-select]');
  if (sel) sel.value = ui.meal;
  $('#foodCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => $('[data-form=food] input[name=name]')?.focus({ preventScroll: true }), 350);
}

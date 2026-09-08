const CATEGORIA_LABEL = {
  concerto_live: "Concerto",
  dj_set_club: "DJ Set",
};

const CATEGORIA_ICON = {
  concerto_live: "🎤",
  dj_set_club: "🎧",
};

const state = {
  events: [],       // tutti gli eventi futuri, ordinati per data
  filtered: [],      // eventi dopo il filtro attivo
  activeFilter: null, // 'oggi' | 'domani' | 'weekend' | 'data' | null
};

const el = {
  quickFilters: document.getElementById("quick-filters"),
  datePicker: document.getElementById("date-picker"),
  activeFilterBar: document.getElementById("active-filter-bar"),
  activeFilterLabel: document.getElementById("active-filter-label"),
  clearFilter: document.getElementById("clear-filter"),
  eventCount: document.getElementById("event-count"),
  eventList: document.getElementById("event-list"),
  emptyState: document.getElementById("empty-state"),
  screenList: document.getElementById("screen-list"),
  screenDetail: document.getElementById("screen-detail"),
  detailContent: document.getElementById("detail-content"),
  btnBack: document.getElementById("btn-back"),
};

init();

async function init() {
  await loadEvents();
  wireUpFilters();
  applyFilter(null);

  el.btnBack.addEventListener("click", showListScreen);
}

const CITTA_APP = "Milano";

async function loadEvents() {
  const res = await fetch("eventi_output.json");
  const data = await res.json();

  // La pipeline raccoglie eventi anche da fonti fuori Milano (es. MantovaSoon,
  // che copre l'area di Mantova); questa webapp mostra solo "Milano" in
  // intestazione, quindi va filtrata di conseguenza. I dati di altre città
  // restano intatti in eventi_output.json per un futuro supporto multi-città.
  const oggiMezzanotte = startOfDay(new Date());
  state.events = data
    .filter((e) => e.citta === CITTA_APP)
    .filter((e) => e.data && new Date(e.data) >= oggiMezzanotte)
    .sort((a, b) => new Date(a.data) - new Date(b.data));
}

function wireUpFilters() {
  el.quickFilters.querySelectorAll(".filter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const filtro = btn.dataset.filter;
      if (filtro === "data") {
        el.datePicker.classList.remove("hidden");
        el.datePicker.focus();
        // il filtro si applica quando l'utente sceglie effettivamente una data
        return;
      }
      el.datePicker.classList.add("hidden");
      setActiveChip(btn);
      applyFilter(filtro);
    });
  });

  el.datePicker.addEventListener("change", () => {
    if (!el.datePicker.value) return;
    setActiveChip(el.quickFilters.querySelector('[data-filter="data"]'));
    applyFilter("data", el.datePicker.value);
  });

  el.clearFilter.addEventListener("click", () => {
    el.datePicker.classList.add("hidden");
    el.datePicker.value = "";
    setActiveChip(null);
    applyFilter(null);
  });
}

function setActiveChip(activeBtn) {
  el.quickFilters.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
  if (activeBtn) activeBtn.classList.add("active");
}

function applyFilter(tipo, valoreData) {
  state.activeFilter = tipo;
  const oggi = startOfDay(new Date());

  let risultato = state.events;
  let etichetta = "";

  if (tipo === "oggi") {
    risultato = state.events.filter((e) => isSameDay(new Date(e.data), oggi));
    etichetta = "Eventi di oggi";
  } else if (tipo === "domani") {
    const domani = addDays(oggi, 1);
    risultato = state.events.filter((e) => isSameDay(new Date(e.data), domani));
    etichetta = "Eventi di domani";
  } else if (tipo === "weekend") {
    const [sabato, domenica] = getWeekendRange(oggi);
    risultato = state.events.filter((e) => {
      const d = startOfDay(new Date(e.data));
      return d >= sabato && d <= domenica;
    });
    etichetta = "Eventi questo weekend";
  } else if (tipo === "data" && valoreData) {
    const scelta = startOfDay(new Date(valoreData + "T00:00:00"));
    risultato = state.events.filter((e) => isSameDay(new Date(e.data), scelta));
    etichetta = `Eventi del ${scelta.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}`;
  } else {
    etichetta = "";
  }

  state.filtered = risultato;

  if (etichetta) {
    el.activeFilterLabel.textContent = etichetta;
    el.activeFilterBar.classList.remove("hidden");
  } else {
    el.activeFilterBar.classList.add("hidden");
  }

  renderList();
}

function renderList() {
  const eventi = state.filtered;
  el.eventCount.textContent = state.activeFilter
    ? `${eventi.length} event${eventi.length === 1 ? "o" : "i"} trovat${eventi.length === 1 ? "o" : "i"}`
    : `${eventi.length} eventi in programma`;

  el.eventList.innerHTML = "";

  if (eventi.length === 0) {
    el.emptyState.classList.remove("hidden");
    return;
  }
  el.emptyState.classList.add("hidden");

  const frammento = document.createDocumentFragment();
  eventi.forEach((evento) => frammento.appendChild(creaEventCard(evento)));
  el.eventList.appendChild(frammento);
}

function creaEventCard(evento) {
  const card = document.createElement("div");
  card.className = "event-card";
  card.addEventListener("click", () => showDetailScreen(evento));
  card.appendChild(creaThumb(evento, "event-thumb"));

  const info = document.createElement("div");
  info.className = "event-info";
  info.innerHTML = `
    <span class="badge ${evento.categoria_musicale}">${CATEGORIA_LABEL[evento.categoria_musicale] || evento.categoria_musicale}</span>
    <div class="event-title">${escapeHtml(evento.titolo)}</div>
    <div class="event-meta">${formatDataOra(evento.data)}</div>
    <div class="event-meta">${escapeHtml(evento.luogo || "")}</div>
  `;
  card.appendChild(info);
  return card;
}

// Costruita via DOM (non stringhe HTML concatenate): un'immagine con href
// pieno di virgolette dentro un attributo onerror="..." rompe il parsing
// dell'HTML circostante - qui l'errore di caricamento è un vero listener JS.
function creaThumb(evento, classeBase) {
  if (evento.immagine) {
    const img = document.createElement("img");
    img.className = classeBase;
    img.alt = "";
    // Senza lazy loading, una lista di centinaia di card farebbe partire
    // tutte le richieste immagine insieme: con le connessioni concorrenti
    // per dominio limitate dal browser, molte card resterebbero vuote per
    // diversi secondi. "lazy" le carica solo quando si avvicinano allo schermo.
    img.loading = "lazy";
    img.src = evento.immagine;
    img.addEventListener("error", () => img.replaceWith(creaThumbPlaceholder(evento, classeBase)), { once: true });
    return img;
  }
  return creaThumbPlaceholder(evento, classeBase);
}

function creaThumbPlaceholder(evento, classeBase) {
  const div = document.createElement("div");
  div.className = `${classeBase} placeholder`;
  div.textContent = CATEGORIA_ICON[evento.categoria_musicale] || "🎶";
  return div;
}

function showDetailScreen(evento) {
  el.detailContent.innerHTML = "";
  el.detailContent.appendChild(creaThumb(evento, "detail-hero"));
  el.detailContent.insertAdjacentHTML("beforeend", renderDetailBody(evento));
  el.screenList.classList.add("hidden");
  el.screenDetail.classList.remove("hidden");
  window.scrollTo(0, 0);
}

function showListScreen() {
  el.screenDetail.classList.add("hidden");
  el.screenList.classList.remove("hidden");
}

function renderDetailBody(evento) {
  const luogoIndirizzo = [evento.luogo, evento.indirizzo].filter(Boolean).join(" — ");

  let html = `
    <span class="badge detail-badge ${evento.categoria_musicale}">${CATEGORIA_LABEL[evento.categoria_musicale] || evento.categoria_musicale}</span>
    <h1 class="detail-title">${escapeHtml(evento.titolo)}</h1>
  `;

  if (evento.artista) {
    html += `<p class="detail-artist">${escapeHtml(evento.artista)}</p>`;
  }

  html += `
    <div class="detail-row">
      <div class="icon">🗓️</div>
      <div>
        <div class="label">Data e ora</div>
        <div class="value">${formatDataOraCompleta(evento.data)}</div>
      </div>
    </div>
  `;

  if (luogoIndirizzo) {
    html += `
      <div class="detail-row">
        <div class="icon">📍</div>
        <div>
          <div class="label">Luogo</div>
          <div class="value">${escapeHtml(luogoIndirizzo)}</div>
        </div>
      </div>
    `;
  }

  html += `<div class="detail-actions">`;
  if (evento.link_biglietti) {
    html += `<a class="btn btn-primary" href="${escapeAttr(evento.link_biglietti)}" target="_blank" rel="noopener">Biglietti</a>`;
  }
  if (evento.link_evento) {
    html += `<a class="btn btn-secondary" href="${escapeAttr(evento.link_evento)}" target="_blank" rel="noopener">Pagina della fonte</a>`;
  }
  html += `</div>`;

  return html;
}

/* ---------- date helpers ---------- */

function startOfDay(d) {
  const copia = new Date(d);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function addDays(d, n) {
  const copia = new Date(d);
  copia.setDate(copia.getDate() + n);
  return copia;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getWeekendRange(oggi) {
  const giorno = oggi.getDay(); // 0 = domenica ... 6 = sabato
  let offsetSabato;
  if (giorno === 6) offsetSabato = 0;
  else if (giorno === 0) offsetSabato = -1;
  else offsetSabato = 6 - giorno;
  const sabato = addDays(oggi, offsetSabato);
  const domenica = addDays(sabato, 1);
  return [sabato, domenica];
}

function formatDataOra(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const data = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${data} · ${ora}`;
}

function formatDataOraCompleta(iso) {
  if (!iso) return "Data da definire";
  const d = new Date(iso);
  const data = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${data.charAt(0).toUpperCase() + data.slice(1)}, ore ${ora}`;
}

/* ---------- sanitizzazione minima ---------- */

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return escapeHtml(str);
}

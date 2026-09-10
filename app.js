const CATEGORIA_LABEL = {
  concerto_live: "Concerto",
  dj_set_club: "DJ Set",
};

const CATEGORIA_ICON = {
  concerto_live: "🎤",
  dj_set_club: "🎧",
};

// Wrapper sicuro per Umami: lo script è caricato con "defer" da un dominio
// esterno e può non essere ancora pronto, o essere bloccato da un ad-blocker
// - senza questo controllo una chiamata a window.umami.track romperebbe
// silenziosamente l'interazione dell'utente (click, filtro) in quei casi.
function traccia(nomeEvento, dati) {
  if (window.umami) {
    window.umami.track(nomeEvento, dati);
  }
}

const GENERI = [
  { valore: "rap_hip_hop_urban", etichetta: "Rap/Hip Hop/Urban" },
  { valore: "elettronica_club", etichetta: "Elettronica/Club" },
  { valore: "rock_indie_punk", etichetta: "Rock/Indie/Punk" },
  { valore: "jazz_soul_funk", etichetta: "Jazz/Soul/Funk" },
  { valore: "pop_cantautorato", etichetta: "Pop/Cantautorato" },
  { valore: "altro", etichetta: "Altro" },
];

const state = {
  events: [],              // tutti gli eventi futuri, ordinati per data
  filtered: [],             // eventi dopo i filtri attivi
  filtroData: null,         // 'oggi' | 'domani' | 'weekend' | 'data' | null
  dataScelta: null,         // valore dell'input date, solo se filtroData === 'data'
  generiSelezionati: new Set(), // multi-selezione, combinata in AND col filtro data
};

const el = {
  quickFilters: document.getElementById("quick-filters"),
  genreFilters: document.getElementById("genre-filters"),
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
  creaChipGeneri();
  wireUpFilters();
  aggiornaLista();

  // Un link condiviso deve poter aprire direttamente la scheda di
  // quell'evento, non solo la lista - altrimenti "condividi" non avrebbe
  // molto senso per chi lo riceve.
  if (!apriEventoDaHash()) {
    showListScreen({ aggiornaUrl: false });
  }
  window.addEventListener("popstate", () => {
    if (!apriEventoDaHash()) {
      showListScreen({ aggiornaUrl: false });
    }
  });

  el.btnBack.addEventListener("click", () => showListScreen());
}

function apriEventoDaHash() {
  const match = location.hash.match(/^#evento=(.+)$/);
  if (!match) return false;
  const id = decodeURIComponent(match[1]);
  const evento = state.events.find((e) => e.id_dedup === id);
  if (!evento) return false;
  showDetailScreen(evento, { aggiornaUrl: false });
  return true;
}

const CITTA_APP = "Milano";

async function loadEvents() {
  // Cache-busting: gli hosting statici (es. GitHub Pages) mettono in cache
  // questo file per diversi minuti - senza un parametro sempre diverso,
  // un aggiornamento dei dati non comparirebbe subito per chi ha già
  // visitato la pagina di recente.
  const res = await fetch(`eventi_output.json?t=${Date.now()}`);
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

function creaChipGeneri() {
  el.genreFilters.innerHTML = "";
  GENERI.forEach(({ valore, etichetta }) => {
    const btn = document.createElement("button");
    btn.className = "filter-chip genre-chip";
    btn.dataset.genere = valore;
    btn.textContent = etichetta;
    el.genreFilters.appendChild(btn);
  });
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
      setActiveDateChip(btn);
      state.filtroData = filtro;
      state.dataScelta = null;
      traccia("filtro-data", { tipo: filtro });
      aggiornaLista();
    });
  });

  el.datePicker.addEventListener("change", () => {
    if (!el.datePicker.value) return;
    setActiveDateChip(el.quickFilters.querySelector('[data-filter="data"]'));
    state.filtroData = "data";
    state.dataScelta = el.datePicker.value;
    traccia("filtro-data", { tipo: "data-specifica" });
    aggiornaLista();
  });

  el.clearFilter.addEventListener("click", () => {
    el.datePicker.classList.add("hidden");
    el.datePicker.value = "";
    setActiveDateChip(null);
    state.filtroData = null;
    state.dataScelta = null;
    aggiornaLista();
  });

  // Genere: multi-selezione indipendente, combinata in AND col filtro data.
  el.genreFilters.querySelectorAll(".genre-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const genere = btn.dataset.genere;
      if (state.generiSelezionati.has(genere)) {
        state.generiSelezionati.delete(genere);
        btn.classList.remove("active");
      } else {
        state.generiSelezionati.add(genere);
        btn.classList.add("active");
        traccia("filtro-genere", { genere });
      }
      aggiornaLista();
    });
  });
}

function setActiveDateChip(activeBtn) {
  el.quickFilters.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
  if (activeBtn) activeBtn.classList.add("active");
}

// Restituisce l'etichetta della barra del filtro data e il suffisso da usare
// nel contatore (es. "per oggi"), separati perché la barra mostra solo il
// filtro data mentre il contatore deve poter aggiungere anche i generi scelti.
function etichettaFiltroData() {
  if (state.filtroData === "oggi") {
    return { etichetta: "Eventi di oggi", suffisso: "per oggi" };
  }
  if (state.filtroData === "domani") {
    return { etichetta: "Eventi di domani", suffisso: "per domani" };
  }
  if (state.filtroData === "weekend") {
    return { etichetta: "Eventi questo weekend", suffisso: "questo weekend" };
  }
  if (state.filtroData === "data" && state.dataScelta) {
    const scelta = startOfDay(new Date(state.dataScelta + "T00:00:00"));
    const dataFormattata = scelta.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
    return { etichetta: `Eventi del ${dataFormattata}`, suffisso: `per il ${dataFormattata}` };
  }
  return { etichetta: "", suffisso: "" };
}

function calcolaFiltrati() {
  const oggi = startOfDay(new Date());
  let risultato = state.events;

  if (state.filtroData === "oggi") {
    risultato = risultato.filter((e) => isSameDay(new Date(e.data), oggi));
  } else if (state.filtroData === "domani") {
    const domani = addDays(oggi, 1);
    risultato = risultato.filter((e) => isSameDay(new Date(e.data), domani));
  } else if (state.filtroData === "weekend") {
    const [sabato, domenica] = getWeekendRange(oggi);
    risultato = risultato.filter((e) => {
      const d = startOfDay(new Date(e.data));
      return d >= sabato && d <= domenica;
    });
  } else if (state.filtroData === "data" && state.dataScelta) {
    const scelta = startOfDay(new Date(state.dataScelta + "T00:00:00"));
    risultato = risultato.filter((e) => isSameDay(new Date(e.data), scelta));
  }

  if (state.generiSelezionati.size > 0) {
    risultato = risultato.filter((e) => state.generiSelezionati.has(e.genere_musicale));
  }

  return risultato;
}

function aggiornaLista() {
  const { etichetta } = etichettaFiltroData();

  if (etichetta) {
    el.activeFilterLabel.textContent = etichetta;
    el.activeFilterBar.classList.remove("hidden");
  } else {
    el.activeFilterBar.classList.add("hidden");
  }

  state.filtered = calcolaFiltrati();
  renderList();
}

function renderList() {
  const eventi = state.filtered;
  const { suffisso } = etichettaFiltroData();
  const nomiGeneriSelezionati = GENERI
    .filter((g) => state.generiSelezionati.has(g.valore))
    .map((g) => g.etichetta);
  const filtroAttivo = Boolean(suffisso) || nomiGeneriSelezionati.length > 0;

  // Senza alcun filtro, "eventi in programma" è un numero enorme e generico
  // (include date lontanissime nel futuro): darebbe l'idea fuorviante di
  // "eventi per te ora". Il contatore ha senso solo quando è contestualizzato
  // ad almeno un filtro scelto dall'utente (data e/o genere).
  if (filtroAttivo) {
    const parti = [suffisso, nomiGeneriSelezionati.join(", ")].filter(Boolean);
    el.eventCount.textContent =
      `${eventi.length} event${eventi.length === 1 ? "o" : "i"} trovat${eventi.length === 1 ? "o" : "i"} ${parti.join(" · ")}`;
    el.eventCount.classList.remove("hidden");
  } else {
    el.eventCount.textContent = "";
    el.eventCount.classList.add("hidden");
  }

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

function showDetailScreen(evento, { aggiornaUrl = true } = {}) {
  el.detailContent.innerHTML = "";
  el.detailContent.appendChild(creaThumb(evento, "detail-hero"));
  el.detailContent.insertAdjacentHTML("beforeend", renderDetailBody(evento));

  // Listener aggiunti via JS (non inline nell'HTML): il titolo evento può
  // contenere apici che romperebbero un attributo onclick="..." costruito
  // per concatenazione, stesso problema già risolto altrove per le immagini.
  const linkBiglietti = el.detailContent.querySelector('[data-track="biglietti"]');
  if (linkBiglietti) {
    linkBiglietti.addEventListener("click", () => traccia("click-biglietti", { evento: evento.titolo }));
  }
  const linkFonte = el.detailContent.querySelector('[data-track="fonte"]');
  if (linkFonte) {
    linkFonte.addEventListener("click", () => traccia("click-fonte", { evento: evento.titolo }));
  }
  const bottoneCondividi = el.detailContent.querySelector('[data-track="condividi"]');
  if (bottoneCondividi) {
    bottoneCondividi.addEventListener("click", () => condividiEvento(evento, bottoneCondividi));
  }

  el.screenList.classList.add("hidden");
  el.screenDetail.classList.remove("hidden");
  window.scrollTo(0, 0);

  // Aggiorna l'URL così la pagina del singolo evento è linkabile/condivisibile
  // direttamente. Non lo si fa quando si arriva già da un link con hash
  // (apriEventoDaHash) o da popstate, per non spingere una voce di history
  // duplicata sopra quella che c'è già.
  if (aggiornaUrl) {
    history.pushState({ evento: evento.id_dedup }, "", `#evento=${encodeURIComponent(evento.id_dedup)}`);
  }
}

function showListScreen({ aggiornaUrl = true } = {}) {
  el.screenDetail.classList.add("hidden");
  el.screenList.classList.remove("hidden");
  if (aggiornaUrl) {
    history.pushState({}, "", location.pathname + location.search);
  }
}

function urlDettaglioEvento(evento) {
  return `${location.origin}${location.pathname}#evento=${encodeURIComponent(evento.id_dedup)}`;
}

function urlGoogleMaps(evento) {
  const query = evento.indirizzo || `${evento.luogo || ""} ${evento.citta || ""}`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

async function condividiEvento(evento, bottone) {
  const url = urlDettaglioEvento(evento);
  const descrizione = [formatDataOra(evento.data), evento.luogo].filter(Boolean).join(" · ");

  if (navigator.share) {
    try {
      await navigator.share({ title: evento.titolo, text: descrizione, url });
      traccia("click-condividi", { evento: evento.titolo });
    } catch (err) {
      // L'utente ha annullato la condivisione dal foglio nativo: non è un
      // errore da segnalare, e per coerenza con "quando l'utente completa
      // un'azione di condivisione" non si traccia nemmeno l'evento.
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    traccia("click-condividi", { evento: evento.titolo });
    mostraConfermaCopia(bottone);
  } catch (err) {
    // Clipboard non disponibile (es. contesto non sicuro/permessi negati):
    // nessun fallback ulteriore per ora.
  }
}

function mostraConfermaCopia(bottone) {
  const testoOriginale = bottone.textContent;
  bottone.textContent = "✓ Link copiato!";
  bottone.disabled = true;
  setTimeout(() => {
    bottone.textContent = testoOriginale;
    bottone.disabled = false;
  }, 2000);
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
          <a class="maps-link" href="${escapeAttr(urlGoogleMaps(evento))}" target="_blank" rel="noopener">Apri in Maps ↗</a>
        </div>
      </div>
    `;
  }

  html += `<div class="detail-actions">`;
  if (evento.link_biglietti) {
    html += `<a class="btn btn-primary" data-track="biglietti" href="${escapeAttr(evento.link_biglietti)}" target="_blank" rel="noopener">Biglietti</a>`;
  }
  if (evento.link_evento) {
    html += `<a class="btn btn-secondary" data-track="fonte" href="${escapeAttr(evento.link_evento)}" target="_blank" rel="noopener">Pagina della fonte</a>`;
  }
  html += `<button type="button" class="btn btn-secondary" data-track="condividi">Condividi</button>`;
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

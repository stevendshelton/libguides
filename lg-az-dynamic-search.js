<script>
  /**
 * A–Z Database Search Enhancements (v8)
 *
 * v8 changes (Alpha-bar UX):
 *   - Active letter in the A–Z index bar is highlighted with a
 *     prominent pill/badge style so users know which filter is on.
 *   - A dismissible "filter chip" appears below the search bar
 *     (e.g.  ▸ Showing: "B" ✕ ) giving users an obvious reset.
 *   - Clicking the chip's ✕ triggers the "All" link, clearing
 *     the alpha filter.
 *   - Starting a text search while an alpha filter is active
 *     auto-clears the alpha filter to avoid conflicting states.
 *   - All prior improvements (v3–v7) carried forward.
 *
 * v7: JS-enforced Select2 font sizing
 * v6: CSS targeting for multi-select textarea
 * v5: font-size harmonization (single-select targets)
 * v4: clear native search on subject select
 * v3: MutationObserver, disable/enable search, clone input,
 *     debounce, scoring, a11y, AbortController
 */
(function () {
  "use strict";

  if (!location.pathname.includes("/az/databases")) return;

  /* ─── Inject styles (once) ─── */
  if (!document.getElementById("az-enhance-styles")) {
    const style = document.createElement("style");
    style.id = "az-enhance-styles";
    style.textContent = `
      /* ── Match Subjects dropdown to search input font size ── */

      .s-lg-az-search {
        font-size: 1rem !important;
      }

      /* === Select2 MULTI-SELECT variant === */

      .select2-container .select2-search--inline .select2-search__field,
      .select2-container--default .select2-search--inline .select2-search__field,
      .select2-container--default .select2-selection--multiple .select2-search--inline .select2-search__field,
      textarea.select2-search__field {
        font-size: 1rem !important;
      }

      .s-lg-sel-subjects + .select2-container .select2-selection--multiple,
      .select2-container .select2-selection--multiple {
        font-size: 1rem !important;
        min-height: 2.4em;
        display: flex;
        align-items: center;
      }

      .s-lg-sel-subjects + .select2-container .select2-selection__choice,
      .select2-container .select2-selection__choice {
        font-size: 1rem !important;
      }

      .s-lg-sel-subjects + .select2-container .select2-selection__choice__remove,
      .select2-container .select2-selection__choice__remove {
        font-size: 1rem !important;
      }

      /* === Select2 SINGLE-SELECT variant (fallback) === */

      .s-lg-sel-subjects + .select2-container .select2-selection--single {
        display: flex;
        align-items: center;
      }

      .s-lg-sel-subjects + .select2-container .select2-selection--single .select2-selection__rendered {
        font-size: 1rem !important;
      }

      .s-lg-sel-subjects + .select2-container .select2-selection__placeholder {
        font-size: 1rem !important;
      }

      /* === Dropdown list === */

      .select2-container--default .select2-results__option {
        font-size: 1rem !important;
      }

      .select2-container--default .select2-search--dropdown .select2-search__field {
        font-size: 1rem !important;
      }

      .s-lg-sel-subjects {
        font-size: 1rem !important;
      }

      /* ── Alpha-bar active letter highlighting ── */

      #s-lg-az-index a.az-letter-active {
        background-color: #1a3c5e !important;
        color: #fff !important;
        border-radius: 4px;
        padding: 2px 8px;
        text-decoration: none;
        font-weight: 700;
      }

      /* ── Alpha filter chip ── */

      .az-alpha-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 8px 0 4px 0;
        padding: 5px 14px;
        background: #e8eff5;
        border: 1px solid #b0c7de;
        border-radius: 20px;
        font-size: 0.92rem;
        font-weight: 600;
        color: #1a3c5e;
        line-height: 1;
      }

      .az-alpha-chip .az-chip-label {
        pointer-events: none;
      }

      .az-alpha-chip .az-chip-close {
        border: none;
        background: transparent;
        color: #1a3c5e;
        font-size: 16px;
        cursor: pointer;
        padding: 0 0 0 2px;
        line-height: 1;
        font-weight: 700;
        opacity: 0.7;
        transition: opacity 0.15s;
      }

      .az-alpha-chip .az-chip-close:hover {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  }

  /* ─── JS-enforced font-size on Select2 textareas ─── */
  const AZ_FONT_SIZE = "1rem";

  function enforceSubjectFontSize() {
    document.querySelectorAll(
      "textarea.select2-search__field, .select2-search--inline .select2-search__field"
    ).forEach(function (el) {
      if (el.style.fontSize !== AZ_FONT_SIZE) {
        el.style.setProperty("font-size", AZ_FONT_SIZE, "important");
      }
    });

    document.querySelectorAll(".select2-selection--multiple").forEach(function (el) {
      if (el.style.fontSize !== AZ_FONT_SIZE) {
        el.style.setProperty("font-size", AZ_FONT_SIZE, "important");
      }
    });

    document.querySelectorAll(".select2-selection__rendered").forEach(function (el) {
      if (el.style.fontSize !== AZ_FONT_SIZE) {
        el.style.setProperty("font-size", AZ_FONT_SIZE, "important");
      }
    });
  }

  enforceSubjectFontSize();
  setTimeout(enforceSubjectFontSize, 500);
  setTimeout(enforceSubjectFontSize, 1500);
  setTimeout(enforceSubjectFontSize, 3000);

  const select2Observer = new MutationObserver(function () {
    enforceSubjectFontSize();
  });

  select2Observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  });

  /* ─── State shared across init cycles ─── */
  let abortCtrl = null;

  function initAzSearchEnhancements() {

    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    const signal = abortCtrl.signal;

    /* ===========================
       BASIC PAGE ADJUSTMENTS
    =========================== */
    const alphaBar = document.getElementById("s-lg-az-index");
    const header   = document.getElementById("s-lib-public-header");

    if (header) {
      header.style.marginTop    = "0";
      header.style.marginBottom = "0";
      header.style.position     = "static";
    }

    /* ===========================
       SEARCH INPUT — CLONE TO
       STRIP NATIVE LISTENERS
    =========================== */
    const origInput = document.querySelector(".s-lg-az-search");
    if (!origInput) return;

    const input = origInput.cloneNode(true);
    origInput.parentNode.replaceChild(input, origInput);

    const defaultPlaceholder = input.placeholder || "Search databases";

    const form = input.closest("form");
    if (form) {
      form.addEventListener("submit", e => e.preventDefault(), { signal });
    }

    /* ===========================
       CLEAR (✕) BUTTON
    =========================== */
    const wrapper = input.parentNode;
    wrapper.style.position = "relative";

    const stale = wrapper.querySelector(".az-clear-btn");
    if (stale) stale.remove();

    const clearBtn = document.createElement("button");
    clearBtn.type       = "button";
    clearBtn.className  = "az-clear-btn";
    clearBtn.innerHTML  = "&#215;";
    clearBtn.setAttribute("aria-label", "Clear search");

    Object.assign(clearBtn.style, {
      position:   "absolute",
      right:      "10px",
      top:        "50%",
      transform:  "translateY(-50%)",
      border:     "none",
      background: "transparent",
      fontSize:   "18px",
      cursor:     "pointer",
      display:    "none",
      lineHeight: "1",
      padding:    "2px 6px",
      color:      "#555"
    });

    wrapper.appendChild(clearBtn);

    clearBtn.addEventListener("click", function () {
      input.value = "";
      clearBtn.style.display = "none";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }, { signal });

    /* ===========================
       MUTABLE STATE
    =========================== */
    let suspendTextFilter = false;

    /* ===========================
       COLLECT ITEMS + ORDER
    =========================== */
    function collectData() {
      const items    = document.querySelectorAll(".az-item");
      const headings = document.querySelectorAll(".s-lg-db-panel-title");

      const data = Array.from(items).map(item => {
        const titleEl = item.querySelector(".az-title");
        return {
          element: item,
          name: titleEl ? titleEl.textContent.trim().toLowerCase() : ""
        };
      });

      const container = items.length ? items[0].parentNode : null;
      const originalOrder = container
        ? Array.from(container.children)
        : [];

      return { items, headings, data, container, originalOrder };
    }

    let { items, headings, data, container, originalOrder } = collectData();

    /* ===========================
       RESULT COUNT (a11y)
    =========================== */
    const resultCount = document.getElementById("s-lg-az-result-count");
    if (resultCount) {
      resultCount.setAttribute("role", "status");
      resultCount.setAttribute("aria-live", "polite");
    }

    /* ===========================
       NO RESULTS MESSAGE
    =========================== */
    let noResults = document.getElementById("az-no-results");
    if (!noResults && container) {
      noResults = document.createElement("div");
      noResults.id          = "az-no-results";
      noResults.textContent = "No databases match your search.";
      noResults.style.display    = "none";
      noResults.style.padding    = "1rem 0";
      noResults.style.fontWeight = "600";
      noResults.style.fontSize   = "1rem";
      container.prepend(noResults);
    }

    /* ===========================
       CLEAR NATIVE LG SEARCH
    =========================== */
    function clearNativeSearchState() {
      try {
        if (window.springSpace && springSpace.azPublicObj) {
          springSpace.azPublicObj.clearAzSelection("s-lg-az-search");
        }
      } catch (_) {}

      document.querySelectorAll(".s-lg-az-search").forEach(el => {
        if (el !== input) el.value = "";
      });

      input.value            = "";
      clearBtn.style.display = "none";
    }

    /* ===========================
       DISABLE / ENABLE SEARCH
    =========================== */
    function disableSearch() {
      clearNativeSearchState();
      input.disabled           = true;
      input.style.opacity      = "0.55";
      input.style.cursor       = "not-allowed";
      input.placeholder        = "Clear subject filter to search";
    }

    function enableSearch() {
      input.disabled           = false;
      input.style.opacity      = "";
      input.style.cursor       = "";
      input.placeholder        = defaultPlaceholder;
    }

    /* ===========================
       ALPHA-BAR — DETECT STATE
       FROM URL ON PAGE LOAD
    =========================== */
    let activeAlphaLetter = null;

    function getAlphaFromURL() {
      const params = new URLSearchParams(window.location.search);
      const a = params.get("a");
      if (a && /^[a-z#]$/i.test(a)) return a.toUpperCase();
      return null;
    }

    function findAllLink() {
      if (!alphaBar) return null;
      const links = alphaBar.querySelectorAll("a");
      for (const link of links) {
        const text = link.textContent.trim().toLowerCase();
        if (text === "all") return link;
        // Also check href — "All" link usually has no ?a= param
        if (link.href && !link.href.includes("?a=")) return link;
      }
      return null;
    }

    function highlightActiveLetter(letter) {
      if (!alphaBar) return;
      // Remove previous highlights
      alphaBar.querySelectorAll("a.az-letter-active").forEach(a => {
        a.classList.remove("az-letter-active");
      });
      if (!letter) return;

      const links = alphaBar.querySelectorAll("a");
      for (const link of links) {
        if (link.textContent.trim().toUpperCase() === letter.toUpperCase()) {
          link.classList.add("az-letter-active");
          break;
        }
      }
    }

    /* ── Filter chip ── */
    function getOrCreateChipContainer() {
      let chipContainer = document.getElementById("az-alpha-chip-container");
      if (!chipContainer) {
        chipContainer = document.createElement("div");
        chipContainer.id = "az-alpha-chip-container";
        // Insert right after the search form area
        const searchForm = input.closest("form") || input.closest(".s-lg-az-search-bar") || wrapper.parentNode;
        if (searchForm && searchForm.parentNode) {
          searchForm.parentNode.insertBefore(chipContainer, searchForm.nextSibling);
        } else {
          // Fallback: insert before the alpha bar
          if (alphaBar && alphaBar.parentNode) {
            alphaBar.parentNode.insertBefore(chipContainer, alphaBar);
          }
        }
      }
      return chipContainer;
    }

    function showAlphaChip(letter) {
      const chipContainer = getOrCreateChipContainer();
      chipContainer.innerHTML = "";

      const chip = document.createElement("span");
      chip.className = "az-alpha-chip";

      const label = document.createElement("span");
      label.className = "az-chip-label";
      label.textContent = 'Showing: "' + letter.toUpperCase() + '"';

      const closeBtn = document.createElement("button");
      closeBtn.className  = "az-chip-close";
      closeBtn.type       = "button";
      closeBtn.innerHTML  = "&#215;";
      closeBtn.setAttribute("aria-label", "Clear letter filter");

      closeBtn.addEventListener("click", function () {
        clearAlphaFilter();
      }, { signal });

      chip.appendChild(label);
      chip.appendChild(closeBtn);
      chipContainer.appendChild(chip);
    }

    function hideAlphaChip() {
      const chipContainer = document.getElementById("az-alpha-chip-container");
      if (chipContainer) chipContainer.innerHTML = "";
    }

    function clearAlphaFilter() {
      const allLink = findAllLink();
      if (allLink) {
        allLink.click();   // navigates to the unfiltered page
      } else {
        // Fallback: navigate manually
        const url = new URL(window.location);
        url.searchParams.delete("a");
        window.location.href = url.toString();
      }
    }

    /* ── Apply alpha state on load ── */
    activeAlphaLetter = getAlphaFromURL();

    if (activeAlphaLetter) {
      highlightActiveLetter(activeAlphaLetter);
      showAlphaChip(activeAlphaLetter);
    }

    /* ===========================
       SUBJECT FILTER HANDLING
    =========================== */
    jQuery(".s-lg-sel-subjects").off("change.azEnhance")
      .on("change.azEnhance", function () {
        suspendTextFilter = true;
        disableSearch();
      });

    /* ===========================
       CLEAR / RESET BUTTONS
    =========================== */
    function hookClearButtons() {
      const selectors = [
        "#s-lg-az-btn-clear-all",
        ".az-btn-clear",
        ".s-lg-az-btn-clear",
        'button[data-action="clear"]',
        'a[data-action="clear"]'
      ];

      document.querySelectorAll(selectors.join(",")).forEach(btn => {
        btn.addEventListener("click", function () {
          setTimeout(() => {
            enableSearch();
            hideAlphaChip();
          }, 150);
        }, { signal });
      });

      document.querySelectorAll("button, a").forEach(el => {
        const txt = el.textContent.trim().toLowerCase();
        if (
          (txt.includes("clear") || txt.includes("reset")) &&
          el.closest(".s-lg-az-search-bar, .s-lg-az-filters, .s-lg-az-controls, form")
        ) {
          el.addEventListener("click", function () {
            setTimeout(() => {
              enableSearch();
              hideAlphaChip();
            }, 150);
          }, { signal });
        }
      });
    }

    hookClearButtons();

    /* ===========================
       MUTATION OBSERVER — AJAX
    =========================== */
    let mutationTimer = null;

    const contentObserver = new MutationObserver(function () {
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(function () {

        const refresh = collectData();
        items         = refresh.items;
        headings      = refresh.headings;
        data          = refresh.data;
        container     = refresh.container;
        originalOrder = refresh.originalOrder;

        if (!document.getElementById("az-no-results") && container) {
          noResults = document.createElement("div");
          noResults.id          = "az-no-results";
          noResults.textContent = "No databases match your search.";
          noResults.style.display    = "none";
          noResults.style.padding    = "1rem 0";
          noResults.style.fontWeight = "600";
          noResults.style.fontSize   = "1rem";
          container.prepend(noResults);
        }

        hookClearButtons();

        const subjectDd = document.querySelector(".s-lg-sel-subjects");
        const subjectVal = subjectDd ? jQuery(subjectDd).val() : null;
        const hasSubject = Array.isArray(subjectVal)
          ? subjectVal.length > 0
          : (subjectVal && subjectVal !== "" && subjectVal !== "0");

        if (hasSubject) {
          disableSearch();
        } else {
          enableSearch();
        }
      }, 200);
    });

    const azResults = document.getElementById("s-lg-az-content")
      || document.querySelector(".s-lg-az-result-list")
      || (container ? container.parentNode : null);

    if (azResults) {
      contentObserver.observe(azResults, { childList: true, subtree: true });
    }

    /* ===========================
       SCORING HELPERS
    =========================== */
    const noFuzzyWords = new Set([
      "arts", "business", "history", "music", "science", "news"
    ]);

    function fuzzyMatch(query, text) {
      let qi = 0, ti = 0;
      while (qi < query.length && ti < text.length) {
        if (query[qi] === text[ti]) qi++;
        ti++;
      }
      return qi === query.length;
    }

    function wordBoundaryMatch(query, name) {
      const re = new RegExp("\\b" + query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      return re.test(name);
    }

    function scoreMatch(query, name) {
      if (name === query) return 100;
      if (name.startsWith(query)) return 80;
      if (wordBoundaryMatch(query, name)) return 75;
      if (name.includes(query)) return 60;
      if (
        query.length >= 6 &&
        !noFuzzyWords.has(query) &&
        name.includes(query.slice(0, 3)) &&
        fuzzyMatch(query, name)
      ) return 40;
      return 0;
    }

    /* ===========================
       DEBOUNCE
    =========================== */
    let debounceTimer = null;

    function debounce(fn, ms) {
      return function () {
        const ctx = this, args = arguments;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fn.apply(ctx, args), ms);
      };
    }

    /* ===========================
       MAIN FILTER HANDLER
    =========================== */
    const filterHandler = debounce(function () {

      const raw   = input.value.trim();
      const query = raw.toLowerCase();

      clearBtn.style.display = raw ? "block" : "none";

      /* If subject filter just fired, ignore the blank reset */
      if (suspendTextFilter && query === "") return;
      suspendTextFilter = false;

      /* ── Auto-clear alpha filter if user starts typing ── */
      if (query.length > 0 && activeAlphaLetter) {
        clearAlphaFilter();      // navigates away — but set flag so chip hides
        return;                   // page will reload; nothing more to do
      }

      /* ── RESET when query is short ── */
      if (query.length < 3) {
        if (container) {
          originalOrder.forEach(child => container.appendChild(child));
        }
        data.forEach(db => (db.element.style.display = ""));
        headings.forEach(h => (h.style.display = ""));
        if (alphaBar) alphaBar.style.display = "";
        if (noResults) noResults.style.display = "none";

        if (resultCount) {
          resultCount.innerHTML =
            "<span>" + data.length + " Database" +
            (data.length !== 1 ? "s" : "") + "</span>";
        }
        return;
      }

      if (alphaBar) alphaBar.style.display = "none";

      /* ── Tokenize + AND matching ── */
      const tokens  = query.split(/\s+/).filter(Boolean);
      const matches = [];
      let visible   = 0;

      data.forEach(db => {
        let total = 0;
        const allHit = tokens.every(tok => {
          const s = scoreMatch(tok, db.name);
          total += s;
          return s > 0;
        });

        if (allHit) {
          db.element.style.display = "";
          matches.push({ db, score: total });
          visible++;
        } else {
          db.element.style.display = "none";
        }
      });

      /* ── Sort by score, then alpha ── */
      matches
        .sort((a, b) => b.score - a.score || a.db.name.localeCompare(b.db.name))
        .forEach(({ db }) => container && container.appendChild(db.element));

      /* ── No results ── */
      if (noResults) noResults.style.display = visible === 0 ? "" : "none";

      /* ── Headings ── */
      headings.forEach(heading => {
        let next = heading.nextElementSibling;
        let found = false;
        while (next && !next.classList.contains("s-lg-db-panel-title")) {
          if (
            next.classList.contains("az-item") &&
            next.style.display !== "none"
          ) { found = true; break; }
          next = next.nextElementSibling;
        }
        heading.style.display = found ? "" : "none";
      });

      /* ── Count ── */
      if (resultCount) {
        resultCount.innerHTML =
          "<span>" + visible + " Database" +
          (visible !== 1 ? "s" : "") + "</span>";
      }
    }, 150);

    input.addEventListener("input", filterHandler, { signal });
  }

  /* ═══════════════════════════════
     PAGE LIFECYCLE
  ═══════════════════════════════ */
  window.addEventListener("pageshow", function () {
    window.__azEnhancementsInitialized = false;

    const tryInit = () => {
      const input = document.querySelector(".s-lg-az-search");
      const items = document.querySelectorAll(".az-item");

      if (!input || items.length === 0) {
        setTimeout(tryInit, 100);
        return;
      }

      if (!window.__azEnhancementsInitialized) {
        window.__azEnhancementsInitialized = true;
        initAzSearchEnhancements();
      }
    };

    tryInit();
  });
})();

</script>
<script>
  /**
 * A–Z Database Search Enhancements (v7)
 *
 * v7 changes (JS-enforced Select2 font sizing):
 *   - CSS alone wasn't winning the specificity battle for the
 *     Select2 multi-select textarea placeholder.
 *   - Added `enforceSubjectFontSize()` which directly sets
 *     fontSize on the textarea element(s) via JS.
 *   - A dedicated MutationObserver watches the Select2 container
 *     and re-applies the font-size whenever Select2 re-renders.
 *   - Called on init and on every content mutation.
 *   - All prior improvements (v3–v6) carried forward.
 *
 * v6: CSS targeting for multi-select textarea
 * v5: font-size harmonization (single-select targets)
 * v4: clear native search on subject select
 * v3: MutationObserver, disable/enable search, clone input,
 *     debounce, scoring, a11y, AbortController
 */
(function () {
  "use strict";

  if (!location.pathname.includes("/az/databases")) return;

  /* ─── Inject font-size harmonization CSS (once) ─── */
  if (!document.getElementById("az-enhance-styles")) {
    const style = document.createElement("style");
    style.id = "az-enhance-styles";
    style.textContent = `
      /* ── Match Subjects dropdown to search input font size ── */

      /* The search input itself (baseline reference) */
      .s-lg-az-search {
        font-size: 1rem !important;
      }

      /* === Select2 MULTI-SELECT variant (what LibGuides uses) === */

      /* The textarea that shows the "Subjects" placeholder — max specificity */
      .select2-container .select2-search--inline .select2-search__field,
      .select2-container--default .select2-search--inline .select2-search__field,
      .select2-container--default .select2-selection--multiple .select2-search--inline .select2-search__field,
      textarea.select2-search__field {
        font-size: 1rem !important;
      }

      /* The overall multi-select selection box */
      .s-lg-sel-subjects + .select2-container .select2-selection--multiple,
      .select2-container .select2-selection--multiple {
        font-size: 1rem !important;
        min-height: 2.4em;
        display: flex;
        align-items: center;
      }

      /* Selected tag pills inside the multi-select */
      .s-lg-sel-subjects + .select2-container .select2-selection__choice,
      .select2-container .select2-selection__choice {
        font-size: 1rem !important;
      }

      /* Remove button inside tags */
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

      /* === Dropdown list (shared by both variants) === */

      .select2-container--default .select2-results__option {
        font-size: 1rem !important;
      }

      /* Search box inside the dropdown panel */
      .select2-container--default .select2-search--dropdown .select2-search__field {
        font-size: 1rem !important;
      }

      /* Fallback: native <select> if Select2 doesn't load */
      .s-lg-sel-subjects {
        font-size: 1rem !important;
      }

      /* Enhancements for the custom A–Z search UI */
      .az-search-wrapper {
        position: relative;
      }

      .az-clear-btn {
        display: none;
      }

      .az-clear-btn.is-visible {
        display: block;
      }

      .az-enhanced-search.is-disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      .az-item.is-hidden {
        display: none !important;
      }

      .s-lg-db-panel-title.is-hidden {
        display: none !important;
      }

      .az-no-results {
        display: none;
        padding: 1rem 0;
        font-weight: 600;
        font-size: 1rem;
      }

      .az-no-results.is-visible {
        display: block;
      }

      .az-status {
        display: none;
        padding: 0 0 0.5rem;
        font-size: 0.95rem;
        color: #555;
      }

      .az-status.is-visible {
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  /* ─── JS-enforced font-size on Select2 textareas ─── */
  const AZ_FONT_SIZE = "1rem";

  function enforceSubjectFontSize() {
    // Target ALL Select2 search textareas (covers any rendering variant)
    document.querySelectorAll(
      "textarea.select2-search__field, .select2-search--inline .select2-search__field"
    ).forEach(function (el) {
      if (el.style.fontSize !== AZ_FONT_SIZE) {
        el.style.setProperty("font-size", AZ_FONT_SIZE, "important");
      }
    });

    // Also hit the multi-select container
    document.querySelectorAll(".select2-selection--multiple").forEach(function (el) {
      if (el.style.fontSize !== AZ_FONT_SIZE) {
        el.style.setProperty("font-size", AZ_FONT_SIZE, "important");
      }
    });

    // And the rendered text in single-select fallback
    document.querySelectorAll(".select2-selection__rendered").forEach(function (el) {
      if (el.style.fontSize !== AZ_FONT_SIZE) {
        el.style.setProperty("font-size", AZ_FONT_SIZE, "important");
      }
    });
  }

  // Run immediately
  enforceSubjectFontSize();

  // Run again after a short delay (Select2 may init late)
  setTimeout(enforceSubjectFontSize, 500);
  setTimeout(enforceSubjectFontSize, 1500);
  setTimeout(enforceSubjectFontSize, 3000);

  // Watch for Select2 re-renders and re-apply
  const select2Observer = new MutationObserver(function () {
    enforceSubjectFontSize();
  });

  // Observe the body for Select2 DOM changes (it can re-render anywhere)
  select2Observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  });

  /* ─── State shared across init cycles ─── */
  let abortCtrl = null;

  function initAzSearchEnhancements() {

    /* === Cleanup previous run (bfcache / re-init) === */
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
    input.classList.add("az-enhanced-search");
    origInput.parentNode.replaceChild(input, origInput);

    const defaultPlaceholder = input.placeholder || "Search databases";

    // Also prevent form submission
    const form = input.closest("form");
    if (form) {
      form.addEventListener("submit", e => e.preventDefault(), { signal });
    }

    /* ===========================
       CLEAR (✕) BUTTON
    =========================== */
    const wrapper = input.parentNode;
    wrapper.classList.add("az-search-wrapper");
    wrapper.style.position = "relative";

    // Remove any leftover clear button from a prior init
    const stale = wrapper.querySelector(".az-clear-btn");
    if (stale) stale.remove();

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "az-clear-btn";
    clearBtn.innerHTML = "&#215;";
    clearBtn.setAttribute("aria-label", "Clear search");

    Object.assign(clearBtn.style, {
      position: "absolute",
      right: "10px",
      top: "50%",
      transform: "translateY(-50%)",
      border: "none",
      background: "transparent",
      fontSize: "18px",
      cursor: "pointer",
      lineHeight: "1",
      padding: "2px 6px",
      color: "#555"
    });

    wrapper.appendChild(clearBtn);

    clearBtn.addEventListener("click", function () {
      input.value = "";
      updateClearButtonVisibility();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }, { signal });

    /* ===========================
       MUTABLE STATE
    =========================== */
    let subjectActive = false;   // true while a subject filter is selected
    let data          = [];      // { element, name } for each .az-item
    let originalOrder = [];      // snapshot of container children
    let container     = null;    // parent of .az-item elements
    let headings      = [];      // .s-lg-db-panel-title NodeList/Array
    let noResults     = null;    // "No databases match" element
    let statusEl      = null;    // live region for result messages

    function updateClearButtonVisibility() {
      clearBtn.classList.toggle("is-visible", input.value.trim() !== "");
    }

    function updateStatusMessage(message) {
      if (statusEl) {
        statusEl.textContent = message;
        statusEl.classList.toggle("is-visible", Boolean(message));
      }
    }

    function updateResultCount(n) {
      const el = document.getElementById("s-lg-az-result-count");
      if (!el) return;
      const label = n === 1 ? "Database" : "Databases";
      el.textContent = `${n} ${label}`;
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.setAttribute("aria-atomic", "true");
    }

    function setInputDisabledState(isDisabled, placeholderText) {
      subjectActive = isDisabled;
      input.disabled = isDisabled;
      input.placeholder = placeholderText;
      input.classList.toggle("is-disabled", isDisabled);
      input.style.opacity = isDisabled ? "0.55" : "";
      input.style.cursor = isDisabled ? "not-allowed" : "";
    }

    /* ===========================
       (RE-)COLLECT DOM DATA
       Called on init and after
       every AJAX content swap.
    =========================== */
    function collectData() {
      const items = document.querySelectorAll(".az-item");
      headings    = Array.from(document.querySelectorAll(".s-lg-db-panel-title"));

      if (items.length === 0) {
        data = [];
        originalOrder = [];
        container = null;
        return false;
      }

      container = items[0].parentNode;

      // Snapshot original DOM order
      originalOrder = Array.from(container.children);

      // Build searchable data
      data = Array.from(items).map(item => {
        const titleEl = item.querySelector(".az-title");
        return {
          element: item,
          name: titleEl ? titleEl.textContent.trim().toLowerCase() : ""
        };
      });

      // Ensure no-results element exists inside the (possibly new) container
      ensureNoResultsEl();

      return true;
    }

    function ensureNoResultsEl() {
      // If we already have one in this container, reuse it
      if (noResults && noResults.parentNode === container) return;

      // Check if one exists in the container already
      let existing = container
        ? container.querySelector("#az-no-results")
        : document.getElementById("az-no-results");

      if (existing) {
        noResults = existing;
      } else if (container) {
        noResults = document.createElement("div");
        noResults.id = "az-no-results";
        noResults.className = "az-no-results";
        noResults.setAttribute("role", "status");
        container.prepend(noResults);
      }

      if (noResults) {
        noResults.textContent = "No databases match your search.";
        noResults.classList.remove("is-visible");
      }
    }

    function ensureStatusEl() {
      if (statusEl && statusEl.parentNode === container) return;

      if (!container) {
        statusEl = null;
        return;
      }

      const existing = container.querySelector("#az-status");
      if (existing) {
        statusEl = existing;
      } else {
        statusEl = document.createElement("div");
        statusEl.id = "az-status";
        statusEl.className = "az-status";
        statusEl.setAttribute("role", "status");
        statusEl.setAttribute("aria-live", "polite");
        statusEl.setAttribute("aria-atomic", "true");
        container.insertBefore(statusEl, noResults || container.firstChild);
      }

      if (statusEl) {
        statusEl.textContent = "";
        statusEl.classList.remove("is-visible");
      }
    }

    /* ===========================
       DISABLE / ENABLE SEARCH
    =========================== */
    function clearNativeSearchState() {
      // Tell LibGuides to drop its internal search token
      try {
        if (window.springSpace && springSpace.azPublicObj) {
          springSpace.azPublicObj.clearAzSelection("s-lg-az-search");
        }
      } catch (_) { /* swallow */ }

      // Also blank any native (un-cloned) copies of the search box
      document.querySelectorAll(".s-lg-az-search").forEach(function (el) {
        if (el !== input) el.value = "";
      });
    }

    function disableSearch() {
      input.value = "";
      clearNativeSearchState();
      setInputDisabledState(true, "Clear subject filter to search");
      updateClearButtonVisibility();
    }

    function enableSearch() {
      setInputDisabledState(false, defaultPlaceholder);
    }

    /* ===========================
       SUBJECT DROPDOWN HANDLER
    =========================== */
    jQuery(".s-lg-sel-subjects")
      .off("change.azEnhance")
      .on("change.azEnhance", function () {
        const val = jQuery(this).val();

        // val is null, empty string, empty array, or [""] → no subject selected
        const hasSubject = Array.isArray(val)
          ? val.filter(v => v !== "").length > 0
          : val !== "" && val !== null;

        if (hasSubject) {
          disableSearch();
        } else {
          enableSearch();
        }
      });

    /* ===========================
       CLEAR / RESET BUTTONS
    =========================== */
    function hookClearButtons() {
      const selectors = [
        "#s-lg-az-btn-clear-all",
        ".az-btn-clear",
        ".btn-clear-az",
        "#az-clear-filters"
      ];

      selectors.forEach(function (sel) {
        document.querySelectorAll(sel).forEach(function (btn) {
          btn.addEventListener("click", function () { enableSearch(); }, { signal });
        });
      });

      // Fallback: any button near the search whose text says "Clear"
      document.querySelectorAll("button, .btn").forEach(function (btn) {
        const txt = btn.textContent.trim().toLowerCase();
        if (txt.includes("clear") || txt.includes("reset")) {
          btn.addEventListener("click", function () {
            setTimeout(enableSearch, 200);
          }, { signal });
        }
      });
    }

    hookClearButtons();

    /* ===========================
       SCORING + SEARCH LOGIC
    =========================== */
    const noFuzzyWords = [
      "arts","business","history","music","science","news"
    ];

    function fuzzyMatch(query, text) {
      let qi = 0, ti = 0;
      while (qi < query.length && ti < text.length) {
        if (query[qi] === text[ti]) qi++;
        ti++;
      }
      return qi === query.length;
    }

    function scoreMatch(query, name) {
      if (name === query) return 100;
      
      // Starts with query at word boundary (highest priority for word starts)
      if (name.startsWith(query + " ") || name.startsWith(query + "-") || /^[^\w]/.test(name.slice(query.length))) {
        return 90;
      }
      
      if (name.startsWith(query)) return 80;

      // Word-boundary bonus (anywhere in the name)
      const wordBoundary = new RegExp("(?:^|[\\s\\-_/,()])" + query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (wordBoundary.test(name)) return 75;

      if (name.includes(query)) return 60;

      if (
        query.length >= 6 &&
        !noFuzzyWords.includes(query) &&
        name.includes(query.slice(0, 3)) &&
        fuzzyMatch(query, name)
      ) return 40;

      return 0;
    }

    function multiWordScore(query, name) {
      const tokens = query.split(/\s+/).filter(Boolean);
      if (tokens.length <= 1) return scoreMatch(query, name);

      let total = 0;
      for (const tok of tokens) {
        const s = scoreMatch(tok, name);
        if (s === 0) return 0;          // AND logic
        total += s;
      }
      return total / tokens.length;     // average
    }

    /* ===========================
       DEBOUNCED INPUT HANDLER
    =========================== */
    let debounceTimer = null;

    function handleInput() {
      const query = input.value.trim().toLowerCase();
      updateClearButtonVisibility();

      if (subjectActive && query === "") return;

      // RESET when query is too short
      if (query.length < 3) {
        // Restore original DOM order
        if (container && originalOrder.length) {
          originalOrder.forEach(function (node) {
            container.appendChild(node);
          });
        }
        data.forEach(function (db) {
          db.element.classList.remove("is-hidden");
        });
        headings.forEach(function (h) {
          h.classList.remove("is-hidden");
        });
        if (alphaBar) alphaBar.style.display = "";
        if (noResults) noResults.classList.remove("is-visible");
        updateResultCount(data.length);
        updateStatusMessage("");
        return;
      }

      if (alphaBar) alphaBar.style.display = "none";

      // FILTER + SCORE
      const matches = [];
      let visibleCount = 0;

      data.forEach(function (db) {
        const score = multiWordScore(query, db.name);
        if (score > 0) {
          db.element.classList.remove("is-hidden");
          matches.push({ db: db, score: score });
          visibleCount++;
        } else {
          db.element.classList.add("is-hidden");
        }
      });

      // NO RESULTS
      if (noResults) {
        noResults.classList.toggle("is-visible", visibleCount === 0);
      }

      // HEADINGS
      headings.forEach(function (heading) {
        let next = heading.nextElementSibling;
        let hasVisible = false;
        while (next && !next.classList.contains("s-lg-db-panel-title")) {
          if (
            next.classList.contains("az-item") &&
            !next.classList.contains("is-hidden")
          ) {
            hasVisible = true;
            break;
          }
          next = next.nextElementSibling;
        }
        heading.classList.toggle("is-hidden", !hasVisible);
      });

      updateResultCount(visibleCount);
      updateStatusMessage(visibleCount === 0 ? "No databases match your search." : "");
    }

    input.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(handleInput, 150);
    }, { signal });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        input.value = "";
        updateClearButtonVisibility();
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
      }
    }, { signal });

    /* ===========================
       MUTATIONOBSERVER — detect
       LibGuides AJAX content swap
    =========================== */
    let mutTimer = null;

    const contentObserver = new MutationObserver(function () {
      clearTimeout(mutTimer);
      mutTimer = setTimeout(function () {
        collectData();
        ensureNoResultsEl();
        ensureStatusEl();
        hookClearButtons();

        // Re-enforce font sizes after AJAX swap
        enforceSubjectFontSize();

        // Check subject dropdown state
        const selVal = jQuery(".s-lg-sel-subjects").val();
        const active = Array.isArray(selVal)
          ? selVal.filter(function (v) { return v !== ""; }).length > 0
          : selVal !== "" && selVal !== null;

        if (active) {
          disableSearch();
        } else {
          enableSearch();
        }
      }, 200);
    });

    let resultsPane = document.getElementById("s-lg-az-content")
                   || document.getElementById("s-lg-az-results");

    if (!resultsPane) {
      collectData();
      resultsPane = container ? container.parentNode : null;
    }

    if (resultsPane) {
      contentObserver.observe(resultsPane, { childList: true, subtree: true });
    }

    // INITIAL DATA COLLECTION
    collectData();
    ensureNoResultsEl();
    ensureStatusEl();

    // Enforce font size one more time after init
    enforceSubjectFontSize();
  }

  /* ===========================
     PAGE LIFECYCLE
  =========================== */
  window.addEventListener("pageshow", function () {
    window.__azEnhancementsInitialized = false;

    var tryInit = function () {
      var input = document.querySelector(".s-lg-az-search");
      var items = document.querySelectorAll(".az-item");

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
<script>
  /**
 * A–Z Database Search Enhancements (v4)
 *
 * v4 changes (clear native search on subject select):
 *   - When a subject filter is selected, clears the LibGuides internal
 *     search state via springSpace.azPublicObj so leftover search terms
 *     don't combine with the subject filter (fixing "0 Databases Found
 *     for: Biology + med" issue)
 *   - Calls clearAzSelection AND resets the native hidden/original input
 *   - All v3 improvements carried forward (MutationObserver, disable/
 *     enable search, clone input, debounce, scoring, a11y, AbortController)
 */
(function () {
  "use strict";

  if (!location.pathname.includes("/az/databases")) return;

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
    wrapper.style.position = "relative";

    // Remove any leftover clear button from a prior init
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
    let subjectActive = false;   // true while a subject filter is selected
    let data          = [];      // { element, name } for each .az-item
    let originalOrder = [];      // snapshot of container children
    let container     = null;    // parent of .az-item elements
    let headings      = [];      // .s-lg-db-panel-title NodeList/Array
    let noResults     = null;    // "No databases match" element

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
        noResults.setAttribute("role", "status");
        Object.assign(noResults.style, {
          display:    "none",
          padding:    "1rem 0",
          fontWeight: "600",
          fontSize:   "1rem"
        });
        container.prepend(noResults);
      }

      if (noResults) {
        noResults.textContent = "No databases match your search.";
        noResults.style.display = "none";
      }
    }

    /* ===========================
       RESULT COUNT (a11y)
    =========================== */
    const resultCount = document.getElementById("s-lg-az-result-count");
    if (resultCount) {
      resultCount.setAttribute("role", "status");
      resultCount.setAttribute("aria-live", "polite");
    }

    /* ===========================
       CLEAR NATIVE LIBGUIDES
       SEARCH STATE
       Removes any lingering search
       term from the LG internal
       state so it doesn't combine
       with a subject filter.
    =========================== */
    function clearNativeSearchState() {
      // 1. Clear via springSpace API (removes the search "pill" / token)
      try {
        if (window.springSpace && springSpace.azPublicObj) {
          springSpace.azPublicObj.clearAzSelection("s-lg-az-search");
        }
      } catch (e) {
        // Silently ignore if API isn't available
      }

      // 2. Also reset any native search input that LG may reference
      //    (the original input might have been re-created by LG after
      //    our clone, or there may be a hidden one)
      document.querySelectorAll(
        '.s-lg-az-search, input[name="search"], input[id="s-lg-az-search"]'
      ).forEach(function (el) {
        if (el !== input) {
          el.value = "";
        }
      });

      // 3. Clear our cloned input too
      input.value = "";
      clearBtn.style.display = "none";
    }

    /* ===========================
       ENABLE / DISABLE SEARCH
    =========================== */
    function disableSearch() {
      subjectActive = true;

      // ★ Clear native LG search state BEFORE LG fires its AJAX request
      //   so the subject-only query doesn't include a stale search term
      clearNativeSearchState();

      input.disabled = true;
      input.placeholder = "Clear subject filter to search";
      input.style.opacity = "0.55";
      input.style.cursor  = "not-allowed";
      clearBtn.style.display = "none";
    }

    function enableSearch() {
      subjectActive = false;
      input.disabled = false;
      input.placeholder = defaultPlaceholder;
      input.style.opacity = "";
      input.style.cursor  = "";
    }

    /* ===========================
       MUTATION OBSERVER
       Watches for LibGuides AJAX
       content swaps and refreshes
       cached data afterwards.
    =========================== */
    let mutationTimer = null;

    // We observe the main content area so we catch full container replacements
    const observeTarget =
      document.getElementById("s-lg-az-content") ||
      document.getElementById("s-lg-az-results") ||
      document.querySelector(".s-lg-az-result") ||
      (document.querySelector(".az-item") || {}).parentNode;

    // Walk up one level to catch complete container swaps
    const observeRoot = observeTarget
      ? (observeTarget.parentNode || observeTarget)
      : document.body;

    const observer = new MutationObserver(function () {
      // Debounce: LibGuides may fire many mutations during one AJAX swap
      clearTimeout(mutationTimer);
      mutationTimer = setTimeout(onContentSettled, 200);
    });

    observer.observe(observeRoot, { childList: true, subtree: true });

    // Tear down observer on abort
    signal.addEventListener("abort", () => observer.disconnect());

    function onContentSettled() {
      // Re-collect data from the fresh DOM
      const ok = collectData();
      if (!ok) return;

      // Determine if a subject filter is currently active
      const subjectDropdown = document.querySelector(".s-lg-sel-subjects");
      const subjectValue    = subjectDropdown ? subjectDropdown.value : "";
      const isDefault       = !subjectValue || subjectValue === "" ||
                               subjectValue === "0"  || subjectValue === "all";

      if (isDefault) {
        enableSearch();
      } else {
        // Keep search disabled; make sure input stays clear
        subjectActive = true;
        input.value = "";
        input.disabled = true;
        input.placeholder = "Clear subject filter to search";
        input.style.opacity = "0.55";
        input.style.cursor  = "not-allowed";
        clearBtn.style.display = "none";
      }
    }

    /* ===========================
       SUBJECT DROPDOWN —
       Listen for changes via jQuery
       (LibGuides uses jQuery)
    =========================== */
    if (window.jQuery) {
      // Namespaced so we can cleanly unbind on re-init
      jQuery(document).off("change.azEnhance", ".s-lg-sel-subjects");
      jQuery(document).on("change.azEnhance", ".s-lg-sel-subjects", function () {
        const val = jQuery(this).val();
        const isDefault = !val || val === "" || val === "0" || val === "all";

        if (isDefault) {
          enableSearch();
        } else {
          disableSearch();
        }
      });

      signal.addEventListener("abort", () => {
        jQuery(document).off("change.azEnhance", ".s-lg-sel-subjects");
      });
    }

    /* ===========================
       CLEAR-FILTER / RESET
       BUTTONS
    =========================== */
    function hookClearButtons() {
      const selectors = [
        "#s-lg-az-btn-clear-all",
        ".az-btn-clear",
        ".btn-clear-filters",
        '[data-action="clear"]'
      ];

      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(btn => {
          btn.addEventListener("click", () => enableSearch(), { signal });
        });
      });

      // Also catch any button whose text says "Clear" near the filter area
      document.querySelectorAll("button, .btn").forEach(btn => {
        const txt = btn.textContent.trim().toLowerCase();
        if (txt.includes("clear") || txt.includes("reset")) {
          btn.addEventListener("click", () => enableSearch(), { signal });
        }
      });
    }

    hookClearButtons();

    /* ===========================
       SCORING HELPERS
    =========================== */
    const noFuzzyWords = [
      "arts", "business", "history", "music", "science", "news"
    ];

    function fuzzyMatch(query, text) {
      let qi = 0, ti = 0;
      while (qi < query.length && ti < text.length) {
        if (query[qi] === text[ti]) qi++;
        ti++;
      }
      return qi === query.length;
    }

    /**
     * Score a single query token against a database name.
     * Higher is better; 0 = no match.
     */
    function scoreToken(token, name) {
      if (name === token)        return 100;   // exact
      if (name.startsWith(token)) return 80;   // prefix

      // word-boundary match: token appears right after a space / hyphen / start
      const boundary = new RegExp("(?:^|[\\s\\-_/])" + token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (boundary.test(name)) return 75;

      if (name.includes(token)) return 60;     // substring

      // fuzzy (only for longer, non-ambiguous tokens)
      if (
        token.length >= 6 &&
        !noFuzzyWords.includes(token) &&
        name.includes(token.slice(0, 3)) &&
        fuzzyMatch(token, name)
      ) return 40;

      return 0;
    }

    /**
     * Multi-word AND: every token must match.
     * Overall score = minimum token score (weakest link).
     */
    function scoreMatch(query, name) {
      const tokens = query.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return 0;

      let minScore = Infinity;
      for (const t of tokens) {
        const s = scoreToken(t, name);
        if (s === 0) return 0;     // AND fails
        if (s < minScore) minScore = s;
      }
      return minScore;
    }

    /* ===========================
       RESTORE ORIGINAL ORDER
    =========================== */
    function restoreOrder() {
      if (!container || originalOrder.length === 0) return;
      originalOrder.forEach(child => container.appendChild(child));
    }

    /* ===========================
       DEBOUNCE HELPER
    =========================== */
    let debounceTimer = null;
    const DEBOUNCE_MS = 150;

    /* ===========================
       MAIN FILTER HANDLER
    =========================== */
    input.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      const raw = this.value;

      clearBtn.style.display = raw.trim() ? "block" : "none";

      debounceTimer = setTimeout(() => {
        if (subjectActive) return;          // ignore while subject filter is on

        const query = raw.trim().toLowerCase();

        /* -------- RESET -------- */
        if (query.length < 3) {
          restoreOrder();
          data.forEach(db => db.element.style.display = "");
          headings.forEach(h => h.style.display = "");
          if (alphaBar) alphaBar.style.display = "";
          if (noResults) noResults.style.display = "none";

          if (resultCount) {
            const n = data.length;
            resultCount.innerHTML =
              `<span>${n} Database${n !== 1 ? "s" : ""}</span>`;
          }
          return;
        }

        if (alphaBar) alphaBar.style.display = "none";

        /* -------- FILTER + SCORE -------- */
        const matches = [];
        let visibleCount = 0;

        data.forEach(db => {
          const score = scoreMatch(query, db.name);

          if (score > 0) {
            db.element.style.display = "";
            matches.push({ db, score });
            visibleCount++;
          } else {
            db.element.style.display = "none";
          }
        });

        /* -------- RANK -------- */
        matches
          .sort((a, b) =>
            b.score - a.score || a.db.name.localeCompare(b.db.name)
          )
          .forEach(({ db }) => {
            db.element.parentNode.appendChild(db.element);
          });

        /* -------- NO RESULTS -------- */
        if (noResults) {
          noResults.style.display = visibleCount === 0 ? "" : "none";
        }

        /* -------- HEADINGS -------- */
        headings.forEach(heading => {
          let next = heading.nextElementSibling;
          let hasVisible = false;

          while (next && !next.classList.contains("s-lg-db-panel-title")) {
            if (
              next.classList.contains("az-item") &&
              next.style.display !== "none"
            ) {
              hasVisible = true;
              break;
            }
            next = next.nextElementSibling;
          }

          heading.style.display = hasVisible ? "" : "none";
        });

        /* -------- COUNT -------- */
        if (resultCount) {
          resultCount.innerHTML =
            `<span>${visibleCount} Database${visibleCount !== 1 ? "s" : ""}</span>`;
        }
      }, DEBOUNCE_MS);
    }, { signal });

    /* ===========================
       INITIAL DATA COLLECTION
    =========================== */
    collectData();
  }

  /* ===========================
     PAGE LIFECYCLE
  =========================== */
  window.addEventListener("pageshow", function () {
    window.__azEnhancementsInitialized = false;

    const tryInit = () => {
      const searchInput = document.querySelector(".s-lg-az-search");
      const items       = document.querySelectorAll(".az-item");

      if (!searchInput || items.length === 0) {
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
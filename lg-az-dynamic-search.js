<script>
(function () {

  // Run only on A–Z page
  if (!location.pathname.includes("/az/databases")) return;

  window.addEventListener("load", function () {

    /* ===============================
       BASIC PAGE ADJUSTMENTS
    =============================== */

    const alphaBar = document.getElementById("s-lg-az-index");
    const header = document.getElementById("s-lib-public-header");

    if (header) {
      header.style.marginTop = "0";
      header.style.marginBottom = "0";
      header.style.position = "static";
    }

    /* ===============================
       SEARCH INPUT + LIBGUIDES BLOCK
    =============================== */

    const input = document.querySelector(".s-lg-az-search");
    if (!input) return;

    //  Disable LibGuides native search listeners
    ["input", "keydown", "keyup"].forEach(evt => {
      input.addEventListener(evt, e => e.stopPropagation());
    });

    //  Prevent form submit side effects
    const form = input.closest("form");
    if (form) {
      form.addEventListener("submit", e => e.preventDefault());
    }

    /* ===============================
       SUBJECT FILTER HANDLING (NEW)
    =============================== */

    //  Flag to suspend text filtering while subject filter runs
    let suspendTextFilter = false;

    //  When subject changes, clear text search and suspend filtering

jQuery(".s-lg-sel-subjects").on("change", function () {
  // Suspend custom text filtering
  suspendTextFilter = true;

  // Clear the visible text box
  input.value = "";
  clearBtn.style.display = "none";

  //  Safely clear LibGuides' text search state
  if (window.springSpace && springSpace.azPublicObj) {
    springSpace.azPublicObj.clearAzSelection("s-lg-az-search");
  }

  // Do NOT dispatch input event
  // LibGuides will re-render the list based on subject alone
});


    /* ===============================
       CLEAR (✕) BUTTON
    =============================== */

    const wrapper = input.parentNode;
    wrapper.style.position = "relative";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.innerHTML = "×";

    Object.assign(clearBtn.style, {
      position: "absolute",
      right: "10px",
      top: "50%",
      transform: "translateY(-50%)",
      border: "none",
      background: "transparent",
      fontSize: "18px",
      cursor: "pointer",
      display: "none",
      lineHeight: "1"
    });

    wrapper.appendChild(clearBtn);

    clearBtn.addEventListener("click", function () {
      input.value = "";
      clearBtn.style.display = "none";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });

    /* ===============================
       DATA COLLECTION
    =============================== */

    const items = document.querySelectorAll(".az-item");
    const headings = document.querySelectorAll(".s-lg-db-panel-title");
    const resultCount = document.getElementById("s-lg-az-result-count");

    const data = Array.from(items).map(item => {
      const titleEl = item.querySelector(".az-title");
      return {
        element: item,
        name: titleEl ? titleEl.textContent.trim().toLowerCase() : ""
      };
    });

    /* ===============================
       NO RESULTS MESSAGE
    =============================== */

    const noResults = document.createElement("div");
    noResults.id = "az-no-results";
    noResults.textContent = "No databases match your search.";
    noResults.style.display = "none";
    noResults.style.padding = "1rem 0";
    noResults.style.fontWeight = "600";
    noResults.style.fontSize = "1rem";

    items[0].parentNode.prepend(noResults);

    /* ===============================
       FUZZY + SCORING HELPERS
    =============================== */

    const noFuzzyWords = ["arts", "business", "history", "music", "science", "news"];

    function fuzzyMatch(query, text) {
      let qi = 0;
      let ti = 0;

      while (qi < query.length && ti < text.length) {
        if (query[qi] === text[ti]) qi++;
        ti++;
      }
      return qi === query.length;
    }

    function scoreMatch(query, name) {
      if (name === query) return 100;
      if (name.startsWith(query)) return 80;
      if (name.includes(query)) return 60;

      if (
        query.length >= 6 &&
        !noFuzzyWords.includes(query) &&
        name.includes(query.slice(0, 3)) &&
        fuzzyMatch(query, name)
      ) return 40;

      return 0;
    }

    /* ===============================
       MAIN FILTER HANDLER
    =============================== */

    input.addEventListener("input", function () {

      const query = this.value.trim().toLowerCase();
      clearBtn.style.display = query ? "block" : "none";

      //  If subject filter just ran, ignore this reset
      if (suspendTextFilter && query === "") {
        return;
      }

      //  User typed again → re-enable text filtering
      suspendTextFilter = false;

      /* ---------- RESET ---------- */

      if (query.length < 3) {
        data.forEach(db => db.element.style.display = "");
        headings.forEach(h => h.style.display = "");
        if (alphaBar) alphaBar.style.display = "";
        noResults.style.display = "none";

        if (resultCount) {
          resultCount.innerHTML = `<span>${data.length} Databases</span>`;
        }
        return;
      }

      if (alphaBar) alphaBar.style.display = "none";

      /* ---------- FILTER + SCORE ---------- */

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

      /* ---------- RANK ---------- */

      matches
        .sort((a, b) => b.score - a.score)
        .forEach(({ db }) => {
          db.element.parentNode.appendChild(db.element);
        });

      /* ---------- NO RESULTS ---------- */

      noResults.style.display = visibleCount === 0 ? "" : "none";

      /* ---------- HEADINGS ---------- */

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

      /* ---------- COUNT ---------- */

      if (resultCount) {
        resultCount.innerHTML = `<span>${visibleCount} Databases</span>`;
      }
    });

  });

})();
</script>

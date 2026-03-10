(function () {
  var searchInput = document.getElementById("search-input");
  var searchResults = document.getElementById("search-results");
  var noteList = document.getElementById("note-list");

  SimpleJekyllSearch({
    searchInput: searchInput,
    resultsContainer: searchResults,
    json: "/search.json",
    searchResultTemplate:
      '<div class="search-result">' +
      '<a href="{url}">{title}</a>' +
      '<p class="search-snippet">{content}</p>' +
      "</div>",
    noResultsText: '<p class="no-results">找不到相關筆記</p>',
    limit: 10,
    fuzzy: false,
    templateMiddleware: function (prop, value) {
      if (prop === "content") {
        var text = value.replace(/\s+/g, " ").trim();
        if (text.length > 150) {
          text = text.substring(0, 150) + "...";
        }
        return text;
      }
      return value;
    },
  });

  searchInput.addEventListener("input", function () {
    if (this.value.length > 0) {
      noteList.style.display = "none";
      searchResults.style.display = "block";
    } else {
      noteList.style.display = "block";
      searchResults.style.display = "none";
    }
  });
})();

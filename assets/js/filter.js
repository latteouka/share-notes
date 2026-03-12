(function () {
  var filterBar = document.getElementById("filter-bar");
  if (!filterBar) return;

  filterBar.addEventListener("click", function (e) {
    var btn = e.target.closest(".filter-btn");
    if (!btn) return;

    filterBar.querySelectorAll(".filter-btn").forEach(function (b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");

    var filter = btn.getAttribute("data-filter");
    var items = document.querySelectorAll("#note-list li");

    items.forEach(function (li) {
      if (filter === "all") {
        li.style.display = "";
        return;
      }

      var parts = filter.split(":");
      var type = parts[0];
      var value = parts[1];

      if (type === "category") {
        li.style.display = li.getAttribute("data-category") === value ? "" : "none";
      } else if (type === "tag") {
        var tags = (li.getAttribute("data-tags") || "").split(",");
        li.style.display = tags.indexOf(value) !== -1 ? "" : "none";
      }
    });
  });
})();

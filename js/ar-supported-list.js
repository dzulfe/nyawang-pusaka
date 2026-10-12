(function () {
  const lists = document.querySelectorAll("[data-ar-supported-list]");
  if (!lists.length) return;

  if (typeof PUSAKA_DATA === "undefined" || !Array.isArray(PUSAKA_DATA)) {
    console.error("Daftar pusaka AR tidak dapat dimuat: PUSAKA_DATA tidak tersedia.");
    lists.forEach((list) => {
      list.replaceChildren();
      const item = document.createElement("li");
      item.textContent = "Daftar pusaka AR tidak dapat dimuat.";
      list.appendChild(item);
    });
    return;
  }

  const supportedItems = PUSAKA_DATA
    .filter((item) => item.flag === "ar" && Number.isInteger(item.targetIndex))
    .sort((a, b) => a.targetIndex - b.targetIndex);

  lists.forEach((list) => {
    list.replaceChildren();

    supportedItems.forEach((item) => {
      const entry = document.createElement("li");
      const name = document.createElement("strong");
      const era = document.createElement("span");
      name.textContent = item.nama;
      era.textContent = item.era;
      entry.append(name, era);
      list.appendChild(entry);
    });

    if (supportedItems.length === 0) {
      const item = document.createElement("li");
      item.textContent = "Belum ada pusaka yang tersedia untuk AR.";
      list.appendChild(item);
    }
  });

  document.querySelectorAll("[data-ar-supported-count]").forEach((count) => {
    count.textContent = String(supportedItems.length);
  });
})();

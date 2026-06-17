(function () {
  const toggle = document.querySelector("[data-nav-toggle]");
  const menu = document.querySelector("[data-nav-menu]");

  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const open = menu.dataset.open === "true";
      menu.dataset.open = open ? "false" : "true";
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
    });

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        menu.dataset.open = "false";
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const targetId = button.getAttribute("aria-controls");
      const block = targetId ? document.getElementById(targetId) : null;
      const text = block ? block.textContent.trim() : "";

      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        button.dataset.copied = "true";
        const original = button.textContent;
        button.textContent = "Copied";
        window.setTimeout(() => {
          button.dataset.copied = "false";
          button.textContent = original;
        }, 1800);
      } catch {
        button.textContent = "Failed";
        window.setTimeout(() => {
          button.textContent = "Copy";
        }, 1800);
      }
    });
  });
})();

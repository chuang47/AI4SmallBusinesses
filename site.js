// Shared by every page: the header menu closes on a click outside it or with Escape.
const siteMenu = document.getElementById("siteMenu");
document.addEventListener("click", (e) => {
  if (siteMenu.open && !siteMenu.contains(e.target)) siteMenu.open = false;
});
siteMenu.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && siteMenu.open) {
    siteMenu.open = false;
    siteMenu.querySelector("summary").focus();
  }
});

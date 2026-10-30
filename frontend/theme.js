// Run before styles paint; storage may be unavailable in restricted browsers.
(() => {
  let theme;
  try { theme = localStorage.getItem('onscreen.theme'); } catch { /* Use system preference. */ }
  document.documentElement.dataset.theme = ['light', 'dark'].includes(theme)
    ? theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
})();

window.LISTENING_APP_CONFIG = {
  bundledPackBase64Var: "LISTENING_BUNDLED_PACK_B64",
  hidePackControlsWhenBundled: true,
  authorizedPublicDistribution: true
};

// Cloud progress is additive and local-first. Load it independently so a
// network/API failure can never block the listening trainer itself.
(()=>{
  try {
    const current = document.currentScript;
    const script = document.createElement("script");
    script.src = new URL("progress-sync.js?v=22-cloud1", current?.src || location.href).href;
    script.async = true;
    document.head.appendChild(script);
  } catch {}
})();

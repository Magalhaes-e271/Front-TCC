// O site e a API deste pacote compartilham a origem pelo proxy /api.
window.OFICINA_CONFIG = Object.freeze({
  apiBase: "http://localhost:8181",
  timeoutMs: 120000,
  healthPath: "/health",
  conexaoTimeoutMs: 120000
});

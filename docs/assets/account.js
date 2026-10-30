"use strict";

const $ = id => document.getElementById(id);
let mode = new URLSearchParams(location.search).get("mode") === "register" ? "register" : "login";
const nextPath = new URLSearchParams(location.search).get("next");
const safeNextPath = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") && !nextPath.includes("\\")
  ? nextPath : null;

function alertMessage(text, error = false) {
  const alert = $("account-alert");
  alert.textContent = text;
  alert.dataset.error = error ? "true" : "false";
  alert.hidden = !text;
}

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === "register";
  $("login-mode").classList.toggle("active", !registering);
  $("register-mode").classList.toggle("active", registering);
  $("login-mode").setAttribute("aria-pressed", String(!registering));
  $("register-mode").setAttribute("aria-pressed", String(registering));
  $("display-name-label").hidden = !registering;
  $("display-name").hidden = !registering;
  $("display-name").required = false;
  $("password").autocomplete = registering ? "new-password" : "current-password";
  $("password-help").hidden = !registering;
  $("password").minLength = registering ? 12 : 1;
  $("account-submit").replaceChildren(
    document.createTextNode(registering ? "Üyeliği oluştur " : "Giriş yap "),
    Object.assign(document.createElement("span"), { textContent: "→", ariaHidden: "true" }),
  );
  alertMessage("");
}

function showAccount(user) {
  $("account-form-view").hidden = true;
  $("signed-in-view").hidden = false;
  $("account-role").textContent = user.role === "admin" ? "YÖNETİCİ" : "AKTİF ÜYE";
  $("account-name").textContent = user.display_name || "Hesabınız hazır.";
  $("account-email").textContent = user.email;
}

async function getCurrentUser() {
  const response = await IhaleApp.fetch("/api/auth/me", { cache: "no-store" });
  if (!response.ok) throw new Error("Hesap bilgileri alınamadı.");
  return (await response.json()).user;
}

$("login-mode").addEventListener("click", () => setMode("login"));
$("register-mode").addEventListener("click", () => setMode("register"));

$("account-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("account-submit");
  button.disabled = true;
  alertMessage(mode === "register" ? "Hesabınız oluşturuluyor…" : "Giriş yapılıyor…");
  const payload = {
    email: $("email").value,
    password: $("password").value,
  };
  if (mode === "register" && $("display-name").value.trim()) {
    payload.display_name = $("display-name").value.trim();
  }
  try {
    const response = await IhaleApp.fetch(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "IhaleListele" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      const detail = typeof body.detail === "string" ? body.detail : "Bilgileri kontrol edip tekrar deneyin.";
      throw new Error(detail);
    }
    $("account-form").reset();
    IhaleApp.acceptSession(body);
    showAccount(body.user);
    alertMessage(mode === "register" ? "Üyeliğiniz oluşturuldu ve hemen aktif edildi." : "Giriş yaptınız.");
    location.assign(IhaleApp.href(safeNextPath || "/tenders"));
  } catch (error) {
    alertMessage(error.message || "İstek tamamlanamadı. Tekrar deneyin.", true);
  } finally {
    button.disabled = false;
  }
});

$("logout-button").addEventListener("click", async () => {
  try {
    const response = await IhaleApp.fetch("/api/auth/logout", {
      method: "POST",
      headers: { "X-Requested-With": "IhaleListele" },
    });
    if (!response.ok) throw new Error();
    IhaleApp.clearSession();
    location.reload();
  } catch (_) {
    alertMessage("Çıkış yapılamadı. Tekrar deneyin.", true);
  }
});

setMode(mode);
getCurrentUser().then(user => {
  if (user) {
    showAccount(user);
    if (safeNextPath) location.assign(IhaleApp.href(safeNextPath));
  }
}).catch(() => alertMessage("Hesap bilgileri şu anda yüklenemiyor.", true));


IhaleApp.adminReady.then(allowed => {
if (!allowed) return;
"use strict";
const $ = id => document.getElementById(id);
let running = false, canImport = false, pending = false, frameNumber = 0, imageUrl = null;
let polling = false, stopped = false, lastPreview = 0, inputChain = Promise.resolve(), lastWheel = 0;
const frame = $("browser-frame");

function node(tag, text) {const element = document.createElement(tag); element.textContent = text; return element;}
function error(text = "") {$("ekap-error").textContent = text; $("ekap-error").hidden = !text;}
async function json(path, body) {
  const response = await IhaleApp.fetch(path, {cache:"no-store", ...(body !== undefined ? {
    method:"POST", headers:{"Content-Type":"application/json", "X-Requested-With":"IhaleListele"}, body:JSON.stringify(body),
  } : {})});
  if (!response.ok) {
    let message = response.status === 401 || response.status === 403 ? "Bu ekran yalnızca yönetici hesabıyla kullanılabilir." : response.status === 404 ? "Bu ekran geliştirme ortamında etkin değil." : "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
    if (response.status === 409) {const data = await response.json(); if (typeof data.detail === "string") message = data.detail;}
    throw new Error(message);
  }
  return response.json();
}
function buttons() {
  $("open-session").disabled = running || pending;
  $("close-session").disabled = !running || pending;
  $("go-search").disabled = !running || pending;
  $("preview-list").disabled = !canImport || pending;
  $("import-list").disabled = !canImport || pending;
}
function clearFrame() {
  frame.hidden = true; frame.removeAttribute("src"); $("browser-placeholder").hidden = false;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = null; frameNumber = 0;
}
async function showPreview() {
  const data = await json("/api/local/ekap/capture");
  const items = data.ekap_search_cards || [];
  $("capture-items").replaceChildren(...items.map(item => {
    const li = node("li", ""); li.append(node("span", item.external_id), node("strong", item.title), node("p", item.buyer)); return li;
  }));
  $("capture-count").textContent = `${items.length} ilan · Bu ön izleme kayıt oluşturmaz.`;
  $("capture-preview").hidden = items.length === 0;
}
async function poll() {
  if (polling || stopped) return;
  polling = true;
  try {
    const state = await json("/api/local/ekap/status");
    running = state.running; canImport = state.can_import; pending = state.pending_actions > 0;
    $("session-message").textContent = state.message;
    $("session-badge").textContent = !running ? "Kapalı" : state.state === "verification_required" ? "Doğrulama bekliyor" : "Oturum açık";
    $("session-badge").classList.toggle("active", running);
    $("session-dot").classList.toggle("active", running);
    $("live-label").hidden = !running;
    if (state.last_action) $("capture-result").textContent = `${state.last_action}${state.imported || state.skipped ? ` ${state.imported} yeni/güncellenen, ${state.skipped} değişmeyen ilan.` : ""}`;
    if (running && state.frame > 0 && state.frame !== frameNumber) {
      const response = await IhaleApp.fetch(`/api/local/ekap/frame?v=${state.frame}`, {cache:"no-store"});
      if (response.ok) {
        const nextUrl = URL.createObjectURL(await response.blob());
        const previous = imageUrl; imageUrl = nextUrl; frame.src = nextUrl;
        frame.hidden = false; $("browser-placeholder").hidden = true;
        frame.dataset.width = state.width; frame.dataset.height = state.height;
        frameNumber = state.frame;
        if (previous) URL.revokeObjectURL(previous);
      }
    } else if (!running) clearFrame();
    if (state.capture_version > 0 && state.capture_version !== lastPreview) {await showPreview(); lastPreview = state.capture_version;}
    buttons();
  } catch (err) {error(err.message);}
  finally {polling = false; if (!stopped) setTimeout(poll, 850);}
}
async function control(action) {
  error(); pending = true; buttons();
  try {
    if (action === "start") {
      await json("/api/local/ekap/start", {});
      clearFrame(); lastPreview = 0; $("capture-preview").hidden = true; $("capture-result").textContent = "Henüz bir liste kaydedilmedi.";
    } else if (action === "stop") await json("/api/local/ekap/stop", {});
    else await json("/api/local/ekap/input", {action});
  } catch (err) {error(err.message);}
  finally {pending = false; buttons();}
}
function sendInput(payload) {
  if (!running || frame.hidden) return;
  // Preserve the user's input order; keystrokes are never written to browser storage.
  inputChain = inputChain.then(() => json("/api/local/ekap/input", payload)).then(() => {
    $("input-status").textContent = "Hareket gönderildi";
  }).catch(err => error(err.message));
}
function point(event) {
  const rect = frame.getBoundingClientRect();
  return {x:Math.max(0, Math.min(Number(frame.dataset.width)-1, (event.clientX-rect.left)*Number(frame.dataset.width)/rect.width)), y:Math.max(0, Math.min(Number(frame.dataset.height)-1, (event.clientY-rect.top)*Number(frame.dataset.height)/rect.height))};
}
frame.addEventListener("click", event => {frame.focus({preventScroll:true}); sendInput({action:"click", ...point(event)});});
frame.addEventListener("wheel", event => {
  if (!running) return;
  event.preventDefault();
  if (performance.now()-lastWheel < 100) return;
  lastWheel = performance.now(); sendInput({action:"scroll", ...point(event), delta_y:Math.max(-1200, Math.min(1200, event.deltaY))});
}, {passive:false});
const keys = new Set(["Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);
frame.addEventListener("keydown", event => {
  if (event.ctrlKey || event.metaKey) {
    if (event.key.toLowerCase() === "a") {event.preventDefault(); sendInput({action:"key", key:"ControlOrMeta+A"});}
    return;
  }
  if (keys.has(event.key)) {event.preventDefault(); sendInput({action:"key", key:event.key === "Tab" && event.shiftKey ? "Shift+Tab" : event.key});}
  else if (event.key.length === 1 && !event.altKey) {event.preventDefault(); sendInput({action:"text", text:event.key});}
});
frame.addEventListener("paste", event => {
  const text = event.clipboardData?.getData("text");
  if (text) {event.preventDefault(); sendInput({action:"text", text:text.slice(0,2000)});}
});
$("open-session").addEventListener("click", () => control("start"));
$("close-session").addEventListener("click", () => control("stop"));
$("go-search").addEventListener("click", () => control("home"));
$("preview-list").addEventListener("click", () => control("capture"));
$("import-list").addEventListener("click", () => control("import"));
window.addEventListener("pagehide", () => {stopped = true; if (imageUrl) URL.revokeObjectURL(imageUrl);});
poll();

});

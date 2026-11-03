"use strict";
(() => {
  if (window.self !== window.top) { document.body.textContent = "Open DRX staff access in its own tab."; return; }
  const $ = id => document.getElementById(id), apiBase = (window.DRX_CONFIG?.apiBase || "").replace(/\/$/, "");
  let authorization = "", busy = false, logoutTimer, language = "en", status = null;
  const es = {
    "Staff access":"Acceso del equipo", "DRX TEAM":"EQUIPO DRX", "Manage memberships":"Administrar membresías", "Sign in with your DRX staff username and password.":"Ingresa con tu usuario y contraseña del equipo DRX.",
    "Username":"Usuario", "Password":"Contraseña", "Sign in →":"Ingresar →", "Back to DRX Software":"Volver a DRX Software", "Membership approval":"Aprobación de membresía", "Sign out":"Cerrar sesión",
    "Use this form after DRX has confirmed payment. Registration alone does not activate access.":"Usa este formulario después de que DRX haya confirmado el pago. Registrarse no activa el acceso.",
    "User email":"Correo del usuario", "Operation":"Operación", "Select operation":"Selecciona la operación", "Activate":"Activar", "Renew":"Renovar", "Membership":"Membresía", "Select plan":"Selecciona el plan", "Monthly":"Mensual", "Annual":"Anual", "Unique payment reference":"Referencia única del pago",
    "Use the same reference for the same payment to avoid adding a second period.":"Usa la misma referencia para el mismo pago y evita añadir otro periodo.", "DRX responsible person":"Responsable DRX", "Internal notes (optional)":"Notas internas (opcionales)",
    "DRX has verified this payment and I approve this membership operation.":"DRX verificó este pago y apruebo esta operación de membresía.", "Apply membership →":"Aplicar membresía →", "New operation":"Nueva operación",
    "Checking staff access…":"Comprobando el acceso…", "Applying membership…":"Aplicando la membresía…", "Membership request processed. Check the confirmation email and internal history.":"Solicitud de membresía procesada. Revisa el correo de confirmación y el historial interno.",
    "Enter your DRX staff username and password.":"Ingresa tu usuario y contraseña del equipo DRX.", "Staff access denied. Check your username and password.":"Acceso denegado. Revisa tu usuario y contraseña.",
    "Staff access is temporarily unavailable. Please try again later.":"El acceso del equipo no está disponible temporalmente. Inténtalo más tarde.", "Approval could not be confirmed. Check the membership history before retrying with the same payment reference.":"No se pudo confirmar la aprobación. Revisa el historial de la membresía antes de reintentar con la misma referencia de pago.",
    "Complete the membership fields and confirm that DRX has verified payment.":"Completa los campos y confirma que DRX verificó el pago.", "Too many requests. Please try again later.":"Demasiadas solicitudes. Inténtalo más tarde.", "Signed out. Sign in again to continue.":"Sesión cerrada. Ingresa de nuevo para continuar."
  };
  const t = key => language === "es" ? es[key] || key : key;
  try { if (localStorage.getItem("drx.language") === "es") language = "es"; } catch {}
  function translate() {
    document.documentElement.lang = language; document.title = language === "es" ? "DRX · Acceso del equipo" : "DRX · Staff access";
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    if (status) $(status.target).textContent = t(status.key);
  }
  function message(target, key, error = false) { status = { target, key }; $(target).textContent = t(key); $(target).classList.toggle("error-text", error); }
  function signOut(key = "") {
    authorization = ""; clearTimeout(logoutTimer); $("staff-login").reset(); $("membership-form").reset(); $("membership-fields").disabled = false;
    $("new-operation").hidden = true; $("staff-panel").hidden = true; $("login-panel").hidden = false; $("approval-status").textContent = ""; $("login-status").textContent = ""; status = null;
    if (key) message("login-status", key);
  }
  function refreshTimeout() { clearTimeout(logoutTimer); logoutTimer = setTimeout(() => signOut("Signed out. Sign in again to continue."), 15 * 60 * 1000); }
  async function api(path, payload, credential) {
    const response = await fetch(apiBase + path, { method: "POST", credentials: "omit", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: credential }, body: JSON.stringify(payload), signal: AbortSignal.timeout(path.endsWith("/access") ? 25000 : 70000) });
    let data; try { data = await response.json(); } catch { throw new Error("Staff access is temporarily unavailable. Please try again later."); }
    if (!response.ok) { const error = new Error(Object.hasOwn(es, data.error) ? data.error : "Staff access is temporarily unavailable. Please try again later."); error.status = response.status; throw error; }
    return data;
  }
  $("language").value = language; $("language").addEventListener("change", () => { language = $("language").value === "es" ? "es" : "en"; try { localStorage.setItem("drx.language", language); } catch {} translate(); });
  $("staff-login").addEventListener("submit", async event => {
    event.preventDefault(); if (busy || !event.target.reportValidity()) return;
    busy = true; $("login-submit").disabled = true; message("login-status", "Checking staff access…");
    const form = new FormData(event.target), bytes = new TextEncoder().encode(form.get("username") + ":" + form.get("password"));
    const candidate = "Basic " + btoa(String.fromCharCode(...bytes));
    $("staff-login").elements.password.value = "";
    try {
      const result = await api("/api/staff/access", {}, candidate); if (result.authenticated !== true) throw Error("Staff access denied. Check your username and password.");
      authorization = candidate; $("staff-login").reset(); $("login-status").textContent = ""; status = null;
      $("login-panel").hidden = true; $("staff-panel").hidden = false; refreshTimeout(); $("membership-form").elements.email.focus();
    } catch (error) { authorization = ""; message("login-status", Object.hasOwn(es, error.message) ? error.message : "Staff access is temporarily unavailable. Please try again later.", true); }
    finally { busy = false; $("login-submit").disabled = false; }
  });
  $("staff-logout").addEventListener("click", () => signOut());
  window.addEventListener("pagehide", () => signOut());
  $("membership-form").addEventListener("submit", async event => {
    event.preventDefault(); if (busy || !authorization || !event.target.reportValidity()) return;
    busy = true; const data = new FormData(event.target), payload = Object.fromEntries(data); payload.paymentConfirmed = data.get("paymentConfirmed") === "on";
    $("membership-fields").disabled = true; $("new-operation").hidden = true; message("approval-status", "Applying membership…");
    try {
      const result = await api("/api/staff/membership", payload, authorization); if (result.status !== "processed") throw Error("Approval could not be confirmed. Check the membership history before retrying with the same payment reference.");
      message("approval-status", "Membership request processed. Check the confirmation email and internal history."); $("new-operation").hidden = false; refreshTimeout();
    } catch (error) {
      if (error.status === 401) signOut("Staff access denied. Check your username and password.");
      else { message("approval-status", error.status === 400 ? error.message : "Approval could not be confirmed. Check the membership history before retrying with the same payment reference.", true); $("new-operation").hidden = false; }
    } finally { busy = false; }
  });
  $("new-operation").addEventListener("click", () => { $("membership-form").reset(); $("membership-fields").disabled = false; $("approval-status").textContent = ""; status = null; $("new-operation").hidden = true; $("membership-form").elements.email.focus(); });
  translate();
})();

"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { token: "", email: "", file: null, preview: null, example: false, busy: false, job: null, requestId: null, previewOnly: false, poll: null };
  const apiBase = (window.DRX_CONFIG?.apiBase || "").replace(/\/$/, "");
  const format = { format: value => new Intl.NumberFormat(window.DRX_I18N?.language === "es" ? "es-EC" : "en-US", { maximumFractionDigits: 2 }).format(value) };
  function error(message = "") { $("error").hidden = !message; $("error").textContent = message; }
  async function api(path, body, method = "POST") {
    const response = await fetch(apiBase + path, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(state.token ? { Authorization: "Bearer " + state.token } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(path === "/api/jobs" ? 125000 : 45000) });
    let payload;
    try { payload = await response.json(); } catch { throw new Error("No pudimos conectar con el servicio DRX. Inténtalo más tarde."); }
    if (!response.ok) throw new Error(payload.error || "No se pudo completar la solicitud.");
    return payload;
  }
  function setStep(step) {
    for (let i = 1; i <= 3; i++) { $("step" + i).classList.toggle("active", i === step); $("step" + i).classList.toggle("done", i < step); }
  }
  function canSubmit() {
    $("submit-job").disabled = !state.token || state.previewOnly || state.example || !state.preview?.exportable || !$("reviewed").checked || state.busy || Boolean(state.job);
  }
  $("email-form").addEventListener("submit", async (event) => {
    event.preventDefault(); error();
    if (!$("email").checkValidity()) { error("Escribe un correo válido."); return; }
    $("verify").disabled = true; $("verify").textContent = "Comprobando…";
    try {
      const result = await api("/api/check-email", { email: $("email").value });
      state.token = result.token; state.email = result.email; state.previewOnly = result.previewOnly === true;
      $("email-status").textContent = state.previewOnly ? "You can preview your file. Email delivery will be available soon." : "Correo registrado. Ya puedes cargar tu archivo.";
      $("email-status").classList.add("success"); $("choose").disabled = false; $("dropzone").classList.remove("locked");
      $("email").disabled = true; $("verify").textContent = state.previewOnly ? "Continue ✓" : "Verificado ✓";
    } catch (exc) { error(exc.message); $("verify").disabled = false; $("verify").textContent = "Continuar →"; }
  });
  $("choose").addEventListener("click", () => $("file").click());
  $("file").addEventListener("change", () => { if ($("file").files[0]) loadFile($("file").files[0]); });
  for (const type of ["dragenter", "dragover"]) $("dropzone").addEventListener(type, (event) => { event.preventDefault(); if (state.token) $("dropzone").classList.add("dragging"); });
  for (const type of ["dragleave", "drop"]) $("dropzone").addEventListener(type, (event) => { event.preventDefault(); $("dropzone").classList.remove("dragging"); });
  $("dropzone").addEventListener("drop", (event) => { if (!state.token) { error("Comprueba tu correo antes de subir un archivo."); return; } if (event.dataTransfer.files.length !== 1) { error("Carga un solo archivo a la vez."); return; } loadFile(event.dataTransfer.files[0]); });
  async function loadFile(file) {
    error();
    if (state.busy) return;
    if (!/\.(tap|nc|gcode|xlsx)$/i.test(file.name)) { error("Choose a G-code or Excel .xlsx file."); return; }
    if (!file.size || file.size > 12 * 1024 * 1024) { error("El archivo debe pesar entre 1 byte y 12 MB."); return; }
    state.busy = true; $("choose").disabled = true; $("choose").textContent = "Leyendo recorrido…";
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const source = { name: file.name, data: btoa(binary) };
      const preview = await api("/api/preview", source);
      state.file = source; state.requestId = crypto.randomUUID(); showPreview(preview, file.name, false);
    } catch (exc) { error(exc.message); }
    finally { state.busy = false; $("choose").disabled = !state.token; $("choose").textContent = "Seleccionar archivo"; canSubmit(); }
  }
  function showPreview(preview, filename, example) {
    viewer.stop(); clearTimeout(state.poll); state.job = null; state.preview = preview; state.example = example;
    $("start").hidden = true; $("review").hidden = false; $("preview-type").textContent = example ? "EJEMPLO · NO SE ENVIARÁ NINGÚN ARCHIVO" : "VISTA PREVIA DEL RECORRIDO";
    $("filename").textContent = filename; $("count").textContent = format.format(preview.count); $("part-count").textContent = example ? "Ejemplo" : (preview.exportable ? preview.parts.length : "Revisar");
    $("bounds").replaceChildren();
    for (const axis of ["X", "Y", "Z"]) {
      const box = document.createElement("div"), label = document.createElement("small"), value = document.createElement("span");
      label.textContent = axis; value.textContent = format.format(preview.bounds[axis][1] - preview.bounds[axis][0]) + " mm"; box.append(label, value); $("bounds").append(box);
    }
    $("warnings").replaceChildren();
    for (const warning of preview.warnings) {
      if (warning.startsWith("Los avances F")) continue;
      const li = document.createElement("li");
      li.textContent = warning.startsWith("Perfil W:") ? "La orientación y la velocidad son las del perfil DRX W. Las velocidades y los movimientos rápidos del G-code no se trasladan automáticamente al brazo." : warning;
      $("warnings").append(li);
    }
    $("export-issue").hidden = !preview.exportIssue; $("export-issue").textContent = preview.exportIssue || "";
    $("reviewed").checked = false; $("reviewed").disabled = example; $("job-status").textContent = "";
    $("delivery-note").textContent = state.previewOnly && !example ? "Email delivery will be available soon. You can preview your files now." : example ? "Este ejemplo es solo una vista previa. Vuelve a Cargar para comprobar tu correo y subir tu archivo." : "El respaldo se enviará a " + state.email + ". La conversión se inicia al confirmar.";
    $("timeline").max = preview.count; $("timeline").value = preview.count;
    viewer.setPoints(preview.points, preview.bounds); setStep(2); canSubmit(); window.scrollTo({ top: 0, behavior: "instant" });
  }
  $("change-file").addEventListener("click", () => {
    viewer.stop(); clearTimeout(state.poll); state.job = null; state.requestId = null; state.preview = null; state.file = null;
    $("review").hidden = true; $("start").hidden = false; $("file").value = ""; setStep(1); error();
  });
  $("reviewed").addEventListener("change", canSubmit);
  $("submit-job").addEventListener("click", async () => {
    if (state.busy || state.job) return;
    error(); state.busy = true; canSubmit(); $("job-status").textContent = "DRX is preparing your backup…";
    try {
      const result = await api("/api/jobs", { ...state.file, requestId: state.requestId, reviewed: $("reviewed").checked });
      state.job = result.jobId; setStep(3); $("job-status").textContent = "Solicitud recibida. DRX está preparando tu respaldo…";
      const started = Date.now();
      const poll = async () => {
        try {
          const job = await api("/api/jobs/" + state.job, null, "GET");
          if (job.status === "sent") { $("job-status").textContent = "✓ Respaldo enviado a " + state.email + ". Revisa también tu carpeta de spam."; return; }
          if (job.status === "failed") { $("job-status").textContent = job.message || "No se pudo completar el proceso. Contacta con DRX."; return; }
          if (job.status === "unconfirmed") { $("job-status").textContent = "El proceso sigue pendiente. No se ha confirmado el envío; contacta con DRX con la referencia " + state.job + "."; return; }
          if (job.status === "ready") $("job-status").textContent = "Respaldo generado. Pendiente de confirmación del envío por correo…";
          if (Date.now() - started > 10 * 60 * 1000) { $("job-status").textContent = "El proceso sigue pendiente. No se ha confirmado el envío; contacta con DRX con la referencia " + state.job.slice(0, 8) + "."; return; }
          state.poll = setTimeout(poll, 4000);
        } catch (exc) { $("job-status").textContent = "No se pudo consultar el estado: " + exc.message; state.poll = setTimeout(poll, 5000); }
      };
      state.poll = setTimeout(poll, 2000);
    } catch (exc) { error(exc.message); }
    finally { state.busy = false; canSubmit(); }
  });

  class PathViewer {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.points = []; this.yaw = -.65; this.pitch = .9; this.zoom = 1; this.fraction = 1; this.playing = false; this.pending = false;
      new ResizeObserver(() => this.requestDraw()).observe(canvas);
      canvas.addEventListener("pointerdown", (event) => { canvas.setPointerCapture(event.pointerId); this.drag = [event.clientX, event.clientY]; });
      canvas.addEventListener("pointermove", (event) => { if (!this.drag) return; this.yaw += (event.clientX - this.drag[0]) * .007; this.pitch = Math.max(.02, Math.min(Math.PI / 2, this.pitch + (event.clientY - this.drag[1]) * .007)); this.drag = [event.clientX, event.clientY]; this.requestDraw(); });
      canvas.addEventListener("pointerup", () => { this.drag = null; }); canvas.addEventListener("pointercancel", () => { this.drag = null; });
      canvas.addEventListener("wheel", (event) => { event.preventDefault(); this.zoom = Math.max(.2, Math.min(12, this.zoom * Math.exp(-event.deltaY * .001))); this.requestDraw(); }, { passive: false });
      canvas.addEventListener("keydown", (event) => { if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-"].includes(event.key)) return; event.preventDefault(); if (event.key === "ArrowLeft") this.yaw -= .1; if (event.key === "ArrowRight") this.yaw += .1; if (event.key === "ArrowUp") this.pitch = Math.min(Math.PI / 2, this.pitch + .1); if (event.key === "ArrowDown") this.pitch = Math.max(.02, this.pitch - .1); if (event.key === "+" || event.key === "=") this.zoom = Math.min(12, this.zoom * 1.1); if (event.key === "-") this.zoom = Math.max(.2, this.zoom / 1.1); this.requestDraw(); });
    }
    setPoints(points, bounds) {
      this.points = points; this.bounds = bounds;
      // Orbit around the robot's world origin, with both robot circles in the fit.
      this.center = [0, 0, 0];
      this.span = 2 * Math.max(1900, ...["X", "Y", "Z"].flatMap(a => bounds[a].map(Math.abs)));
      this.yaw = -.65; this.pitch = .9; this.zoom = 1; this.fraction = 1; this.requestDraw();
    }
    rotate([x, y, z]) {
      const horizontal = Math.cos(this.yaw) * x - Math.sin(this.yaw) * y;
      const depth = Math.sin(this.yaw) * x + Math.cos(this.yaw) * y;
      return [horizontal, -(z * Math.cos(this.pitch) + depth * Math.sin(this.pitch))];
    }
    project(point, width, height) {
      const [x, y] = this.rotate(point.map((v, i) => (v - this.center[i]) / this.span));
      const scale = Math.min(width, height) * .75 * this.zoom;
      return [width / 2 + x * scale, height / 2 + y * scale];
    }
    requestDraw() { if (this.pending) return; this.pending = true; requestAnimationFrame(() => { this.pending = false; this.draw(); }); }
    draw() {
      if (!this.points.length) return;
      const { canvas, ctx } = this, w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const ratio = Math.min(devicePixelRatio || 1, 2); canvas.width = w * ratio; canvas.height = h * ratio; ctx.scale(ratio, ratio); ctx.clearRect(0, 0, w, h);
      const project = p => this.project(p, w, h), line = (a, b) => { const p = project(a), q = project(b); ctx.moveTo(...p); ctx.lineTo(...q); };
      const z = 0; ctx.strokeStyle = "#2d496344"; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = -6; i <= 6; i++) { const v = i * this.span / 10; line([this.center[0] + v, this.center[1] - this.span * .6, z], [this.center[0] + v, this.center[1] + this.span * .6, z]); line([this.center[0] - this.span * .6, this.center[1] + v, z], [this.center[0] + this.span * .6, this.center[1] + v, z]); } ctx.stroke();
      // Base diameter: 500 mm. Reach: R1900, 310 degrees centered on +X.
      // The remaining 50-degree rear sector is centered on -X.
      for (const radius of [1900, 250]) {
        const reach = radius === 1900;
        const startAngle = reach ? -155 * Math.PI / 180 : 0;
        const sweep = reach ? 310 * Math.PI / 180 : Math.PI * 2;
        ctx.beginPath();
        if (reach) ctx.moveTo(...project([0, 0, 0]));
        for (let i = 0; i <= 128; i++) {
          const angle = startAngle + i * sweep / 128;
          const xy = project([radius * Math.cos(angle), radius * Math.sin(angle), 0]);
          if (i === 0 && !reach) ctx.moveTo(...xy); else ctx.lineTo(...xy);
        }
        ctx.closePath(); ctx.fillStyle = radius === 250 ? "#378bdf35" : "#378bdf09"; ctx.fill();
        ctx.strokeStyle = radius === 250 ? "#75baff" : "#4d9cec"; ctx.lineWidth = radius === 250 ? 1.8 : 1.4;
        ctx.setLineDash(radius === 1900 ? [6, 5] : []); ctx.stroke();
      }
      ctx.setLineDash([]);
      const until = Math.max(1, Math.round(this.points.length * this.fraction));
      for (const category of ["base", "rapid", "work"]) {
        ctx.strokeStyle = category === "base" ? "#41597855" : category === "rapid" ? "#7196c5" : "#e4bb72"; ctx.lineWidth = category === "work" ? 1.4 : .85; ctx.beginPath();
        for (let i = 1; i < this.points.length; i++) {
          if (category !== "base" && (i >= until || Boolean(this.points[i][4]) !== (category === "rapid"))) continue;
          line(this.points[i - 1].slice(0, 3), this.points[i].slice(0, 3));
        } ctx.stroke();
      }
      const current = project(this.points[Math.min(until - 1, this.points.length - 1)].slice(0, 3)); ctx.fillStyle = "#f5d795"; ctx.beginPath(); ctx.arc(...current, 4, 0, Math.PI * 2); ctx.fill();
      const axes = [["X", "#e08487", [1, 0, 0]], ["Y", "#8ed3bc", [0, 1, 0]], ["Z", "#7fb3e5", [0, 0, 1]]];
      const arrow = (start, end, label, color) => {
        const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6;
        if (length < 2) { ctx.beginPath(); ctx.arc(...start, 3, 0, Math.PI * 2); ctx.stroke(); ctx.fillText(label, start[0] + 7, start[1] - 7); return; }
        const angle = Math.atan2(dy, dx);
        ctx.beginPath(); ctx.moveTo(...start); ctx.lineTo(...end); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(...end);
        ctx.lineTo(end[0] - 6 * Math.cos(angle - .45), end[1] - 6 * Math.sin(angle - .45));
        ctx.lineTo(end[0] - 6 * Math.cos(angle + .45), end[1] - 6 * Math.sin(angle + .45)); ctx.closePath(); ctx.fill();
        ctx.fillText(label, end[0] + 8 * dx / length - 3, end[1] + 8 * dy / length + 3);
      };
      ctx.font = "11px system-ui";
      for (const [label, color, unit] of axes) {
        // Both the world axes and the orientation widget use the camera rotation.
        arrow(project([0, 0, 0]), project(unit.map(v => v * this.span * .13)), label, color);
        const [dx, dy] = this.rotate(unit);
        arrow([49, h - 72], [49 + dx * 30, h - 72 + dy * 30], label, color);
      }
      const origin = project([0, 0, 0]); ctx.fillStyle = "#c3d2e5"; ctx.fillText("0, 0, 0", origin[0] + 8, origin[1] + 16);
      $("point-label").textContent = format.format(until) + " / " + format.format(this.points.length);
    }
    stop() { this.playing = false; $("play").textContent = "▶"; $("play").setAttribute("aria-label", "Reproducir recorrido"); }
    play() {
      if (this.playing) { this.stop(); return; }
      if (this.fraction >= 1) this.fraction = 0;
      this.playing = true; $("play").textContent = "Ⅱ"; $("play").setAttribute("aria-label", "Pausar recorrido"); let previous = performance.now();
      // New 1× is one fifth of the original speed (90 seconds for the full toolpath).
      const frame = (now) => { if (!this.playing) return; this.fraction = Math.min(1, this.fraction + Math.min(now - previous, 100) / 90000 * Number($("play-speed").value)); previous = now; $("timeline").value = Math.max(1, Math.round(this.fraction * this.points.length)); this.requestDraw(); if (this.fraction >= 1) this.stop(); else requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    }
  }
  const viewer = new PathViewer($("canvas"));
  const speedOptions = [...$("speed-menu").querySelectorAll("[data-speed]")];
  function closeSpeedMenu(returnFocus = false) {
    $("speed-menu").hidden = true; $("speed-toggle").setAttribute("aria-expanded", "false");
    if (returnFocus) $("speed-toggle").focus();
  }
  function openSpeedMenu() {
    $("speed-menu").hidden = false; $("speed-toggle").setAttribute("aria-expanded", "true");
    (speedOptions.find(option => option.dataset.speed === $("play-speed").value) || speedOptions[0]).focus({ preventScroll: true });
  }
  $("speed-toggle").addEventListener("click", () => $("speed-menu").hidden ? openSpeedMenu() : closeSpeedMenu());
  $("speed-toggle").addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openSpeedMenu(); }
  });
  speedOptions.forEach(option => option.addEventListener("click", () => {
    $("play-speed").value = option.dataset.speed;
    $("speed-label").textContent = option.dataset.speed + "×";
    speedOptions.forEach(item => item.setAttribute("aria-selected", String(item === option)));
    closeSpeedMenu(true);
  }));
  $("speed-menu").addEventListener("keydown", event => {
    const index = speedOptions.indexOf(document.activeElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? speedOptions.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + speedOptions.length) % speedOptions.length;
      speedOptions[next].focus({ preventScroll: true });
    }
    if (event.key === "Tab") closeSpeedMenu();
  });
  document.addEventListener("click", event => { if (!event.target.closest(".speed-control")) closeSpeedMenu(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("speed-menu").hidden) { event.preventDefault(); closeSpeedMenu(true); } });
  window.addEventListener("drx-language-change", () => {
    if (!state.preview) return;
    $("count").textContent = format.format(state.preview.count);
    const values = $("bounds").querySelectorAll("span");
    ["X", "Y", "Z"].forEach((axis, i) => { if (values[i]) values[i].textContent = format.format(state.preview.bounds[axis][1] - state.preview.bounds[axis][0]) + " mm"; });
    viewer.requestDraw();
  });
  $("play").addEventListener("click", () => viewer.play());
  $("timeline").addEventListener("input", () => { viewer.stop(); viewer.fraction = Number($("timeline").value) / viewer.points.length; viewer.requestDraw(); });
  $("top-view").addEventListener("click", () => { viewer.pitch = Math.PI / 2; viewer.yaw = 0; viewer.requestDraw(); $("top-view").classList.add("selected"); $("free-view").classList.remove("selected"); });
  $("free-view").addEventListener("click", () => { viewer.pitch = .9; viewer.yaw = -.65; viewer.requestDraw(); $("free-view").classList.add("selected"); $("top-view").classList.remove("selected"); });
  $("fit-view").addEventListener("click", () => { viewer.zoom = 1; viewer.requestDraw(); });
  $("example").addEventListener("click", async () => {
    error(); try { const response = await fetch("examples/preview.json"); if (!response.ok) throw new Error("No se pudo abrir el ejemplo."); const preview = await response.json(); showPreview(preview, "Ejemplo DRX · Cortetodo · 4 pasadas", true); } catch (exc) { error(exc.message); }
  });
  fetch(apiBase + "/api/health").then(response => response.ok ? response.json() : { configured: false }).then(result => { $("environment").hidden = result.configured === true; if(result.previewAvailable === true && !result.configured) $("environment-message").textContent = "Email delivery will be available soon. You can preview your files now."; $("connection-settings").hidden = result.setupAvailable !== true; $("connect-delivery").hidden = result.setupAvailable !== true; }).catch(() => { $("environment").hidden = false; });
})();

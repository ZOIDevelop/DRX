"use strict";
(() => {
  let language = "en";
  try { if (localStorage.getItem("drx.language") === "es") language = "es"; } catch {}
  let messages = {}, reverse = {};
  const sources = new WeakMap(), attributes = new WeakMap();
  const patterns = [
    [/^El respaldo se enviará a (.+)\. La conversión se inicia al confirmar\.$/, m => `Your backup will be sent to ${m[1]}. Conversion starts when you confirm.`],
    [/^✓ Respaldo enviado a (.+)\. Revisa también tu carpeta de spam\.$/, m => `✓ Backup sent to ${m[1]}. Please also check your spam folder.`],
    [/^El proceso sigue pendiente\. No se ha confirmado el envío; contacta con DRX con la referencia (.+)\.$/, m => `Processing is still pending. Delivery has not been confirmed; contact DRX with reference ${m[1]}.`],
    [/^No se pudo consultar el estado: (.+)$/, m => `Unable to check the status: ${translate(m[1])}`],
    [/^Órdenes de máquina sin equivalencia automática: (.+)\. No se generan órdenes de husillo ni cambio de herramienta\.$/, m => `Machine commands without automatic mapping: ${m[1]}. Spindle and tool-change commands are not generated.`],
    [/^El tramo desde el punto (\d+) supera (\d+) puntos sin una retirada indicada\..*$/, m => `The segment starting at point ${m[1]} exceeds ${m[2]} points without an indicated retraction. It will not be split inside the cut. In Excel, mark BREAK_AFTER=1 at a reviewed retracted position.`],
    [/^Hay instrucciones después de M2\/M30 \(línea (\d+)\)\.$/, m => `Instructions were found after M2/M30 (line ${m[1]}).`],
    [/^Línea (\d+) demasiado larga\.$/, m => `Line ${m[1]} is too long.`],
    [/^Sintaxis no admitida en línea (\d+): (.*)$/, m => `Unsupported syntax on line ${m[1]}: ${m[2]}`],
    [/^(G.+) no está admitido en la V1 \(línea (\d+)\)\. Usa un recorrido de segmentos G0\/G1\.$/, m => `${m[1]} is not supported in V1 (line ${m[2]}). Use a G0/G1 linear toolpath.`],
    [/^Eje (.+) repetido en línea (\d+)\.$/, m => `Axis ${m[1]} is repeated on line ${m[2]}.`],
    [/^Avance inválido en línea (\d+)\.$/, m => `Invalid feed rate on line ${m[1]}.`],
    [/^(M.+) no está admitido \(línea (\d+)\)\.$/, m => `${m[1]} is not supported (line ${m[2]}).`],
    [/^La palabra (.+) requiere revisión \(línea (\d+)\)\.$/, m => `Word ${m[1]} requires review (line ${m[2]}).`],
    [/^Más de un tipo de movimiento en línea (\d+)\.$/, m => `More than one motion type on line ${m[1]}.`],
    [/^Falta G0\/G1 antes del movimiento en línea (\d+)\.$/, m => `G0/G1 is missing before the movement on line ${m[1]}.`],
    [/^No se conoce la posición inicial de (.+) para G91 \(línea (\d+)\)\.$/, m => `The initial ${m[1]} position for G91 is unknown (line ${m[2]}).`],
    [/^La V1 admite hasta (.+) puntos por solicitud\.$/, m => `V1 supports up to ${m[1]} points per request.`],
    [/^Fila (\d+): se requieren X, Y y Z completos\.$/, m => `Row ${m[1]}: complete X, Y and Z values are required.`],
    [/^Coordenada inválida (.*): (.*)$/, m => `Invalid coordinate ${m[1].replace("en línea", "on line").replace("en fila", "on row")}: ${m[2]}`],
  ];
  function translate(source) {
    if (language === "es") return source;
    if (messages[source]) return messages[source];
    for (const [pattern, render] of patterns) { const match = source.match(pattern); if (match) return render(match); }
    return source;
  }
  function localize(value, previous) {
    const original = previous && value === previous.output ? previous.source : value;
    const source = reverse[original] || original;
    return { source, output: translate(source) };
  }
  function apply() {
    document.documentElement.lang = language;
    document.title = translate("DRX Software · De tu archivo al brazo");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim() || node.parentElement?.closest("script,style,[data-no-translate]")) continue;
      const value = node.nodeValue.trim(), record = localize(value, sources.get(node));
      sources.set(node, record);
      if (record.output !== value) node.nodeValue = node.nodeValue.replace(value, record.output);
    }
    document.querySelectorAll("[aria-label],[placeholder],[title]").forEach(element => {
      if (element.closest("[data-no-translate]")) return;
      const records = attributes.get(element) || {};
      for (const name of ["aria-label", "placeholder", "title"]) {
        if (!element.hasAttribute(name)) continue;
        const value = element.getAttribute(name), record = localize(value, records[name]);
        records[name] = record;
        if (record.output !== value) element.setAttribute(name, record.output);
      }
      attributes.set(element, records);
    });
  }
  window.DRX_I18N = { get language() { return language; }, translate };
  const picker = document.getElementById("language"); picker.value = language;
  picker.addEventListener("change", () => {
    language = picker.value === "es" ? "es" : "en";
    try { localStorage.setItem("drx.language", language); } catch {}
    apply(); window.dispatchEvent(new Event("drx-language-change"));
  });
  let queued = false;
  new MutationObserver(() => {
    if (!queued) { queued = true; queueMicrotask(() => { queued = false; apply(); }); }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "placeholder", "title"] });
  fetch("translations.json").then(response => { if (!response.ok) throw new Error("Translations unavailable"); return response.json(); }).then(data => {
    messages = data; reverse = Object.fromEntries(Object.entries(data).map(([es, en]) => [en, es]));
    apply(); window.dispatchEvent(new Event("drx-language-change"));
  }).catch(() => { apply(); });
  apply();
})();

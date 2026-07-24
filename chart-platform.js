(function initCharts(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TonTrackCharts = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createCharts(root) {
  "use strict";

  const definitions = Object.freeze({
    portfolio: { screen: "home", selector: '[data-screen="home"] .value-graph canvas', renderer: "line-area", ranges: ["1D", "7D", "1M"], controls: ["range", "tooltip", "currency"], pipeline: ["/api/wallet/history", "/api/wallet/history-status"], detail: { showArea: true, showAxes: true } },
    allocation: { screen: "home", selector: '[data-screen="home"] .donut-chart', renderer: "doughnut", ranges: [], controls: ["segment", "legend"], pipeline: ["wallet-import"] },
    analytics: { screen: "analytics", selector: '[data-screen="analytics"] .value-graph canvas', renderer: "line", ranges: ["1D", "7D", "1M"], controls: [], pipeline: ["wallet-history-cache"], detail: { showArea: false, showAxes: false } },
    tokenPrice: { screen: "detail", selector: "#detailPriceChart", renderer: "line-area", ranges: ["day", "week", "month", "year", "all"], labels: { day: "Day", week: "Week", month: "Month", year: "Year", all: "All" }, controls: ["range", "tooltip", "currency"], pipeline: ["/api/token-detail-data"], detail: { showArea: true, showAxes: true, showPoints: false } },
    collectibleFloor: { screen: "detail", selector: "#giftDetailPriceChart, #detailPriceChart", renderer: "line", ranges: ["7d"], labels: { "7d": "7D" }, controls: ["range", "tooltip", "currency"], pipeline: ["/api/gift-registry/history", "/api/gift-detail-data", "/api/collection-floor", "/api/collection-sales", "TonAPI collection items"], detail: { showArea: false, showAxes: false, showPoints: true, interactive: true } },
  });
  const instances = new WeakMap();
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const reducedMotion = () => Boolean(root?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  function normalize(rows = []) {
    return rows.map((row, index) => Array.isArray(row)
      ? { timestamp: finite(row[0]), value: finite(row[1], Number.NaN), index }
      : { ...row, timestamp: finite(row?.timestamp), value: finite(row?.value, Number.NaN), index })
      .filter((point) => Number.isFinite(point.value));
  }

  function chartCanvas(element) {
    if (!element) return null;
    if (String(element.tagName || "").toLowerCase() === "canvas" || typeof element.getContext === "function") return element;
    let canvas = element.querySelector?.("canvas");
    if (!canvas && element.ownerDocument) {
      canvas = element.ownerDocument.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      element.prepend(canvas);
    }
    return canvas;
  }

  function replaceChart(canvas, config) {
    instances.get(canvas)?.destroy();
    const Chart = root?.Chart;
    if (!Chart || !canvas) return null;
    const chart = new Chart(canvas, config);
    instances.set(canvas, chart);
    return chart;
  }

  function renderSeries(family, rows = [], options = {}) {
    const definition = definitions[family];
    const element = options.element || root?.document?.querySelector(definition?.selector);
    const canvas = chartCanvas(element);
    if (!definition || !canvas) return null;
    if (options.loading) return { loading: true, points: [] };
    const points = normalize(rows);
    if (!points.length) {
      instances.get(canvas)?.destroy();
      instances.delete(canvas);
      return { empty: true, points: [] };
    }
    const style = { ...definition.detail, ...options };
    const labels = points.map((point) => style.formatTick?.(point) || "");
    const reference = Number(style.reference);
    const datasets = [{
      data: points.map((point) => point.value),
      borderColor: style.color || "#3B6CF8",
      backgroundColor: style.showArea ? (style.areaColor || "rgba(59,108,248,.16)") : "transparent",
      fill: Boolean(style.showArea), tension: 0.32, borderWidth: finite(style.lineWidth, style.showArea ? 3 : 4),
      pointRadius: style.showPoints ? 3 : 0, pointHoverRadius: 5,
      pointBackgroundColor: style.pointColor || "#fff", pointBorderColor: style.color || "#3B6CF8",
    }];
    if (Number.isFinite(reference)) datasets.push({
      data: points.map(() => reference), borderColor: style.referenceColor || "#6B7280", borderDash: [5, 5],
      borderWidth: 1, pointRadius: 0, fill: false,
    });
    const chart = replaceChart(canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: reducedMotion() ? 0 : finite(style.duration, 280), easing: style.easing || "easeOutQuart" },
        interaction: { mode: "index", intersect: false, axis: "x" },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: (items) => style.formatDate?.(points[items[0]?.dataIndex]) || labels[items[0]?.dataIndex] || "",
            label: (item) => item.datasetIndex ? (style.referenceText || "Reference") : (style.formatValue?.(points[item.dataIndex]) || String(item.raw)),
          } },
        },
        scales: {
          x: { display: Boolean(style.showAxes), grid: { display: false }, ticks: { color: style.tickColor || "#6B7280", maxTicksLimit: 5, maxRotation: 0 } },
          y: { display: Boolean(style.showAxes), grid: { color: style.gridColor || "rgba(255,255,255,.07)" }, ticks: { color: style.tickColor || "#7E8797", callback: style.formatAxis } },
        },
      },
    });
    return { chart, points };
  }

  function renderDonut(element, values = [], options = {}) {
    const normalized = values.map((value) => Math.max(0, finite(value)));
    const total = normalized.reduce((sum, value) => sum + value, 0);
    const segments = normalized.map((value, index) => ({ index, value, ratio: total ? value / total : 0 }));
    const canvas = chartCanvas(element);
    if (!canvas || !root?.Chart) return { segments, canvas };
    const selected = Number.isInteger(options.selected) ? options.selected : -1;
    const chart = replaceChart(canvas, {
      type: "doughnut",
      data: { labels: ["Gifts", "TON Tokens", "Stickers"], datasets: [{ data: normalized, backgroundColor: options.colors, borderWidth: 0, spacing: 2, offset: normalized.map((_, index) => index === selected ? 7 : 0) }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "64%", radius: "86%", circumference: 360 * finite(options.progress, 1), rotation: -90, animation: { duration: reducedMotion() ? 0 : 220 }, plugins: { legend: { display: false } } },
    });
    return { segments, canvas, chart };
  }

  function donutHitIndex(values = [], x = 0, y = 0, size = 160) {
    const center = finite(size, 160) / 2;
    if (Math.abs(Math.hypot(x, y) - center * 0.72) > center * 0.12) return -1;
    let angle = Math.atan2(y, x) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    const total = values.reduce((sum, value) => sum + Math.max(0, finite(value)), 0);
    let end = 0;
    return values.findIndex((value) => (end += total ? Math.max(0, finite(value)) / total : 0) >= angle / (Math.PI * 2));
  }

  function rangeButtons(family, active, options = {}) {
    const definition = definitions[family];
    const attribute = options.attribute || "data-range";
    return (definition?.ranges || []).map((range) => `<button class="mini-button${range === active ? " active" : ""}" type="button" ${attribute}="${range}">${definition.labels?.[range] || range.toUpperCase()}</button>`).join("");
  }

  function mountRangeControls(family, active, options = {}) {
    const host = options.element;
    if (!host) return null;
    let controls = host.querySelector(".token-chart-ranges");
    if (!controls) {
      controls = host.ownerDocument.createElement("div");
      controls.className = "token-chart-ranges";
      const before = options.before ? host.querySelector(options.before) : null;
      before?.insertAdjacentElement("beforebegin", controls) || host.prepend(controls);
    }
    controls.innerHTML = rangeButtons(family, active, options);
    return controls;
  }

  function seriesStats(values = []) {
    const rows = values.map(Number).filter(Number.isFinite);
    if (!rows.length) return null;
    const [first, latest] = [rows[0], rows.at(-1)];
    const [low, high] = [Math.min(...rows), Math.max(...rows)];
    return { first, latest, low, high, average: rows.reduce((sum, value) => sum + value, 0) / rows.length, changePct: first ? ((latest - first) / first) * 100 : 0, swingPct: low ? ((high - low) / low) * 100 : 0 };
  }

  return Object.freeze({ definitions, donutHitIndex, mountRangeControls, rangeButtons, renderConfigured: renderSeries, renderDetailSeries: renderSeries, renderDonut, seriesStats });
}));

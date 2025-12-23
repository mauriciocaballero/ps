// api/generate-pdf-report.js
export default async function handler(req, res) {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { psiData, clientName, siteUrl, email, phone } = req.body;

    if (!psiData || !psiData.lighthouseResult) {
      return res.status(400).json({ error: "Invalid PageSpeed data" });
    }

    const processed = processPageSpeedData(psiData);

    const siteName = extractSiteName(siteUrl);

    const reportDate = new Date().toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return res.status(200).json({
      success: true,
      filename: `reporte-${sanitizeFilename(clientName)}-${Date.now()}.pdf`,

      performanceScore: processed.performanceScore,
      seoScore: processed.seoScore,
      accessibilityScore: processed.accessibilityScore,
      bestPracticesScore: processed.bestPracticesScore,
      performanceGrade: processed.performanceGrade,

      // Métricas (objeto + array para iterar fácil en el template)
      metrics: processed.metrics,
      speedMetrics: processed.speedMetrics,

      badPoints: processed.badPoints,
      goodPoints: processed.goodPoints,
      infoPoints: processed.infoPoints,

      badPointsCount: processed.badPointsCount,
      goodPointsCount: processed.goodPointsCount,
      infoPointsCount: processed.infoPointsCount,

      client: { name: clientName, email, phone },
      site: { name: siteName, url: siteUrl },

      reportDate,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error processing data:", error);
    return res.status(500).json({ error: error.message });
  }
}

// --------------------------------------------
// Helpers
// --------------------------------------------
function extractSiteName(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "Sitio Web";
  }
}

function sanitizeFilename(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .substring(0, 50);
}

function stripMdLinks(text = "") {
  return String(text).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function categoryLabel(catKey) {
  const map = {
    performance: "Performance",
    seo: "SEO",
    accessibility: "Accesibilidad",
    "best-practices": "Best Practices",
  };
  return map[catKey] || "General";
}

function getScorePercent(cat) {
  if (!cat || typeof cat.score !== "number") return 0;
  return Math.round(cat.score * 100);
}

function performanceGrade(score) {
  return score >= 90
    ? "A - Excelente"
    : score >= 75
    ? "B - Bueno"
    : score >= 50
    ? "C - Necesita mejoras"
    : "D - Crítico";
}

function classifyAudit(audit) {
  const mode = audit?.scoreDisplayMode;
  const score = audit?.score;

  // excluidos
  if (mode === "notApplicable" || mode === "manual") return { include: false };

  // informative: lo incluimos PERO en infoPoints
  if (mode === "informative") return { include: true, bucket: "info" };

  // si no hay score, no lo usamos en good/bad
  if (score === null || score === undefined) return { include: false };

  // binary: 1 pass, 0 fail
  if (mode === "binary") return { include: true, bucket: score === 1 ? "good" : "bad", score };

  // numeric/otros: umbral 0.9
  return { include: true, bucket: score >= 0.9 ? "good" : "bad", score };
}

function severityFromScore(score0to1) {
  // severidad para BAD
  if (score0to1 <= 0.5) return "critical"; // rojo
  if (score0to1 < 0.9) return "high"; // naranja
  return "medium"; // amarillo (raro en bad, pero por si cambias umbral)
}

function metricStatusFromScore(score0to1) {
  // para métricas (verde/amarillo/rojo)
  if (score0to1 === null || score0to1 === undefined) return "neutral";
  if (score0to1 >= 0.9) return "good";
  if (score0to1 >= 0.5) return "warn";
  return "bad";
}

function buildAuditIndex(lhr) {
  // auditId -> { categoryKey, groupKey }
  const out = {};
  const cats = lhr.categories || {};
  for (const [catKey, cat] of Object.entries(cats)) {
    for (const ref of cat.auditRefs || []) {
      out[ref.id] = { categoryKey: catKey, groupKey: ref.group || null };
    }
  }
  return out;
}

function pickAudit(lhr, id) {
  return lhr?.audits?.[id] || null;
}

function buildSpeedMetrics(lhr) {
  const metrics = [
    { id: "first-contentful-paint", key: "fcp", label: "FCP" },
    { id: "largest-contentful-paint", key: "lcp", label: "LCP" },
    { id: "total-blocking-time", key: "tbt", label: "TBT" },
    { id: "cumulative-layout-shift", key: "cls", label: "CLS" },
    { id: "speed-index", key: "si", label: "Speed Index" },
    { id: "interactive", key: "tti", label: "TTI" },
  ];

  const items = [];
  for (const m of metrics) {
    const a = pickAudit(lhr, m.id);
    if (!a) continue;
    items.push({
      key: m.key,
      label: m.label,
      value: a.displayValue || "N/A",
      // score en Lighthouse para estas métricas existe y sirve para colorear
      status: metricStatusFromScore(typeof a.score === "number" ? a.score : null),
    });
  }
  return items;
}

// --------------------------------------------
// Main processing
// --------------------------------------------
function processPageSpeedData(psiData) {
  const lhr = psiData.lighthouseResult;
  const audits = lhr.audits || {};
  const categories = lhr.categories || {};
  const idx = buildAuditIndex(lhr);

  const performanceScore = getScorePercent(categories.performance);
  const seoScore = getScorePercent(categories.seo);
  const accessibilityScore = getScorePercent(categories.accessibility);
  const bestPracticesScore = getScorePercent(categories["best-practices"]);

  const goodPointsAll = [];
  const badPointsAll = [];
  const infoPointsAll = [];

  // Recorremos solo los audits referenciados por categorías (evita ruido)
  for (const [auditId, meta] of Object.entries(idx)) {
    const audit = audits[auditId];
    if (!audit) continue;

    const c = classifyAudit(audit);
    if (!c.include) continue;

    const category = categoryLabel(meta.categoryKey);
    const title = audit.title || auditId;
    const description = stripMdLinks(audit.description || "").trim();
    const displayValue = audit.displayValue || "";

    if (
      c.bucket === "info" ||
      audit.scoreDisplayMode === "numeric" && audit.score === null ||
      audit.scoreDisplayMode === "binary" && audit.score === null
    ) {
      infoPointsAll.push({
        category,
        title,
        description:
          description ||
          "Este punto no afecta directamente la puntuación, pero aporta información relevante.",
        displayValue,
        severity: "info",
        emoji: "ℹ️",
      });
      continue;
    }

    if (c.bucket === "good") {
      goodPointsAll.push({
        category,
        title,
        description: description || "Esta auditoría está aprobada.",
        displayValue,
        severity: "pass",
        // emoji opcional (por si luego ya renderiza)
        emoji: "✅",
      });
      continue;
    }

    // bad
    const sev = severityFromScore(c.score);
    badPointsAll.push({
      category,
      title,
      description: description || "Esta auditoría requiere atención.",
      displayValue,
      severity: sev,
      emoji: sev === "critical" ? "🔴" : sev === "high" ? "🟠" : "🟡",
    });
  }

  // Orden: BAD por severidad (y luego alfabético)
  const sevOrder = { critical: 0, high: 1, medium: 2 };
  badPointsAll.sort(
    (a, b) =>
      (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9) ||
      a.category.localeCompare(b.category) ||
      a.title.localeCompare(b.title)
  );

  goodPointsAll.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.title.localeCompare(b.title)
  );

  infoPointsAll.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.title.localeCompare(b.title)
  );

  // Recortes para PDF legible (ajústalo)
  const MAX_BAD = 14;
  const MAX_GOOD = 12;
  const MAX_INFO = 10;

  const badPoints = badPointsAll.slice(0, MAX_BAD);
  const goodPoints = goodPointsAll.slice(0, MAX_GOOD);
  const infoPoints = infoPointsAll.slice(0, MAX_INFO);

  // Métricas
  const speedMetrics = buildSpeedMetrics(lhr);
  const metricsObj = speedMetrics.reduce((acc, m) => {
    acc[m.key] = m.value;
    return acc;
  }, {});

  return {
    performanceScore,
    seoScore,
    accessibilityScore,
    bestPracticesScore,
    performanceGrade: performanceGrade(performanceScore),

    metrics: metricsObj,
    speedMetrics,

    badPoints,
    goodPoints,
    infoPoints,

    badPointsCount: badPointsAll.length,
    goodPointsCount: goodPointsAll.length,
    infoPointsCount: infoPointsAll.length,
  };
}

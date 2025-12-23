// api/generate-pdf-report.js
// Este endpoint hace TODO: recibe PageSpeed data, procesa Y genera el PDF

// api/generate-pdf-report.js
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export default async function handler(req, res) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { psiData, siteName, siteUrl } = req.body;

    if (!psiData || !psiData.lighthouseResult) {
      return res.status(400).json({ error: 'Invalid PageSpeed data' });
    }

    // 1. Procesar los datos de PageSpeed
    const processedData = processPageSpeedData(psiData);

    // 2. Generar el HTML del reporte
    const html = generateReportHTML({
      ...processedData,
      siteName: siteName || siteUrl,
      siteUrl: siteUrl,
      reportDate: new Date().toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    });

    // 3. Generar el PDF con Puppeteer - CONFIGURACIÓN CORREGIDA
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.setContent(html, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });

    await browser.close();

    // 4. Regresar el PDF como base64
    res.status(200).json({
      success: true,
      pdf: pdf.toString('base64'),
      filename: `reporte-${siteName || 'website'}-${Date.now()}.pdf`,
      ...processedData
    });

  } catch (error) {
    console.error('Error generating PDF:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}


// ============================================
// PROCESAMIENTO DE DATOS PAGESPEED
// ============================================

function processPageSpeedData(auditData) {
  const audits = auditData.lighthouseResult.audits;
  const categories = auditData.lighthouseResult.categories;

  const simplifiedRecommendations = {
    'uses-optimized-images': {
      category: 'Imágenes',
      issue: 'Las imágenes no están optimizadas',
      solution: 'Comprime las imágenes antes de subirlas usando herramientas como TinyPNG, ImageOptim o Squoosh. Un plugin como ShortPixel puede hacerlo automáticamente.',
      impact: 'alto',
      wpPlugin: 'ShortPixel, Imagify, EWWW Image Optimizer'
    },
    'modern-image-formats': {
      category: 'Imágenes',
      issue: 'Las imágenes están en formatos antiguos (JPG/PNG)',
      solution: 'Convierte tus imágenes a WebP, un formato moderno que reduce el tamaño hasta 30% sin perder calidad.',
      impact: 'alto',
      wpPlugin: 'ShortPixel, Imagify'
    },
    'offscreen-images': {
      category: 'Imágenes',
      issue: 'Se cargan imágenes que no se ven inicialmente',
      solution: 'Activa lazy loading para que las imágenes solo se carguen cuando el usuario las va a ver.',
      impact: 'medio',
      wpPlugin: 'WP Rocket, LiteSpeed Cache'
    },
    'uses-responsive-images': {
      category: 'Imágenes',
      issue: 'Se sirven imágenes demasiado grandes para móviles',
      solution: 'WordPress genera automáticamente diferentes tamaños. Asegúrate de que tu tema use srcset correctamente.',
      impact: 'medio',
      wpPlugin: 'Verificar configuración del tema'
    },
    'server-response-time': {
      category: 'Servidor',
      issue: 'El servidor tarda mucho en responder (TTFB alto)',
      solution: 'Activa un plugin de caché como WP Rocket o LiteSpeed Cache. Si persiste, actualiza tu hosting.',
      impact: 'alto',
      wpPlugin: 'WP Rocket, LiteSpeed Cache, WP Super Cache'
    },
    'redirects': {
      category: 'Redirecciones',
      issue: 'Hay redirecciones innecesarias',
      solution: 'Elimina redirecciones en cadena. Actualiza los enlaces directamente al destino final.',
      impact: 'medio',
      wpPlugin: 'Redirection (para gestionar)'
    },
    'render-blocking-resources': {
      category: 'Recursos',
      issue: 'CSS y JavaScript bloquean la carga inicial',
      solution: 'Un plugin de optimización puede cargar estos archivos de forma asíncrona.',
      impact: 'alto',
      wpPlugin: 'WP Rocket, Autoptimize, Asset CleanUp'
    },
    'unused-css-rules': {
      category: 'CSS',
      issue: 'Hay CSS que no se usa en la página',
      solution: 'Desactiva plugins innecesarios. Cada plugin agrega CSS que quizás no necesites.',
      impact: 'medio',
      wpPlugin: 'Asset CleanUp, WP Rocket'
    },
    'uses-text-compression': {
      category: 'Servidor',
      issue: 'Los archivos no están comprimidos',
      solution: 'Activa compresión GZIP o Brotli. Los plugins de caché lo hacen automáticamente.',
      impact: 'alto',
      wpPlugin: 'WP Rocket, LiteSpeed Cache'
    },
    'font-display': {
      category: 'Fuentes',
      issue: 'Las fuentes hacen que el texto tarde en aparecer',
      solution: 'Configura font-display: swap para que el texto aparezca inmediatamente.',
      impact: 'medio',
      wpPlugin: 'OMGF, WP Rocket'
    },
    'uses-long-cache-ttl': {
      category: 'Caché',
      issue: 'Los archivos no se guardan en caché',
      solution: 'Configura browser caching para que imágenes, CSS y JS se guarden más tiempo.',
      impact: 'alto',
      wpPlugin: 'WP Rocket, LiteSpeed Cache'
    },
    'efficient-animated-content': {
      category: 'Video',
      issue: 'Usas GIFs animados pesados',
      solution: 'Convierte los GIFs a video MP4. Son hasta 95% más ligeros.',
      impact: 'alto',
      wpPlugin: 'Convertir manualmente o usar Cloudinary'
    },
    'largest-contentful-paint-element': {
      category: 'Performance',
      issue: 'El elemento principal tarda mucho en cargar',
      solution: 'Optimiza la imagen hero. Usa WebP, comprime y considera un CDN.',
      impact: 'alto',
      wpPlugin: 'ShortPixel + Cloudflare CDN'
    },
    'layout-shift-elements': {
      category: 'Performance',
      issue: 'Los elementos se mueven mientras carga (CLS)',
      solution: 'Define width y height en todas las imágenes y videos.',
      impact: 'medio',
      wpPlugin: 'Revisar configuración del tema'
    },
    'is-on-https': {
      category: 'Seguridad',
      issue: 'El sitio no usa HTTPS',
      solution: 'URGENTE: Instala un certificado SSL. La mayoría de hostings lo ofrecen gratis.',
      impact: 'crítico',
      wpPlugin: 'Really Simple SSL'
    },
    'total-byte-weight': {
      category: 'Tamaño',
      issue: 'La página es demasiado pesada',
      solution: 'Revisa plugins activos. Cada uno suma peso. Optimiza imágenes y usa CDN.',
      impact: 'alto',
      wpPlugin: 'Query Monitor'
    },
    'dom-size': {
      category: 'Estructura HTML',
      issue: 'La página tiene demasiados elementos HTML',
      solution: 'Si usas Elementor o Divi, generan HTML excesivo. Simplifica el diseño.',
      impact: 'medio',
      wpPlugin: 'Considerar alternativas'
    },
    'third-party-summary': {
      category: 'Scripts Externos',
      issue: 'Scripts de terceros ralentizan el sitio',
      solution: 'Revisa Google Analytics, píxeles de Facebook, etc. Cárgalos con delay.',
      impact: 'medio',
      wpPlugin: 'Flying Scripts, WP Rocket'
    },
    'bootup-time': {
      category: 'Ejecución',
      issue: 'JavaScript toma mucho tiempo en ejecutarse',
      solution: 'Plugins pesados como page builders y sliders causan esto.',
      impact: 'alto',
      wpPlugin: 'Query Monitor + Asset CleanUp'
    }
  };

  let goodPoints = [];
  let badPoints = [];
  let criticalIssues = [];

  Object.keys(audits).forEach(auditKey => {
    const audit = audits[auditKey];
    const recommendation = simplifiedRecommendations[auditKey];
    
    if (recommendation && audit.score !== null) {
      const point = {
        category: recommendation.category,
        title: recommendation.issue,
        description: recommendation.solution,
        impact: recommendation.impact,
        score: audit.score,
        displayValue: audit.displayValue || '',
        wpPlugin: recommendation.wpPlugin || 'N/A'
      };
      
      if (audit.score >= 0.9) {
        goodPoints.push({ ...point, emoji: '✅' });
      } else if (recommendation.impact === 'crítico') {
        criticalIssues.push({ ...point, emoji: '🔴' });
      } else {
        badPoints.push({ 
          ...point, 
          emoji: recommendation.impact === 'alto' ? '🟠' : '🟡'
        });
      }
    }
  });

  const impactOrder = { 'crítico': 0, 'alto': 1, 'medio': 2, 'bajo': 3 };
  badPoints.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);
  goodPoints.sort((a, b) => a.category.localeCompare(b.category));

  const topBadPoints = [...criticalIssues, ...badPoints].slice(0, 10);
  const topGoodPoints = goodPoints.slice(0, 10);

  const performanceScore = categories.performance 
    ? Math.round(categories.performance.score * 100) 
    : 0;

  return {
    performanceScore,
    performanceGrade: 
      performanceScore >= 90 ? 'A - Excelente' : 
      performanceScore >= 75 ? 'B - Bueno' : 
      performanceScore >= 50 ? 'C - Necesita mejoras' : 
      'D - Crítico',
    hasCriticalIssues: criticalIssues.length > 0,
    fcp: audits['first-contentful-paint']?.displayValue || 'N/A',
    lcp: audits['largest-contentful-paint']?.displayValue || 'N/A',
    cls: audits['cumulative-layout-shift']?.displayValue || 'N/A',
    tti: audits['interactive']?.displayValue || 'N/A',
    tbt: audits['total-blocking-time']?.displayValue || 'N/A',
    si: audits['speed-index']?.displayValue || 'N/A',
    goodPoints: topGoodPoints,
    badPoints: topBadPoints,
    goodPointsCount: topGoodPoints.length,
    badPointsCount: topBadPoints.length
  };
}

// ============================================
// GENERACIÓN DEL HTML
// ============================================

function generateReportHTML(data) {
  const goodPointsHTML = data.goodPoints.map((p, i) => `
    <div style="margin-bottom:20px">
      <div style="font-weight:600;color:#059669;margin-bottom:5px">
        ${i + 1}. ${p.emoji} ${p.category}: ${p.title}
      </div>
      <div style="padding-left:25px;color:#666;font-size:13px">
        ${p.description}
        ${p.wpPlugin !== 'N/A' ? `<br><em>Plugin: ${p.wpPlugin}</em>` : ''}
      </div>
    </div>
  `).join('');

  const badPointsHTML = data.badPoints.map((p, i) => {
    const impactLabel = 
      p.impact === 'crítico' ? '🔴 CRÍTICO' : 
      p.impact === 'alto' ? '🟠 ALTO' : '🟡 MEDIO';
    
    return `
      <div style="margin-bottom:25px;padding:15px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:4px">
        <div style="font-weight:600;color:#dc2626;margin-bottom:8px">
          ${i + 1}. ${impactLabel} - ${p.category}: ${p.title}
        </div>
        <div style="padding-left:25px;color:#333;font-size:13px;line-height:1.7">
          <strong>💡 Solución:</strong> ${p.description}
          ${p.wpPlugin !== 'N/A' ? `<br><strong>🔧 Plugin recomendado:</strong> ${p.wpPlugin}` : ''}
          ${p.displayValue ? `<br><strong>📊 Mejora estimada:</strong> ${p.displayValue}` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:40px;color:#1a1a1a;line-height:1.6;background:#fff}
.header{border-bottom:4px solid #0066cc;padding-bottom:20px;margin-bottom:30px}
.header h1{color:#0066cc;font-size:32px;margin-bottom:12px;font-weight:700}
.site-info{font-size:16px;color:#333;margin-bottom:8px}
.site-url{color:#666;font-size:14px;font-family:monospace;background:#f5f5f5;padding:6px 12px;border-radius:4px;display:inline-block}
.date{color:#888;font-size:13px;margin-top:8px}
.score-box{background:linear-gradient(135deg,${data.hasCriticalIssues ? '#eb3349,#f45c43' : '#667eea,#764ba2'});color:#fff;padding:40px;border-radius:12px;text-align:center;margin:30px 0;box-shadow:0 4px 20px rgba(0,0,0,0.15)}
.score{font-size:72px;font-weight:700;margin-bottom:10px}
.grade{font-size:22px;opacity:0.95}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin:30px 0}
.metric{background:#f8f9fa;border:2px solid #e5e7eb;padding:20px;border-radius:8px;text-align:center}
.metric .label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600}
.metric .value{font-size:24px;font-weight:700}
.section{margin:40px 0}
.section h2{font-size:24px;margin-bottom:20px;padding-bottom:12px;border-bottom:3px solid #e5e7eb}
.section.good h2{color:#059669;border-bottom-color:#10b981}
.section.bad h2{color:#dc2626;border-bottom-color:#ef4444}
.footer{margin-top:50px;padding-top:20px;border-top:2px solid #e5e7eb;text-align:center;color:#6b7280;font-size:12px;line-height:1.8}
</style>
</head>
<body>

<div class="header">
<h1>Reporte de Rendimiento Web</h1>
<div class="site-info"><strong>${data.siteName}</strong></div>
<div class="site-url">${data.siteUrl}</div>
<div class="date">Generado: ${data.reportDate}</div>
</div>

<div class="score-box">
<div class="score">${data.performanceScore}</div>
<div class="grade">${data.performanceGrade}</div>
</div>

<div class="metrics">
<div class="metric"><div class="label">FCP</div><div class="value">${data.fcp}</div></div>
<div class="metric"><div class="label">LCP</div><div class="value">${data.lcp}</div></div>
<div class="metric"><div class="label">CLS</div><div class="value">${data.cls}</div></div>
<div class="metric"><div class="label">TTI</div><div class="value">${data.tti}</div></div>
<div class="metric"><div class="label">TBT</div><div class="value">${data.tbt}</div></div>
<div class="metric"><div class="label">Speed Index</div><div class="value">${data.si}</div></div>
</div>

<div class="section bad">
<h2>⚠ Oportunidades de Mejora (${data.badPointsCount} puntos)</h2>
${badPointsHTML}
</div>

<div style="page-break-before:always"></div>

<div class="section good">
<h2>✓ Aspectos Bien Implementados (${data.goodPointsCount} puntos)</h2>
${goodPointsHTML}
</div>

<div class="footer">
<p><strong>¿Cómo usar este reporte?</strong></p>
<p>Las recomendaciones están ordenadas por prioridad e impacto.<br>
Los emojis indican urgencia: 🔴 Crítico, 🟠 Alto, 🟡 Medio</p>
<p style="margin-top:12px">
Generado automáticamente con Google PageSpeed Insights
</p>
</div>

</body>
</html>
  `;
}

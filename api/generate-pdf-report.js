// api/generate-pdf-report.js
// Versión JSON-only - Sin generación de HTML ni PDF
// Regresa datos procesados para que Make los envíe a PDF-API.io

export default async function handler(req, res) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { psiData, clientName, siteUrl, email, phone } = req.body;

    if (!psiData || !psiData.lighthouseResult) {
      return res.status(400).json({ error: 'Invalid PageSpeed data' });
    }

    // 1. Procesar los datos de PageSpeed
    const processedData = processPageSpeedData(psiData);

    // 2. Extraer el nombre del sitio de la URL
    const siteName = extractSiteName(siteUrl);

    // 3. Preparar fecha del reporte
    const reportDate = new Date().toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // 4. Regresar SOLO datos procesados en JSON
    res.status(200).json({
      success: true,
      filename: `reporte-${sanitizeFilename(clientName)}-${Date.now()}.pdf`,
      // Scores principales
      performanceScore: processedData.performanceScore,
      seoScore: processedData.seoScore,
      accessibilityScore: processedData.accessibilityScore,
      bestPracticesScore: processedData.bestPracticesScore,
      performanceGrade: processedData.performanceGrade,
      // Core Web Vitals
      metrics: {
        fcp: processedData.fcp,
        lcp: processedData.lcp,
        cls: processedData.cls,
        tti: processedData.tti,
        tbt: processedData.tbt,
        si: processedData.si
      },
      // Recomendaciones detalladas
      goodPoints: processedData.goodPoints,
      badPoints: processedData.badPoints,
      goodPointsCount: processedData.goodPointsCount,
      badPointsCount: processedData.badPointsCount,
      hasCriticalIssues: processedData.hasCriticalIssues,
      // Info del cliente
      client: {
        name: clientName,
        email: email,
        phone: phone
      },
      // Info del sitio
      site: {
        name: siteName,
        url: siteUrl
      },
      // Metadata
      reportDate: reportDate,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error processing data:', error);
    return res.status(500).json({ 
      error: error.message
    });
  }
}

// ============================================
// FUNCIÓN: Extraer nombre del sitio de URL
// ============================================

function extractSiteName(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const domain = hostname.replace(/^www\./, '');
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch (e) {
    return 'Sitio Web';
  }
}

// ============================================
// FUNCIÓN: Sanitizar nombre de archivo
// ============================================

function sanitizeFilename(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .substring(0, 50);
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

  // Scores de todas las categorías
  const performanceScore = categories.performance 
    ? Math.round(categories.performance.score * 100) 
    : 0;
  
  const seoScore = categories.seo 
    ? Math.round(categories.seo.score * 100) 
    : 0;
  
  const accessibilityScore = categories.accessibility 
    ? Math.round(categories.accessibility.score * 100) 
    : 0;
  
  const bestPracticesScore = categories['best-practices'] 
    ? Math.round(categories['best-practices'].score * 100) 
    : 0;

  return {
    performanceScore,
    seoScore,
    accessibilityScore,
    bestPracticesScore,
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
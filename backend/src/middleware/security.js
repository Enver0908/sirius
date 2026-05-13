const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

/**
 * Production güvenlik middleware'lerini Express app'e uygular.
 *
 * @param {import('express').Application} app
 */
function applySecurityMiddleware(app) {
  // ── CORS ──
  const allowedOrigins = [
    process.env.APP_URL,
    'http://localhost:3000',
  ].filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      // Shopify webhook'ları origin göndermez
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('CORS izni yok'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // ── Helmet (güvenlik header'ları) ──
  app.use(helmet({
    contentSecurityPolicy: false, // Next.js inline scriptler için
    crossOriginEmbedderPolicy: false,
  }));

  // ── Global Rate Limiting (100 req / 15 dk) ──
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'rate_limited',
      message: 'Çok fazla istek gönderildi. 15 dakika sonra tekrar deneyin.',
    },
    keyGenerator: (req) => ipKeyGenerator(req.ip),
  });
  app.use('/api/', globalLimiter);

  // ── Chat endpoint'i için daha sıkı limit (30 req / dk) ──
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: {
      error: 'rate_limited',
      message: 'Chat limiti aşıldı. 1 dakika sonra tekrar deneyin.',
    },
    keyGenerator: (req) => ipKeyGenerator(req.ip),
  });
  app.use('/api/chat', chatLimiter);

  // ── Request Logging ──
  if (process.env.NODE_ENV === 'production') {
    app.use(morgan('combined'));
  } else {
    app.use(morgan('dev'));
  }

  console.log('🔒 Güvenlik middleware\'leri uygulandı');
}

module.exports = { applySecurityMiddleware };

const express = require('express');
const db = require('../db/client');
const authMiddleware = require('../middleware/auth');
const shopifySessionMiddleware = require('../middleware/shopify-session');

const router = express.Router();
router.use(shopifySessionMiddleware);
router.use(authMiddleware);

// ═══════════════════════════════════════════════════════════════
// GET /api/analytics — Mağaza analitik özeti
// ═══════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const shopId = req.shop.id;

  try {
    // 1. Bu ay token kullanımı
    const tokenResult = await db.query(
      `SELECT
         COUNT(*) as request_count,
         COALESCE(SUM(input_tokens), 0) as input_tokens,
         COALESCE(SUM(output_tokens), 0) as output_tokens,
         COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens
       FROM token_usage
       WHERE shop_id = $1
         AND created_at >= date_trunc('month', NOW())`,
      [shopId]
    );

    // 2. En çok kullanılan skill'ler
    //    token_usage + conversations tablosundan birleştirerek çek
    //    (eski kayıtlarda token_usage.skills_used boş olabilir)
    const skillsResult = await db.query(
      `SELECT skill, SUM(usage_count) as usage_count FROM (
         SELECT unnest(skills_used) as skill, COUNT(*) as usage_count
         FROM token_usage
         WHERE shop_id = $1
           AND created_at >= date_trunc('month', NOW())
           AND skills_used IS NOT NULL
           AND array_length(skills_used, 1) > 0
         GROUP BY skill
         UNION ALL
         SELECT unnest(skills_used) as skill, COUNT(*) as usage_count
         FROM conversations
         WHERE shop_id = $1
           AND updated_at >= date_trunc('month', NOW())
           AND skills_used IS NOT NULL
           AND array_length(skills_used, 1) > 0
         GROUP BY skill
       ) combined
       GROUP BY skill
       ORDER BY usage_count DESC
       LIMIT 10`,
      [shopId]
    );

    // 3. Görev istatistikleri
    const taskResult = await db.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'done') as done,
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress
       FROM tasks
       WHERE shop_id = $1`,
      [shopId]
    );

    // 4. Bu ay günlük token kullanımı (grafik verisi)
    const dailyResult = await db.query(
      `SELECT
         DATE(created_at) as day,
         COUNT(*) as requests,
         SUM(input_tokens + output_tokens) as tokens
       FROM token_usage
       WHERE shop_id = $1
         AND created_at >= date_trunc('month', NOW())
       GROUP BY DATE(created_at)
       ORDER BY day`,
      [shopId]
    );

    // 5. Son 7 günde oluşturulan görevler
    const recentTasksResult = await db.query(
      `SELECT COUNT(*) as count
       FROM tasks
       WHERE shop_id = $1
         AND created_at >= NOW() - INTERVAL '7 days'`,
      [shopId]
    );

    res.json({
      token_usage: {
        requests: parseInt(tokenResult.rows[0].request_count),
        input_tokens: parseInt(tokenResult.rows[0].input_tokens),
        output_tokens: parseInt(tokenResult.rows[0].output_tokens),
        total_tokens: parseInt(tokenResult.rows[0].total_tokens),
      },
      top_skills: skillsResult.rows.map((r) => ({
        skill: r.skill,
        count: parseInt(r.usage_count),
      })),
      tasks: {
        total: parseInt(taskResult.rows[0].total),
        done: parseInt(taskResult.rows[0].done),
        pending: parseInt(taskResult.rows[0].pending),
        in_progress: parseInt(taskResult.rows[0].in_progress),
        created_last_7d: parseInt(recentTasksResult.rows[0].count),
      },
      daily_usage: dailyResult.rows.map((r) => ({
        day: r.day,
        requests: parseInt(r.requests),
        tokens: parseInt(r.tokens),
      })),
    });
  } catch (err) {
    console.error('❌ GET /analytics hatası:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Analitik verileri alınamadı' });
  }
});

module.exports = router;

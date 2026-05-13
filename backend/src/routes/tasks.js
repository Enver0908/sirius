const express = require('express');
const db = require('../db/client');
const authMiddleware = require('../middleware/auth');
const shopifySessionMiddleware = require('../middleware/shopify-session');

const router = express.Router();
router.use(shopifySessionMiddleware);
router.use(authMiddleware);

// ═══════════════════════════════════════════════════════════════
// GET /api/tasks — Görev listesi
// ═══════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  const { status, limit = 20 } = req.query;
  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

  try {
    let query = `
      SELECT id, title, description, priority_score, confidence_score,
             status, source_skill, created_at, completed_at
      FROM tasks
      WHERE shop_id = $1`;
    const params = [req.shop.id];

    if (status && ['pending', 'in_progress', 'done'].includes(status)) {
      query += ` AND status = $2`;
      params.push(status);
    }

    query += ` ORDER BY priority_score DESC, created_at DESC LIMIT $${params.length + 1}`;
    params.push(safeLimit);

    const result = await db.query(query, params);

    // Özet sayılar
    const countResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
         COUNT(*) FILTER (WHERE status = 'done') as done,
         COUNT(*) as total
       FROM tasks WHERE shop_id = $1`,
      [req.shop.id]
    );

    res.json({
      tasks: result.rows,
      counts: {
        pending: parseInt(countResult.rows[0].pending),
        in_progress: parseInt(countResult.rows[0].in_progress),
        done: parseInt(countResult.rows[0].done),
        total: parseInt(countResult.rows[0].total),
      },
    });
  } catch (err) {
    console.error('❌ GET /tasks hatası:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Görevler alınamadı' });
  }
});

// ═══════════════════════════════════════════════════════════════
// PATCH /api/tasks/:id — Görev durumunu güncelle
// ═══════════════════════════════════════════════════════════════
router.patch('/:id', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'in_progress', 'done'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      error: 'invalid_status',
      message: `Geçersiz durum. Seçenekler: ${validStatuses.join(', ')}`,
    });
  }

  try {
    // Sadece kendi shop'unun görevini güncelleyebilsin
    const result = await db.query(
      `UPDATE tasks
       SET status = $1,
           completed_at = CASE WHEN $1 = 'done' THEN NOW() ELSE NULL END
       WHERE id = $2 AND shop_id = $3
       RETURNING id, title, status, completed_at`,
      [status, req.params.id, req.shop.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Görev bulunamadı' });
    }

    res.json({ success: true, task: result.rows[0] });
  } catch (err) {
    console.error('❌ PATCH /tasks/:id hatası:', err.message);
    res.status(500).json({ error: 'server_error', message: 'Görev güncellenemedi' });
  }
});

module.exports = router;

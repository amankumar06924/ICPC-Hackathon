import express from "express";
import { tsClient } from "../server.js"; // Note: ensure .js extension in ES Modules

const router = express.Router();

router.get("/report/:submission_id", async (req, res) => {
  try {
    const query = `
      SELECT submission_id, max(tps) as peak_tps,
      ROUND(avg(p50_lat)::numeric, 2) as avg_p50_latency,
      ROUND(avg(p99_lat)::numeric, 2) as avg_p99_latency,
      ROUND(avg(accuracy)::numeric, 2) as final_accuracy,
      ROUND((max(tps)*(avg(accuracy)/100.0))-(avg(p99_lat)*10)::numeric, 0) as composite_score
      FROM metrics_trading_engine 
      WHERE submission_id = $1 
      GROUP BY submission_id;
    `; 
    const result = await tsClient.query(query, [req.params.submission_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No evaluation data found for this submission ID."
      });
    }
    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error("[REPORT ROUTE ERROR] SQL execution failed:", err);
    return res.status(500).json({
      success: false,
      message: "Database analytics processing error."
    });
  }
});
router.get("/leaderboard", async (req, res) => {
  try {
    const query = `
      SELECT
      s.team_id,
      m.submission_id,
      max(m.tps) as peak_tps,
      ROUND(avg(m.p50_lat)::numeric, 2) as avg_p50_latency,
      ROUND(avg(m.p99_lat)::numeric, 2) as avg_p99_latency,
      ROUND(avg(m.accuracy)::numeric, 2) as final_accuracy,
      ROUND((max(m.tps)*(avg(m.accuracy)/100.0))-(avg(m.p99_lat)*10)::numeric, 0) as composite_score
      FROM metrics_trading_engine m
      JOIN submissions s ON m.submission_id = s.submission_id
      WHERE m.recorded_at >= NOW() - INTERVAL '24 hours'
      GROUP BY m.submission_id, s.team_id
      ORDER BY composite_score DESC;
    `;
    const result = await tsClient.query(query);
    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error("[LEADERBOARD ROUTE ERROR] SQL execution failed:", err);
    return res.status(500).json({
      success: false,
      message: "Database desync. Failed to fetch leaderboards."
    });
  }
});

export default router;
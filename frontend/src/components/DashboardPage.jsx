import React, { useState, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import './DashboardPage.css';

function CustomTelemetryChart({ data }) {
  if (data.length < 2) {
    return (
      <div className="no-data-placeholder">
        <div className="spinner-small"></div>
        <p>Waiting for live stream data packets...</p>
      </div>
    );
  }

  const width = 800;
  const height = 250;
  const padding = 40;
  const tpsValues = data.map((d) => d.tps);
  const maxTps = Math.max(...tpsValues, 45000);
  const minTps = Math.min(...tpsValues, 20000);
  const tpsRange = maxTps - minTps || 1;

  const points = data.map((d, index) => {
    const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((d.tps - minTps) / tpsRange) * (height - 2 * padding);
    return { x, y, tps: d.tps, label: d.time };
  });

  const pathD = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, "");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="svg-chart-element">
      <defs>
        <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#333" strokeWidth="1" />
      <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#222" strokeWidth="1" strokeDasharray="4,4" />
      <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#222" strokeWidth="1" strokeDasharray="4,4" />

      <path d={areaD} fill="url(#chartGlow)" />

      <path d={pathD} fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" />

      {points.map((p, i) => (
        <g key={i} className="chart-dot-group">
          <circle cx={p.x} cy={p.y} r="4" fill="#818cf8" stroke="#121212" strokeWidth="1.5" />
          {/* Subtle tooltip trigger (shows value on small hover) */}
          <title>{`${p.tps.toLocaleString()} TPS at ${p.label}`}</title>
        </g>
      ))}

      <text x={padding - 10} y={padding + 5} fill="#666" fontSize="10" textAnchor="end">{Math.floor(maxTps / 1000)}k</text>
      <text x={padding - 10} y={height / 2 + 5} fill="#666" fontSize="10" textAnchor="end">{Math.floor((maxTps + minTps) / 2000)}k</text>
      <text x={padding - 10} y={height - padding + 5} fill="#666" fontSize="10" textAnchor="end">{Math.floor(minTps / 1000)}k</text>

      <text x={padding} y={height - padding + 20} fill="#666" fontSize="10" textAnchor="middle">Start</text>
      <text x={width - padding} y={height - padding + 20} fill="#666" fontSize="10" textAnchor="middle">Active</text>
    </svg>
  );
}

export default function DashboardPage({ activeTest, onBackToUpload }) {
  const [progress, setProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING'); 
  
  const [telemetryData, setTelemetryData] = useState([]);
  const [currentMetrics, setCurrentMetrics] = useState({ tps: 0, p50: 0, p90: 0, p99: 0 });
  const [logs, setLogs] = useState([]);

  // Final Summary Report
  const [finalReport, setFinalReport] = useState(null);

  useEffect(() => {
    // 1. Establish secure Server-Sent Events (SSE) connection [2]
    const streamUrl = `http://localhost:3000/api/v1/submissions/stream?teamId=${activeTest.teamId}&submissionId=${activeTest.submissionId}`;
    const eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
      console.log("[SSE] Event connection open.");
      setConnectionStatus('STREAMING');
    };

    // 2. Map incoming stream data to states [2]
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data.progress);

        if (data.log) {
          setLogs((prev) => [...prev, data.log]);
        }

        if (data.metrics) {
          setCurrentMetrics({
            tps: data.metrics.tps,
            p50: data.metrics.p50,
            p90: data.metrics.p90,
            p99: data.metrics.p99
          });

          const newTick = {
            time: `${data.progress / 10}s`,
            tps: data.metrics.tps
          };
          setTelemetryData((prev) => [...prev.slice(-15), newTick]); // Keeps last 15 points on the graph
        }

        if (data.completed) {
          console.log("[SSE] Finished stream execution. Dismantling socket...");
          eventSource.close(); [2]
          setConnectionStatus('CLOSED');
          setIsCompleted(true);
          setFinalReport(data.report);
        }

      } catch (error) {
        console.error("[SSE ERROR] Data parsing failed:", error);
      }
    };

    eventSource.onerror = (err) => {
      console.error("[SSE ERROR] Connection failed. Fallback triggered.", err);
      setConnectionStatus('ERROR');
      eventSource.close(); [2]
    };

    return () => {
      eventSource.close();
    };
  }, [activeTest]);

  // PDF Generator Script (Professional format using jsPDF + AutoTable)
  const handleDownloadPDF = () => {
    if (!finalReport) return;

    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("IICPC Benchmark Performance Report 2026", 14, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 27);
    doc.text("--------------------------------------------------------------------------------------------------", 14, 32);

    doc.setFontSize(11);
    doc.text(`Team ID: ${activeTest.teamId}`, 14, 40);
    doc.text(`File Name: ${activeTest.filename}`, 14, 47);
    doc.text(`Submitted At: ${new Date(activeTest.submittedAt).toLocaleString()}`, 14, 54);

    const tableColumns = ["Benchmark Evaluation Metric", "Recorded Performance Value"];
    const tableRows = [
      ["Peak Throughput (Peak TPS)", `${finalReport.peakTps} orders/sec`],
      ["Median Latency (p50)", finalReport.avgLatencyP50],
      ["Worst-Case Latency (p99)", finalReport.avgLatencyP99],
      ["Matching Orderbook Correctness (%)", finalReport.correctnessScore],
      ["Sandbox Stability Status", finalReport.stability],
      ["Final Composite Benchmark Score", `${finalReport.compositeScore} / 1000`]
    ];

    doc.autoTable({
      startY: 65,
      head: [tableColumns],
      body: tableRows,
      theme: "grid",
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 10, cellPadding: 4 }
    });

    doc.save(`IICPC_Report_${activeTest.teamId}.pdf`);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Live Sandbox Console</h2>
        <div className="status-badges">
          <span className={`status-indicator ${connectionStatus === 'STREAMING' ? 'active' : 'idle'}`}>
            {connectionStatus === 'STREAMING' ? 'LIVE STREAMING' : connectionStatus === 'CONNECTING' ? 'CONNECTING...' : 'DISCONNECTED'}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="progress-bar-container">
        <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        <span className="progress-text">{progress}% Evaluated</span>
      </div>

      {/* Live Telemetry Display */}
      <div className="telemetry-grid">
        <div className="metric-box">
          <span className="metric-label">Current TPS</span>
          <span className="metric-value text-blue">{currentMetrics.tps.toLocaleString()}</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">p50 Latency (Avg)</span>
          <span className="metric-value text-green">{currentMetrics.p50} ms</span>
        </div>
        <div className="metric-box">
          <span className="metric-label">p99 Latency (Max)</span>
          <span className="metric-value text-rose">{currentMetrics.p99} ms</span>
        </div>
      </div>

      {/* Custom High-Performance SVG Chart */}
      <div className="chart-wrapper">
        <h3>Throughput Curve (TPS vs Time)</h3>
        <div className="svg-chart-container">
          <CustomTelemetryChart data={telemetryData} />
        </div>
      </div>

      {/* Logs and Shell Stream */}
      <div className="console-wrapper">
        <h3>Validator Logs</h3>
        <div className="console-terminal">
          {logs.map((log, index) => (
            <div key={index} className="log-line">{log}</div>
          ))}
        </div>
      </div>

      {/* Final Summary Card */}
      {isCompleted && finalReport && (
        <div className="summary-overlay">
          <div className="summary-card">
            <h2>🏆 Benchmark Performance Summary</h2>
            <p>Congratulations, your matching engine successfully completed the stress testing suite [1, 2]!</p>
            
            <div className="report-grid">
              <div className="report-item">
                <strong>Peak Throughput:</strong>
                <span>{finalReport.peakTps} TPS</span>
              </div>
              <div className="report-item">
                <strong>Avg Latency (p99):</strong>
                <span>{finalReport.avgLatencyP99}</span>
              </div>
              <div className="report-item">
                <strong>Correctness:</strong>
                <span>{finalReport.correctnessScore}</span>
              </div>
              <div className="report-item">
                <strong>Stability:</strong>
                <span>{finalReport.stability}</span>
              </div>
            </div>

            <div className="action-buttons">
              <button onClick={handleDownloadPDF} className="download-pdf-btn">
                Download PDF Report
              </button>
              <button onClick={onBackToUpload} className="back-btn">
                Run Another Test
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
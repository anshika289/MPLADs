import { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line, ScatterChart,
  Scatter, ZAxis, ReferenceLine,
} from "recharts";
import "./App.css";
import {
  LogoIcon, OverviewIcon, AnalyserIcon, AnalyticsIcon, BatchIcon,
  DirectoryIcon, ExplorerIcon, ShieldAlertIcon, CheckCircleIcon,
  AlertTriangleIcon, SparklesIcon, DownloadIcon, TrendingUpIcon,
  ZapIcon, ChevronRightIcon, SearchIcon
} from "./Icons";

const API_URL = "http://127.0.0.1:8000";

const PALETTE = {
  primary: "#2563EB",
  primaryLight: "#60A5FA",
  sky: "#0284C7",
  emerald: "#10B981",
  rose: "#F43F5E",
  amber: "#F59E0B",
  slate: "#64748B",
  gridLine: "rgba(226, 232, 240, 0.7)",
};

const TIER_CONFIG = {
  HIGH_RISK:   { label: "High Risk",   color: "#EF4444", bg: "#FEF2F2", border: "#FCA5A5" },
  MEDIUM_RISK: { label: "Medium Risk", color: "#F97316", bg: "#FFF7ED", border: "#FDBA74" },
  LOW_RISK:    { label: "Low Risk",    color: "#EAB308", bg: "#FEFCE8", border: "#FDE047" },
  NORMAL:      { label: "Normal",      color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0" },
};

function toCrore(v) { return (Number(v) || 0) / 10_000_000; }
function formatCrore(v) { return `₹${toCrore(v).toFixed(2)} Cr`; }
function pct(v) { return `${Number(v).toFixed(1)}%`; }
function fmt(v, d = 2) { return Number(v).toLocaleString("en-IN", { maximumFractionDigits: d }); }

// ── Custom Dark Glass Tooltip for Charts ───────────────────────────────────────
function GlassTooltip({ active, payload, label, prefix = "", suffix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-chart-tooltip">
      <div className="tooltip-title">{label}</div>
      {payload.map((entry, idx) => (
        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color || entry.fill }} />
          <span style={{ color: "#94A3B8" }}>{entry.name}:</span>
          <strong style={{ color: "#FFFFFF" }}>
            {prefix}{typeof entry.value === "number" ? fmt(entry.value) : entry.value}{suffix}
          </strong>
        </div>
      ))}
    </div>
  );
}

// ── Tier Badge Chip ───────────────────────────────────────────────────────────
function TierChip({ tier }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.NORMAL;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

// ── Z-Score Deviation Bar ─────────────────────────────────────────────────────
function ZScoreBar({ z }) {
  const abs = Math.min(Math.abs(z), 4);
  const isHigh = Math.abs(z) > 2.5;
  const isMed = Math.abs(z) > 1.5;
  const color = isHigh ? "#EF4444" : isMed ? "#F97316" : "#2563EB";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <div style={{
        flex: 1, height: 6, background: "#F1F5F9", borderRadius: 999, overflow: "hidden",
      }}>
        <div style={{
          width: `${(abs / 4) * 100}%`, height: "100%", background: color,
          borderRadius: 999, transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{ minWidth: 46, color, fontWeight: 700, fontSize: 11, fontFamily: "var(--font-mono)" }}>
        {z > 0 ? "+" : ""}{z.toFixed(2)}σ
      </span>
    </div>
  );
}

// ── Quick Presets ─────────────────────────────────────────────────────────────
const PRESET_DATA = {
  default: {
    label: "Baseline Average",
    data: {
      Population: 100000, Literacy_Rate: 75, Health_Index: 0.7, Infrastructure_Index: 0.7,
      Sanitation_Index: 0.7, Rate_of_Inflation: 5, Expected_Expense: 1000000,
      Funds_Allocated: 1000000, Funds_Released: 800000, Project_Count: 10,
      Expected_Duration: 12, Actual_Duration: 12, Actual_Expense: 750000,
      Completed_Projects: 7, Pending_Projects: 3, Utilisation_Rate: 0.75,
      Cost_Deviation: 0, Duration_Ratio: 1, Completion_Rate: 0.7,
      Fund_Utilisation_Gap: 0.05, Cost_Per_Project: 75000,
    }
  },
  perfect: {
    label: "Optimal Execution",
    data: {
      Population: 150000, Literacy_Rate: 90, Health_Index: 0.95, Infrastructure_Index: 0.9,
      Sanitation_Index: 0.95, Rate_of_Inflation: 4, Expected_Expense: 1000000,
      Funds_Allocated: 1000000, Funds_Released: 1000000, Project_Count: 10,
      Expected_Duration: 12, Actual_Duration: 11, Actual_Expense: 990000,
      Completed_Projects: 10, Pending_Projects: 0, Utilisation_Rate: 0.99,
      Cost_Deviation: -10000, Duration_Ratio: 0.92, Completion_Rate: 1.0,
      Fund_Utilisation_Gap: 0.01, Cost_Per_Project: 99000,
    }
  },
  max_overspend: {
    label: "Severe Overrun",
    data: {
      Population: 200000, Literacy_Rate: 50, Health_Index: 0.3, Infrastructure_Index: 0.3,
      Sanitation_Index: 0.3, Rate_of_Inflation: 4, Expected_Expense: 500000,
      Funds_Allocated: 500000, Funds_Released: 600000, Project_Count: 5,
      Expected_Duration: 6, Actual_Duration: 24, Actual_Expense: 1500000,
      Completed_Projects: 0, Pending_Projects: 5, Utilisation_Rate: 2.5,
      Cost_Deviation: 1000000, Duration_Ratio: 4, Completion_Rate: 0,
      Fund_Utilisation_Gap: -1.0, Cost_Per_Project: 300000,
    }
  },
  no_completion: {
    label: "Zero Completion",
    data: {
      Population: 80000, Literacy_Rate: 40, Health_Index: 0.2, Infrastructure_Index: 0.2,
      Sanitation_Index: 0.2, Rate_of_Inflation: 6, Expected_Expense: 800000,
      Funds_Allocated: 800000, Funds_Released: 700000, Project_Count: 15,
      Expected_Duration: 12, Actual_Duration: 18, Actual_Expense: 600000,
      Completed_Projects: 0, Pending_Projects: 15, Utilisation_Rate: 0.86,
      Cost_Deviation: -200000, Duration_Ratio: 1.5, Completion_Rate: 0,
      Fund_Utilisation_Gap: 0.14, Cost_Per_Project: 40000,
    }
  },
  ghost_project: {
    label: "Phantom Spend",
    data: {
      Population: 60000, Literacy_Rate: 55, Health_Index: 0.5, Infrastructure_Index: 0.4,
      Sanitation_Index: 0.5, Rate_of_Inflation: 5, Expected_Expense: 300000,
      Funds_Allocated: 300000, Funds_Released: 300000, Project_Count: 10,
      Expected_Duration: 6, Actual_Duration: 8, Actual_Expense: 280000,
      Completed_Projects: 0, Pending_Projects: 0, Utilisation_Rate: 0.93,
      Cost_Deviation: -20000, Duration_Ratio: 1.33, Completion_Rate: 0,
      Fund_Utilisation_Gap: 0.07, Cost_Per_Project: 28000,
    }
  },
};

// ── Overview Page ─────────────────────────────────────────────────────────────
function OverviewPage({ dashboardData, dashboardError }) {
  const yearlyFunds = (dashboardData?.yearly_funds || []).map(i => ({
    year: i.year, allocated: toCrore(i.allocated),
    released: toCrore(i.released), spent: toCrore(i.spent),
  }));
  const fundData = (dashboardData?.sector_data || []).map(i => ({
    sector: i.Expense_Category || "Other",
    allocated: toCrore(i.allocated), spent: toCrore(i.spent),
  }));
  const utilisationTrend = (dashboardData?.utilisation_trend || []).map(i => ({
    month: i.year, utilisation: i.utilisation,
  }));
  const anomalyShare = dashboardData
    ? [{ name: "Anomalous", value: dashboardData.anomaly_count },
       { name: "Normal",    value: dashboardData.normal_count }]
    : [];
  const totals = dashboardData?.national_totals || {};

  return (
    <>
      {dashboardError && <div className="error-box">{dashboardError}</div>}

      {/* KPI Cards with icons */}
      <section className="metric-grid four-up">
        <article className="metric-card">
          <div className="metric-card-top">
            <span className="metric-label">National Allocation</span>
            <div className="metric-icon-wrap" style={{ color: "#2563EB", background: "#EFF6FF" }}>
              <TrendingUpIcon size={18} />
            </div>
          </div>
          <strong>{dashboardData ? formatCrore(totals.funds_allocated) : "..."}</strong>
          <span className="metric-foot">Cumulative budget allocation</span>
        </article>

        <article className="metric-card">
          <div className="metric-card-top">
            <span className="metric-label">Funds Released</span>
            <div className="metric-icon-wrap" style={{ color: "#0284C7", background: "#F0F9FF" }}>
              <ZapIcon size={18} />
            </div>
          </div>
          <strong>{dashboardData ? formatCrore(totals.funds_released) : "..."}</strong>
          <span className="metric-foot">Disbursed to district nodes</span>
        </article>

        <article className="metric-card">
          <div className="metric-card-top">
            <span className="metric-label">Total Expenditure</span>
            <div className="metric-icon-wrap" style={{ color: "#10B981", background: "#ECFDF5" }}>
              <CheckCircleIcon size={18} />
            </div>
          </div>
          <strong>{dashboardData ? formatCrore(totals.actual_expense) : "..."}</strong>
          <span className="metric-foot">Verified utilization expenditure</span>
        </article>

        <article className="metric-card">
          <div className="metric-card-top">
            <span className="metric-label">Anomalies Detected</span>
            <div className="metric-icon-wrap" style={{ color: "#EF4444", background: "#FEF2F2" }}>
              <ShieldAlertIcon size={18} />
            </div>
          </div>
          <strong style={{ color: "#EF4444" }}>
            {dashboardData ? dashboardData.anomaly_count.toLocaleString("en-IN") : "..."}
          </strong>
          <span className="metric-foot">
            {dashboardData ? `Out of ${dashboardData.total_records.toLocaleString("en-IN")} records` : "..."}
          </span>
        </article>
      </section>

      {/* Charts with Modern Gradients */}
      <section className="charts-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><SparklesIcon size={13} /> FUND INTELLIGENCE</p>
            <h2>Macroeconomic Disbursal & Anomaly Trends</h2>
          </div>
          <span className="synthetic-tag">43,440 Records Evaluated</span>
        </div>

        <div className="charts-grid">
          {/* Bar Chart 1 */}
          <article className="panel chart-panel">
            <h3>Annual Disbursal vs Expenditure</h3>
            <p className="muted">Amounts in ₹ Crores across financial periods</p>
            <div className="chart-area compact">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyFunds} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="allocGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0.9} />
                    </linearGradient>
                    <linearGradient id="spentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34D399" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={PALETTE.gridLine} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<GlassTooltip prefix="₹" suffix=" Cr" />} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
                  <Bar dataKey="allocated" name="Allocated" fill="url(#allocGrad)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="spent" name="Expended" fill="url(#spentGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          {/* Donut Chart */}
          <article className="panel chart-panel">
            <h3>SVM Anomaly Distribution</h3>
            <p className="muted">Statistical boundary classification split</p>
            <div className="chart-area compact">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={anomalyShare}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={4}
                    stroke="none"
                  >
                    <Cell fill="#F43F5E" />
                    <Cell fill="#10B981" />
                  </Pie>
                  <Tooltip content={<GlassTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>

          {/* Sector Spending */}
          <article className="panel chart-panel">
            <h3>Sector Allocation & Realization</h3>
            <p className="muted">Category breakdown in ₹ Crores</p>
            <div className="chart-area compact">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fundData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={PALETTE.gridLine} />
                  <XAxis
                    dataKey="sector" interval={0} angle={-25} textAnchor="end"
                    tick={{ fontSize: 10, fill: "#64748B" }} height={45} tickLine={false} axisLine={false}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<GlassTooltip prefix="₹" suffix=" Cr" />} />
                  <Bar dataKey="allocated" name="Allocated" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="spent" name="Spent" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          {/* Line Chart */}
          <article className="panel chart-panel">
            <h3>Historical Fund Utilization Efficiency</h3>
            <p className="muted">Mean completion rate percentage per financial cycle</p>
            <div className="chart-area compact">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={utilisationTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={PALETTE.gridLine} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<GlassTooltip suffix="%" />} />
                  <Line
                    type="monotone" dataKey="utilisation" name="Utilisation Rate"
                    stroke="#2563EB" strokeWidth={3} dot={{ r: 4, fill: "#2563EB", stroke: "#FFFFFF", strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}

// ── Analyser Page ─────────────────────────────────────────────────────────────
const FIELD_GROUPS = [
  {
    title: "Constituency Socio-Economic Indicators",
    fields: [
      ["Population (Count)", "Population"],
      ["Literacy Rate (%)", "Literacy_Rate"],
      ["Health Index (0–1)", "Health_Index"],
      ["Infrastructure Index (0–1)", "Infrastructure_Index"],
      ["Sanitation Index (0–1)", "Sanitation_Index"],
      ["Inflation Rate (%)", "Rate_of_Inflation"],
    ],
  },
  {
    title: "Fiscal & Execution Ledgers",
    fields: [
      ["Expected Budget (₹)", "Expected_Expense"],
      ["Allocated Funds (₹)", "Funds_Allocated"],
      ["Released Funds (₹)", "Funds_Released"],
      ["Total Projects Count", "Project_Count"],
      ["Target Duration (Months)", "Expected_Duration"],
      ["Actual Duration (Months)", "Actual_Duration"],
      ["Actual Expenditure (₹)", "Actual_Expense"],
      ["Completed Projects", "Completed_Projects"],
      ["Pending Projects", "Pending_Projects"],
    ],
  },
  {
    title: "Engineered Risk Features",
    fields: [
      ["Utilization Rate", "Utilisation_Rate"],
      ["Cost Deviation", "Cost_Deviation"],
      ["Duration Ratio", "Duration_Ratio"],
      ["Completion Rate", "Completion_Rate"],
      ["Fund Gap Index", "Fund_Utilisation_Gap"],
      ["Cost Per Project (₹)", "Cost_Per_Project"],
    ],
  },
];

function AnalyserPage({ featureStats }) {
  const [form, setForm] = useState({ ...PRESET_DATA.default.data });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activePreset, setActivePreset] = useState("default");
  const [showShap, setShowShap] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
  }

  function applyPreset(key) {
    setForm({ ...PRESET_DATA[key].data });
    setActivePreset(key);
    setResult(null);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(
          Object.entries(form).map(([k, v]) => [k, Number(v)])
        )),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.detail || data));
      setResult(data);
    } catch (err) {
      setError(`Model evaluation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Cross-field warnings
  const crossWarnings = useMemo(() => {
    const w = [];
    if (Number(form.Funds_Released) > Number(form.Funds_Allocated))
      w.push("Funds Released exceeds Funds Allocated (Logical Fiscal Discrepancy)");
    if (Number(form.Actual_Expense) > Number(form.Funds_Released) * 1.05)
      w.push("Actual Expense exceeds Released Funds by more than 5%");
    if (Number(form.Completed_Projects) + Number(form.Pending_Projects) > Number(form.Project_Count) * 1.5)
      w.push("Completed + Pending projects exceed Total Projects count");
    return w;
  }, [form]);

  const shapData = result?.shap_values
    ? Object.entries(result.shap_values)
        .map(([f, v]) => ({ feature: f, value: v }))
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 8)
    : [];

  const devData = result?.feature_deviations
    ? Object.entries(result.feature_deviations)
        .map(([f, v]) => ({ feature: f, z: v.z_score, value: v.value, mean: v.mean }))
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    : [];

  return (
    <>
      {/* Quick Presets Bar */}
      <div className="preset-bar">
        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginRight: 6 }}>
          QUICK SCENARIOS:
        </span>
        {Object.entries(PRESET_DATA).map(([key, item]) => (
          <button
            key={key}
            type="button"
            className={`preset-btn ${activePreset === key ? "active" : ""}`}
            onClick={() => applyPreset(key)}
          >
            <ZapIcon size={13} />
            {item.label}
          </button>
        ))}
      </div>

      {crossWarnings.length > 0 && (
        <div className="warning-box">
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 4 }}>
            <AlertTriangleIcon size={16} /> Rule-Based Logical Flags
          </div>
          <ul style={{ margin: 0, paddingLeft: 22 }}>
            {crossWarnings.map(w => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      <section className="workspace">
        {/* Form */}
        <div className="panel form-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow"><AnalyserIcon size={13} /> INFERENCE ENGINE</p>
              <h2>Single Record Anomaly Evaluation</h2>
              <p className="muted">Execute inference against the trained One-Class SVM kernel</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {FIELD_GROUPS.map(sec => (
              <div className="field-section" key={sec.title}>
                <h3>{sec.title}</h3>
                <div className="field-grid">
                  {sec.fields.map(([label, name]) => {
                    const stats = featureStats?.[name];
                    const val = Number(form[name]);
                    const isHigh = stats && val > stats.p95;
                    const isLow  = stats && val < stats.p5;

                    return (
                      <label className="field" key={name}>
                        <span>
                          {label}
                          {(isHigh || isLow) && (
                            <span style={{ color: "#F97316", fontSize: 11, fontWeight: 700 }}>
                              {isHigh ? "▲ P95+" : "▼ P5-"}
                            </span>
                          )}
                        </span>
                        <input
                          type="number"
                          name={name}
                          value={form[name]}
                          onChange={handleChange}
                          step="any"
                          required
                          style={isHigh || isLow ? { borderColor: "#FDBA74", background: "#FFFBEB" } : {}}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}

            <button className="submit-button" type="submit" disabled={loading}>
              {loading ? "Computing Kernel Distance & SHAP..." : "Execute Anomaly Detection"}
            </button>
          </form>

          {error && <div className="error-box">{error}</div>}
        </div>

        {/* Evaluation Output Card */}
        <aside className="panel result-panel">
          <p className="eyebrow"><ShieldAlertIcon size={13} /> MODEL EVALUATION</p>
          <h2>Risk Assessment</h2>

          {!result && !loading && (
            <div className="empty-result">
              <div className="result-symbol"><AnalyserIcon size={24} /></div>
              <h3>Ready for Assessment</h3>
              <p>Configure input indicators or select a quick scenario to generate inference.</p>
            </div>
          )}

          {loading && (
            <div className="empty-result">
              <div className="result-symbol"><SparklesIcon size={24} /></div>
              <h3>Evaluating Features...</h3>
              <p className="muted">Running RBF Kernel decision function and calculating Shapley values...</p>
            </div>
          )}

          {result && (
            <div>
              {/* Status Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span className={`result-badge ${result.anomaly ? "anomaly" : "normal"}`}>
                  {result.anomaly ? <ShieldAlertIcon size={14} /> : <CheckCircleIcon size={14} />}
                  {result.prediction}
                </span>
                <TierChip tier={result.confidence_tier} />
              </div>

              {/* Natural Language AI Explanation */}
              <div style={{
                background: "#F8FAFC", border: "1px solid #E2E8F0",
                borderRadius: 12, padding: "12px 14px", marginBottom: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#2563EB", marginBottom: 4 }}>
                  <SparklesIcon size={14} /> AI SYNTHESIS
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
                  {result.natural_language_explanation}
                </p>
              </div>

              {/* Decision Score Metric */}
              <div style={{
                background: "#FFFFFF", border: "1px solid #E2E8F0",
                borderRadius: 12, padding: "12px 14px", marginBottom: 16,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: "#64748B", fontWeight: 600 }}>SVM Decision Margin</span>
                  <strong style={{
                    fontFamily: "var(--font-mono)", fontSize: 14,
                    color: result.decision_score < 0 ? "#EF4444" : "#10B981"
                  }}>
                    {result.decision_score.toFixed(4)}
                  </strong>
                </div>
                {/* Stepped Progress Bar */}
                <div style={{ height: 8, background: "#F1F5F9", borderRadius: 999, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    width: `${Math.min(100, Math.max(5, ((result.decision_score + 40) / 60) * 100))}%`,
                    height: "100%", borderRadius: 999,
                    background: result.decision_score < 0 ? "linear-gradient(90deg, #EF4444, #F97316)" : "#10B981",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94A3B8", marginTop: 4 }}>
                  <span>-39.86 (Outlier Saturation)</span>
                  <span>0.0 (Boundary)</span>
                  <span>+17.65 (Core)</span>
                </div>
              </div>

              {/* Rule Violations List */}
              {result.rule_violations?.length > 0 && (
                <div className="rule-violations">
                  <strong>Triggered Business Rules ({result.rule_violations.length}):</strong>
                  <ul>
                    {result.rule_violations.map(r => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              )}

              {/* Feature Deviations */}
              {devData.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1E293B", marginBottom: 8 }}>
                    Statistical Z-Score Deviations:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {devData.slice(0, 4).map(d => (
                      <div key={d.feature}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748B", marginBottom: 2 }}>
                          <span>{d.feature}</span>
                          <span style={{ fontFamily: "var(--font-mono)" }}>{fmt(d.value)} (μ: {fmt(d.mean)})</span>
                        </div>
                        <ZScoreBar z={d.z} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SHAP Breakdown */}
              {shapData.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <button
                    className="ghost-button"
                    style={{ width: "100%", justifyContent: "space-between" }}
                    onClick={() => setShowShap(s => !s)}
                  >
                    <span>SHAP Attribution Breakdown</span>
                    <ChevronRightIcon size={13} />
                  </button>
                  {showShap && (
                    <div style={{ marginTop: 10, padding: "10px 12px", background: "#F8FAFC", borderRadius: 8 }}>
                      {shapData.map(d => (
                        <div key={d.feature} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                            <span style={{ color: "#475569" }}>{d.feature}</span>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontWeight: 700,
                              color: d.value < 0 ? "#EF4444" : "#2563EB",
                            }}>
                              {d.value > 0 ? "+" : ""}{d.value.toFixed(4)}
                            </span>
                          </div>
                          <div style={{ height: 4, background: "#E2E8F0", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{
                              width: `${Math.min(100, Math.abs(d.value) * 100)}%`, height: "100%",
                              background: d.value < 0 ? "#EF4444" : "#2563EB",
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Similar Normal Records */}
              {result.similar_normal_records?.length > 0 && (
                <div>
                  <button
                    className="ghost-button"
                    style={{ width: "100%", justifyContent: "space-between" }}
                    onClick={() => setShowSimilar(s => !s)}
                  >
                    <span>Closest Benchmark Normal Peers (3)</span>
                    <ChevronRightIcon size={13} />
                  </button>
                  {showSimilar && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {result.similar_normal_records.map((rec, i) => (
                        <div key={i} style={{
                          background: "#ECFDF5", border: "1px solid #A7F3D0",
                          borderRadius: 8, padding: "8px 12px", fontSize: 11,
                        }}>
                          <strong style={{ color: "#065F46" }}>Peer #{i + 1} Normal Reference</strong>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px", marginTop: 4, color: "#1E293B" }}>
                            <span>Allocation: <strong>{formatCrore(rec.Funds_Allocated)}</strong></span>
                            <span>Spent: <strong>{formatCrore(rec.Actual_Expense)}</strong></span>
                            <span>Utilisation: <strong>{pct(rec.Utilisation_Rate * 100)}</strong></span>
                            <span>Completion: <strong>{pct(rec.Completion_Rate * 100)}</strong></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="notice" style={{ marginTop: 14 }}>
                <strong>Legal & Technical Disclaimer:</strong>
                <p>{result.note}</p>
              </div>
            </div>
          )}
        </aside>
      </section>
    </>
  );
}

// ── Analytics Page ─────────────────────────────────────────────────────────────
function AnalyticsPage() {
  const [heatmap, setHeatmap] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [topAnomalous, setTopAnomalous] = useState([]);
  const [spikes, setSpikes] = useState([]);
  const [persistent, setPersistent] = useState([]);
  const [duplicates, setDuplicates] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("heatmap");
  const [peerCategory, setPeerCategory] = useState("Education");
  const [peerData, setPeerData] = useState(null);

  const CATEGORIES = ["Education","Health","Infrastructure","Sanitation","Water Supply","Roads","Electricity","Public Safety"];
  const YEARS = ["2016-17","2017-18","2018-19","2019-20","2020-21","2021-22","2022-23","2023-24","2024-25","2025-26"];

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_URL}/api/anomaly-heatmap`).then(r => r.json()),
      fetch(`${API_URL}/api/leaderboard?limit=20`).then(r => r.json()),
      fetch(`${API_URL}/api/top-anomalous?limit=15`).then(r => r.json()),
      fetch(`${API_URL}/api/yearly-spikes`).then(r => r.json()),
      fetch(`${API_URL}/api/persistent-anomalies`).then(r => r.json()),
      fetch(`${API_URL}/api/duplicate-check`).then(r => r.json()),
    ]).then(([h, l, t, s, p, d]) => {
      setHeatmap(h.heatmap || []);
      setLeaderboard(l.leaderboard || []);
      setTopAnomalous(t.records || []);
      setSpikes(s.spikes || []);
      setPersistent(p.persistent || []);
      setDuplicates(d);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/api/peer-benchmark?category=${encodeURIComponent(peerCategory)}`)
      .then(r => r.json())
      .then(d => setPeerData(d));
  }, [peerCategory]);

  const heatmapGrid = useMemo(() => {
    const map = {};
    heatmap.forEach(r => { map[`${r.category}||${r.year}`] = r; });
    return map;
  }, [heatmap]);

  const maxRate = useMemo(() =>
    Math.max(...heatmap.map(r => r.anomaly_rate), 0.01), [heatmap]);

  function heatColor(rate) {
    if (!rate || rate === 0) return "#F8FAFC";
    const t = Math.min(1, rate / maxRate);
    return `rgba(239, 68, 68, ${0.1 + t * 0.85})`;
  }

  const TABS = [
    ["heatmap",    "Sector Heatmap"],
    ["leaderboard","Anomaly Leaderboard"],
    ["top",        "Top Outliers"],
    ["spikes",     "Spending Spikes"],
    ["persistent", "Multi-Year Flags"],
    ["peer",       "Peer Benchmarking"],
    ["duplicates", "Ledger Integrity"],
  ];

  if (loading) return (
    <div className="panel" style={{ textAlign: "center", padding: 48 }}>
      <SparklesIcon size={24} />
      <h3 style={{ marginTop: 12 }}>Aggregating Anomaly Analytics...</h3>
      <p className="muted">Processing 43,440 synthetic observations</p>
    </div>
  );

  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow"><AnalyticsIcon size={13} /> INTELLIGENCE DASHBOARD</p>
          <h2>Advanced Anomaly Diagnostics</h2>
        </div>
        <span className="synthetic-tag">Multi-Dimensional Analysis</span>
      </div>

      <div className="tab-bar">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab-btn ${activeTab === key ? "active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Heatmap */}
      {activeTab === "heatmap" && (
        <div className="panel" style={{ overflowX: "auto" }}>
          <h3>Sector × Fiscal Cycle Anomaly Heatmap</h3>
          <p className="muted" style={{ marginBottom: 18 }}>
            Percentage of records flagged by SVM. Deeper coral intensity denotes higher anomaly concentration.
          </p>
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, width: "100%", minWidth: 750 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 14px", background: "#F1F5F9", borderRadius: "8px 0 0 0" }}>
                  Sector Category
                </th>
                {YEARS.map(y => (
                  <th key={y} style={{ padding: "10px 8px", background: "#F1F5F9", color: "#334155", textAlign: "center", fontWeight: 700 }}>
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(cat => (
                <tr key={cat} style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "#1E293B" }}>{cat}</td>
                  {YEARS.map(yr => {
                    const cell = heatmapGrid[`${cat}||${yr}`];
                    const rate = cell?.anomaly_rate || 0;
                    return (
                      <td
                        key={yr}
                        title={`${cat} (${yr})\nFlagged: ${cell?.flagged || 0}/${cell?.total || 0}\nRate: ${rate.toFixed(2)}%`}
                        style={{
                          padding: "10px 8px", textAlign: "center",
                          background: heatColor(rate),
                          color: rate > maxRate * 0.5 ? "#FFFFFF" : "#0F172A",
                          fontWeight: 700, borderRadius: 4, cursor: "default",
                        }}
                      >
                        {rate > 0 ? `${rate.toFixed(1)}%` : "0%"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Leaderboard */}
      {activeTab === "leaderboard" && (
        <div className="panel">
          <h3>Constituency Anomaly Leaderboard (Top 20)</h3>
          <p className="muted" style={{ marginBottom: 16 }}>
            Ranked by percentage of total synthetic records flagged as abnormal
          </p>
          <div className="constituency-table-wrap">
            <table className="constituency-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Constituency ID</th>
                  <th>Records</th>
                  <th>Anomalies</th>
                  <th>Flag Rate</th>
                  <th>Allocated</th>
                  <th>Expended</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r, i) => (
                  <tr key={r.constituency_id}>
                    <td>
                      <span style={{
                        display: "inline-flex", width: 24, height: 24, borderRadius: "50%",
                        alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800,
                        background: i === 0 ? "#FEF3C7" : i === 1 ? "#E2E8F0" : i === 2 ? "#FFEDD5" : "#F8FAFC",
                        color: i === 0 ? "#B45309" : i === 1 ? "#475569" : i === 2 ? "#C2410C" : "#64748B",
                      }}>
                        {i + 1}
                      </span>
                    </td>
                    <td><strong>{r.constituency_id}</strong></td>
                    <td>{r.total_records}</td>
                    <td style={{ color: "#EF4444", fontWeight: 700 }}>{r.anomaly_count}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 70, height: 6, background: "#F1F5F9", borderRadius: 999, overflow: "hidden" }}>
                          <div style={{
                            width: `${Math.min(100, r.anomaly_rate * 5)}%`, height: "100%",
                            background: r.anomaly_rate > 8 ? "#EF4444" : "#F97316",
                          }} />
                        </div>
                        <span style={{ fontWeight: 700, color: "#EF4444" }}>{r.anomaly_rate.toFixed(2)}%</span>
                      </div>
                    </td>
                    <td>{formatCrore(r.funds_allocated)}</td>
                    <td>{formatCrore(r.actual_expense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Anomalous */}
      {activeTab === "top" && (
        <div className="panel">
          <h3>Top 15 Extreme Outliers (SVM Distance)</h3>
          <p className="muted" style={{ marginBottom: 16 }}>
            Records positioned farthest beyond the normal decision boundary
          </p>
          <div className="constituency-table-wrap">
            <table className="constituency-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Constituency</th>
                  <th>Year</th>
                  <th>Category</th>
                  <th>Decision Margin</th>
                  <th>Allocation</th>
                  <th>Expenditure</th>
                  <th>Utilisation</th>
                  <th>Completion</th>
                </tr>
              </thead>
              <tbody>
                {topAnomalous.map(r => (
                  <tr key={r.rank}>
                    <td><strong>#{r.rank}</strong></td>
                    <td><strong>{r.constituency_id}</strong></td>
                    <td>{r.financial_year}</td>
                    <td>{r.expense_category}</td>
                    <td>
                      <span style={{
                        fontFamily: "var(--font-mono)", color: "#EF4444",
                        background: "#FEF2F2", padding: "2px 6px", borderRadius: 4, fontWeight: 700,
                      }}>
                        {r.decision_score.toFixed(4)}
                      </span>
                    </td>
                    <td>{formatCrore(r.Funds_Allocated)}</td>
                    <td>{formatCrore(r.Actual_Expense)}</td>
                    <td>{pct(r.Utilisation_Rate * 100)}</td>
                    <td>{pct(r.Completion_Rate * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Spikes */}
      {activeTab === "spikes" && (
        <div className="panel">
          <h3>Fiscal Expenditure Sudden Spikes (&gt;2σ Historical Mean)</h3>
          <p className="muted" style={{ marginBottom: 16 }}>
            Scatter visualization of years where constituency spending surged abnormally beyond its own baseline
          </p>
          <div style={{ height: 260, marginBottom: 20 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.gridLine} />
                <XAxis dataKey="z_score" name="Z-Score" tick={{ fontSize: 11 }} label={{ value: "Standard Deviations (σ)", position: "insideBottom", offset: -10 }} />
                <YAxis dataKey="actual_expense" name="Actual Expense" tick={{ fontSize: 10 }} tickFormatter={v => `₹${toCrore(v).toFixed(1)}Cr`} />
                <ZAxis range={[40, 40]} />
                <Tooltip content={<GlassTooltip prefix="₹" />} />
                <ReferenceLine x={2} stroke="#EF4444" strokeDasharray="4 4" label={{ value: "2σ Threshold", fill: "#EF4444", fontSize: 11 }} />
                <Scatter data={spikes} fill="#F97316" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="constituency-table-wrap" style={{ maxHeight: "35vh" }}>
            <table className="constituency-table">
              <thead>
                <tr>
                  <th>Constituency</th>
                  <th>Fiscal Period</th>
                  <th>Observed Expense</th>
                  <th>Constituency Mean</th>
                  <th>Standard Deviation</th>
                  <th>Spike Intensity</th>
                </tr>
              </thead>
              <tbody>
                {spikes.slice(0, 10).map((s, i) => (
                  <tr key={i}>
                    <td><strong>{s.constituency_id}</strong></td>
                    <td>{s.financial_year}</td>
                    <td>{formatCrore(s.actual_expense)}</td>
                    <td>{formatCrore(s.mean_expense)}</td>
                    <td>{formatCrore(s.std_expense)}</td>
                    <td style={{ color: "#EF4444", fontWeight: 700 }}>+{s.z_score.toFixed(2)}σ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Persistent */}
      {activeTab === "persistent" && (
        <div className="panel">
          <h3>Constituencies with Multi-Year Flag Persistence</h3>
          <p className="muted" style={{ marginBottom: 16 }}>
            Constituencies flagged across 3 or more distinct financial years
          </p>
          <div className="constituency-table-wrap">
            <table className="constituency-table">
              <thead>
                <tr>
                  <th>Constituency ID</th>
                  <th>Flagged Cycles</th>
                  <th>Total Recorded</th>
                  <th>Flag Ratio</th>
                  <th>Years Flagged</th>
                </tr>
              </thead>
              <tbody>
                {persistent.map(r => (
                  <tr key={r.constituency_id}>
                    <td><strong>{r.constituency_id}</strong></td>
                    <td>
                      <span style={{
                        background: "#FEF2F2", color: "#EF4444",
                        padding: "3px 8px", borderRadius: 999, fontWeight: 800, fontSize: 11,
                      }}>
                        {r.flagged_years} Years
                      </span>
                    </td>
                    <td>{r.total_years}</td>
                    <td><strong>{r.anomaly_rate.toFixed(1)}%</strong></td>
                    <td style={{ fontSize: 12, color: "#64748B" }}>{r.flagged_year_list?.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Peer */}
      {activeTab === "peer" && (
        <div className="panel">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h3>Sector Peer Group Distribution</h3>
              <p className="muted">Benchmark unit project expenses against national sector percentiles</p>
            </div>
            <select
              value={peerCategory}
              onChange={e => setPeerCategory(e.target.value)}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 13, fontWeight: 600 }}
            >
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {peerData && (
            <>
              <div className="metric-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 18 }}>
                <article className="metric-card">
                  <span className="metric-label">Sector Median (P50)</span>
                  <strong>{formatCrore(peerData.stats?.p50)}</strong>
                </article>
                <article className="metric-card">
                  <span className="metric-label">75th Percentile</span>
                  <strong>{formatCrore(peerData.stats?.p75)}</strong>
                </article>
                <article className="metric-card">
                  <span className="metric-label">90th Percentile</span>
                  <strong style={{ color: "#F97316" }}>{formatCrore(peerData.stats?.p90)}</strong>
                </article>
                <article className="metric-card">
                  <span className="metric-label">99th Extreme (P99)</span>
                  <strong style={{ color: "#EF4444" }}>{formatCrore(peerData.stats?.p99)}</strong>
                </article>
              </div>

              <div className="constituency-table-wrap">
                <table className="constituency-table">
                  <thead>
                    <tr>
                      <th>Constituency</th>
                      <th>Observed Unit Cost</th>
                      <th>National Percentile</th>
                      <th>Risk Designation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peerData.constituency_breakdown?.map(r => (
                      <tr key={r.constituency_id}>
                        <td><strong>{r.constituency_id}</strong></td>
                        <td>{formatCrore(r.avg_cost_per_project)}</td>
                        <td><strong>{r.percentile.toFixed(1)}th</strong></td>
                        <td>
                          <span style={{
                            padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                            background: r.percentile > 95 ? "#FEF2F2" : r.percentile > 80 ? "#FFF7ED" : "#ECFDF5",
                            color: r.percentile > 95 ? "#EF4444" : r.percentile > 80 ? "#F97316" : "#059669",
                          }}>
                            {r.percentile > 95 ? "High Outlier" : r.percentile > 80 ? "Elevated" : "Within Norm"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Duplicates */}
      {activeTab === "duplicates" && (
        <div className="panel">
          <h3>Synthetic Data Integrity Validation</h3>
          <p className="muted" style={{ marginBottom: 16 }}>
            Verifies ledger consistency (detecting conflicting records with identical Constituency + Year + Sector)
          </p>
          {duplicates && (
            <div style={{
              display: "flex", alignItems: "center", gap: 14, padding: "16px 20px",
              background: duplicates.duplicate_groups === 0 ? "#ECFDF5" : "#FEF2F2",
              border: `1px solid ${duplicates.duplicate_groups === 0 ? "#A7F3D0" : "#FECDD3"}`,
              borderRadius: 12,
            }}>
              {duplicates.duplicate_groups === 0 ? <CheckCircleIcon size={24} /> : <AlertTriangleIcon size={24} />}
              <div>
                <strong style={{ color: duplicates.duplicate_groups === 0 ? "#065F46" : "#9F1239" }}>
                  {duplicates.duplicate_groups === 0
                    ? "Perfect Record Uniqueness: Zero Collisions Detected"
                    : `${duplicates.duplicate_groups} Ledger Group Collisions Detected`}
                </strong>
                <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "#64748B" }}>
                  Every synthetic entry represents an isolated constituency-period tuple.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Batch Scanner Page ─────────────────────────────────────────────────────────
function BatchPage() {
  const [text, setText] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [driftResult, setDriftResult] = useState(null);

  const EXAMPLE_JSON = JSON.stringify([
    {
      Population: 100000, Literacy_Rate: 75, Health_Index: 0.7, Infrastructure_Index: 0.7,
      Sanitation_Index: 0.7, Rate_of_Inflation: 5, Expected_Expense: 1000000,
      Funds_Allocated: 1000000, Funds_Released: 800000, Project_Count: 10,
      Expected_Duration: 12, Actual_Duration: 12, Actual_Expense: 750000,
      Completed_Projects: 7, Pending_Projects: 3, Utilisation_Rate: 0.75,
      Cost_Deviation: 0, Duration_Ratio: 1, Completion_Rate: 0.7,
      Fund_Utilisation_Gap: 0.05, Cost_Per_Project: 75000
    },
    {
      Population: 180000, Literacy_Rate: 45, Health_Index: 0.25, Infrastructure_Index: 0.2,
      Sanitation_Index: 0.3, Rate_of_Inflation: 6.5, Expected_Expense: 600000,
      Funds_Allocated: 600000, Funds_Released: 750000, Project_Count: 8,
      Expected_Duration: 6, Actual_Duration: 22, Actual_Expense: 1600000,
      Completed_Projects: 0, Pending_Projects: 8, Utilisation_Rate: 2.13,
      Cost_Deviation: 1000000, Duration_Ratio: 3.66, Completion_Rate: 0,
      Fund_Utilisation_Gap: -1.13, Cost_Per_Project: 200000
    }
  ], null, 2);

  async function runBatch() {
    setLoading(true);
    setError("");
    setResults(null);
    setDriftResult(null);
    try {
      let records;
      try { records = JSON.parse(text); }
      catch { throw new Error("JSON parsing failed. Ensure valid array syntax."); }
      if (!Array.isArray(records)) throw new Error("Batch payload must be an array of objects.");

      const [batchRes, driftRes] = await Promise.all([
        fetch(`${API_URL}/api/predict/batch`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records }),
        }),
        fetch(`${API_URL}/api/drift-check`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records }),
        }),
      ]);

      const batchData = await batchRes.json();
      const driftData = await driftRes.json();
      if (!batchRes.ok) throw new Error(JSON.stringify(batchData.detail || batchData));

      setResults(Array.isArray(batchData) ? batchData : (batchData.results || []));
      setDriftResult(driftData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    if (!results?.length) return;
    const header = ["Index", "Prediction", "Anomaly", "Confidence_Tier", "Decision_Score", "Rule_Violations"];
    const rows = results.map(r => [
      r.index + 1, r.prediction, r.anomaly, r.confidence_tier,
      r.decision_score?.toFixed(4), (r.rule_violations || []).join(" | ")
    ]);
    const csvContent = [header, ...rows].map(e => e.map(i => `"${i}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mplads_batch_predictions_${Date.now()}.csv`;
    link.click();
  }

  const flaggedCount = results?.filter(r => r.anomaly).length || 0;

  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow"><BatchIcon size={13} /> MASS INFERENCE</p>
          <h2>Batch Scanner & Statistical Drift Monitor</h2>
        </div>
        <span className="synthetic-tag">Supports Up to 500 Records</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(340px, 0.9fr)", gap: 24, alignItems: "start" }}>
        {/* Editor Box */}
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Input Payload (JSON Array)</h3>
            <button className="ghost-button" onClick={() => setText(EXAMPLE_JSON)}>
              Load Sample Batch
            </button>
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste JSON array here..."
            style={{
              width: "100%", height: 320, padding: 14, borderRadius: 8,
              border: "1px solid #CBD5E1", fontFamily: "var(--font-mono)",
              fontSize: 12, resize: "vertical", background: "#FFFFFF",
            }}
          />
          <button className="submit-button" onClick={runBatch} disabled={loading || !text.trim()}>
            {loading ? "Processing Batch Inference..." : "Run Parallel Batch Scan"}
          </button>
          {error && <div className="error-box">{error}</div>}
        </div>

        {/* Results & Drift */}
        <div>
          {driftResult && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>Baseline Distribution Drift</h3>
                <span style={{
                  padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800,
                  background: driftResult.drift_detected ? "#FEF2F2" : "#ECFDF5",
                  color: driftResult.drift_detected ? "#EF4444" : "#059669",
                }}>
                  {driftResult.drift_detected ? "Significant Drift" : "Stable Baseline"}
                </span>
              </div>
              <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                Evaluates whether incoming sample distributions deviate &gt;2σ from the model's training baseline.
              </p>
              <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {(driftResult.feature_drift || []).filter(f => f.drifted).map(f => (
                  <div key={f.feature} style={{
                    padding: "8px 10px", background: "#FFF7ED", border: "1px solid #FDBA74",
                    borderRadius: 6, fontSize: 11.5,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#C2410C" }}>
                      <span>{f.feature}</span>
                      <span>+{f.deviation_stds.toFixed(2)}σ</span>
                    </div>
                    <div style={{ color: "#64748B", marginTop: 2 }}>
                      Training: {fmt(f.training_mean)} → Batch: {fmt(f.incoming_mean)}
                    </div>
                  </div>
                ))}
                {!driftResult.feature_drift?.some(f => f.drifted) && (
                  <p style={{ fontSize: 12, color: "#059669", margin: 0 }}>
                    All 21 features align within standard baseline boundaries.
                  </p>
                )}
              </div>
            </div>
          )}

          {results && (
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Inference Results ({results.length})</h3>
                  <p className="muted" style={{ fontSize: 12 }}>{flaggedCount} anomalies flagged</p>
                </div>
                <button className="ghost-button" onClick={downloadCSV}>
                  <DownloadIcon size={14} /> Export CSV
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div style={{ background: "#FEF2F2", border: "1px solid #FECDD3", padding: 12, borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: "#9F1239", fontWeight: 600 }}>Anomalies</span>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#EF4444" }}>{flaggedCount}</div>
                </div>
                <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", padding: 12, borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: "#065F46", fontWeight: 600 }}>Normal</span>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#10B981" }}>{results.length - flaggedCount}</div>
                </div>
              </div>

              <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {results.map(r => (
                  <div key={r.index} style={{
                    border: `1px solid ${r.anomaly ? "#FECDD3" : "#A7F3D0"}`,
                    background: r.anomaly ? "#FFF1F2" : "#ECFDF5",
                    borderRadius: 8, padding: "10px 12px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: 13 }}>Record #{r.index + 1}</strong>
                      <TierChip tier={r.confidence_tier} />
                    </div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                      <span>Score: <strong style={{ fontFamily: "var(--font-mono)", color: r.decision_score < 0 ? "#EF4444" : "#10B981" }}>{r.decision_score?.toFixed(4)}</strong></span>
                      <span style={{ fontWeight: 600 }}>{r.prediction}</span>
                    </div>
                    {r.rule_violations?.length > 0 && (
                      <div style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>
                        ⚠️ {r.rule_violations.length} business rule violation(s)
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Directory Page ────────────────────────────────────────────────────────────
function DirectoryPage({ officialConstituencies, officialLoading, officialError, onOpen }) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");

  const states = useMemo(() =>
    [...new Set(officialConstituencies.map(i => i.state_name))].filter(Boolean).sort(),
    [officialConstituencies]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return officialConstituencies.filter(item => {
      const matchesSearch = !s || [item.constituency_name, item.mp_name_2024, item.state_name,
        item.constituency_id, item.party_name_2024].some(v => String(v || "").toLowerCase().includes(s));
      return matchesSearch && (stateFilter === "all" || item.state_name === stateFilter);
    });
  }, [officialConstituencies, search, stateFilter]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow"><DirectoryIcon size={13} /> CONSTITUENCY DIRECTORY</p>
          <h2>2024 Parliamentary Reference Index</h2>
          <p className="muted">Search parliamentary seats by representative name, party, or state.</p>
        </div>
        <span className="status-badge">{filtered.length} of {officialConstituencies.length} Seats</span>
      </div>

      <div className="constituency-filters" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14, marginBottom: 18 }}>
        <input
          type="text"
          placeholder="Filter by seat, MP name, or party..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
          <option value="all">All States & Union Territories</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {officialLoading && <p className="muted">Querying official registry...</p>}
      {officialError && <div className="error-box">{officialError}</div>}

      {!officialLoading && !officialError && (
        <div className="constituency-table-wrap">
          <table className="constituency-table">
            <thead>
              <tr>
                <th>ECI Code</th>
                <th>Constituency Name</th>
                <th>State / UT</th>
                <th>2024 Representative</th>
                <th>Political Affiliation</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.constituency_id}>
                  <td><span style={{ fontFamily: "var(--font-mono)", color: "#64748B" }}>{item.constituency_id}</span></td>
                  <td><strong>{item.constituency_name}</strong></td>
                  <td>{item.state_name}</td>
                  <td>{item.mp_name_2024 || "Vacant / Not Reported"}</td>
                  <td>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: "#F1F5F9", color: "#334155",
                    }}>
                      {item.party_name_2024 || "Independent / Other"}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="link-button" onClick={() => onOpen(item)}>
                      Inspect <ChevronRightIcon size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="muted" style={{ padding: 24, textAlign: "center" }}>No matching constituencies found.</p>}
        </div>
      )}
    </section>
  );
}

// ── Detail Explorer Page ──────────────────────────────────────────────────────
function ExplorerPage({ selectedOfficial, onBack, constituencies }) {
  const [selectedConstituency, setSelectedConstituency] = useState("");
  const [constituencyDetails, setConstituencyDetails] = useState(null);
  const [constituencyLoading, setConstituencyLoading] = useState(false);
  const [constituencyError, setConstituencyError] = useState("");

  useEffect(() => {
    if (!selectedConstituency) { setConstituencyDetails(null); return; }
    const ctrl = new AbortController();
    async function load() {
      setConstituencyLoading(true);
      setConstituencyError("");
      try {
        const res = await fetch(
          `${API_URL}/api/constituencies/${encodeURIComponent(selectedConstituency)}`,
          { signal: ctrl.signal });
        if (!res.ok) throw new Error("Could not load constituency details");
        setConstituencyDetails(await res.json());
      } catch (err) {
        if (err.name !== "AbortError") { setConstituencyError(err.message); setConstituencyDetails(null); }
      } finally {
        if (!ctrl.signal.aborted) setConstituencyLoading(false);
      }
    }
    load();
    return () => ctrl.abort();
  }, [selectedConstituency]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow"><ExplorerIcon size={13} /> SEAT PROFILE</p>
          <h2>{selectedOfficial ? selectedOfficial.constituency_name : "Select a Seat"}</h2>
          <p className="muted">Constituency reference data and synthetic inspection bridge</p>
        </div>
        <button type="button" className="ghost-button" onClick={onBack}>
          ← Return to Directory
        </button>
      </div>

      {!selectedOfficial && (
        <div className="empty-result">
          <div className="result-symbol"><DirectoryIcon size={24} /></div>
          <h3>No Parliamentary Seat Selected</h3>
          <p>Select a seat from the Constituency Directory to review its profile.</p>
          <button type="button" className="submit-button" style={{ width: "auto", margin: "16px auto 0" }} onClick={onBack}>
            Open Constituency Directory
          </button>
        </div>
      )}

      {selectedOfficial && (
        <>
          <div className="constituency-summary">
            <div><span>Seat Name</span><strong>{selectedOfficial.constituency_name}</strong></div>
            <div><span>State / Territory</span><strong>{selectedOfficial.state_name}</strong></div>
            <div><span>Official Reference ID</span><strong>{selectedOfficial.constituency_id}</strong></div>
            <div><span>Elected Representative</span><strong>{selectedOfficial.mp_name_2024 || "Not Reported"}</strong></div>
            <div><span>Party</span><strong>{selectedOfficial.party_name_2024 || "Not Reported"}</strong></div>
            <div><span>Election Outcome</span><strong>{selectedOfficial.election_outcome || "Won"}</strong></div>
          </div>
          <div className="notice" style={{ marginBottom: 20 }}>
            <strong>Reference Notice:</strong>
            <p>Official parliamentary seat records are not linked directly to synthetic demo finances.</p>
          </div>
        </>
      )}

      {/* Synthetic Inspector */}
      <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: 20, marginTop: 10 }}>
        <h3>Synthetic Sample Inspector</h3>
        <p className="muted" style={{ marginBottom: 14 }}>
          Inspect synthetic dataset constituencies to cross-reference anomaly patterns.
        </p>
        <div style={{ maxWidth: 420, marginBottom: 18 }}>
          <select
            value={selectedConstituency}
            onChange={e => setSelectedConstituency(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #CBD5E1" }}
          >
            <option value="">Select Synthetic Node ID...</option>
            {constituencies.map(item => (
              <option key={item.Constituency_ID} value={item.Constituency_ID}>
                {item.Constituency_ID} (District {item.district_id})
              </option>
            ))}
          </select>
        </div>

        {constituencyLoading && <p className="muted">Fetching synthetic ledger statistics...</p>}
        {constituencyError && <div className="error-box">{constituencyError}</div>}

        {constituencyDetails && !constituencyLoading && (
          <div className="constituency-summary">
            <div><span>Sample Node</span><strong>{constituencyDetails.constituency_id}</strong></div>
            <div><span>Total Allocated</span><strong>{formatCrore(constituencyDetails.summary.funds_allocated)}</strong></div>
            <div><span>Total Released</span><strong>{formatCrore(constituencyDetails.summary.funds_released)}</strong></div>
            <div><span>Total Expended</span><strong>{formatCrore(constituencyDetails.summary.actual_expense)}</strong></div>
            <div><span>Mean Utilisation</span><strong>{constituencyDetails.summary.average_utilisation_rate.toFixed(2)}%</strong></div>
            <div><span>Anomalies Flagged</span><strong style={{ color: "#EF4444" }}>{constituencyDetails.summary.anomaly_count}</strong></div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Root Application ──────────────────────────────────────────────────────────
export default function App() {
  const [activePage, setActivePage] = useState("overview");
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardError, setDashboardError] = useState("");
  const [officialConstituencies, setOfficialConstituencies] = useState([]);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [officialError, setOfficialError] = useState("");
  const [selectedOfficial, setSelectedOfficial] = useState(null);
  const [constituencies, setConstituencies] = useState([]);
  const [featureStats, setFeatureStats] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/dashboard`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setDashboardData)
      .catch(() => setDashboardError("Failed to load dashboard data. Ensure backend is running."));

    fetch(`${API_URL}/api/constituencies`)
      .then(r => r.json())
      .then(d => setConstituencies(d.constituencies || []));

    setOfficialLoading(true);
    fetch(`${API_URL}/api/official-constituencies`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setOfficialConstituencies(d.constituencies || []))
      .catch(() => setOfficialError("Could not load official constituency data."))
      .finally(() => setOfficialLoading(false));

    fetch(`${API_URL}/api/stats/features`)
      .then(r => r.json())
      .then(d => setFeatureStats(d.features))
      .catch(() => {});
  }, []);

  const PAGE_META = {
    overview:  { eyebrow: "NATIONAL MONITORING", title: "Macro Intelligence Overview", subtitle: "Macro-level fiscal disbursal, spending realization, and anomaly flag rates." },
    analyser:  { eyebrow: "MODEL INFERENCE",    title: "One-Class SVM Record Analyser", subtitle: "Real-time kernel scoring, SHAP explainability, and multi-tier confidence evaluation." },
    analytics: { eyebrow: "DEEP ANALYTICS",     title: "Anomaly Intelligence Suite",   subtitle: "Sector heatmaps, spending spikes, peer group benchmarking, and persistence metrics." },
    batch:     { eyebrow: "MASS INFERENCE",     title: "Parallel Batch Scanner",       subtitle: "Bulk record scanning with automated statistical distribution drift detection." },
    directory: { eyebrow: "INDEX",              title: "Constituency Directory",       subtitle: "Reference catalog of 2024 parliamentary seats and winners." },
    explorer:  { eyebrow: "SEAT PROFILE",       title: "Constituency Seat Explorer",   subtitle: "Electoral outcomes and synthetic financial ledger inspection." },
  };

  const copy = PAGE_META[activePage];

  const NAV_ITEMS = [
    { key: "overview",  label: "Overview",       icon: OverviewIcon },
    { key: "analyser",  label: "Record Analyser", icon: AnalyserIcon },
    { key: "analytics", label: "Analytics Hub",   icon: AnalyticsIcon },
    { key: "batch",     label: "Batch Scanner",   icon: BatchIcon },
    { key: "directory", label: "Directory",       icon: DirectoryIcon },
    { key: "explorer",  label: "Seat Explorer",   icon: ExplorerIcon },
  ];

  return (
    <div className="app-shell">
      {/* Sleek Dark Obsidian Sidebar */}
      <aside className="sidebar">
        <div className="brand-section">
          <LogoIcon size={32} />
          <div className="brand-titles">
            <h2>MPLADS</h2>
            <p className="sidebar-subtitle">Fund Intelligence</p>
          </div>
        </div>

        <div className="nav-label">Navigation</div>
        <nav className="nav-group">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = activePage === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => setActivePage(item.key)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="engine-status-card">
            <div className="engine-status-header">
              <span className="pulse-dot" />
              <span>Engine Status</span>
            </div>
            <p>One-Class SVM • RBF</p>
            <p style={{ marginTop: 2, color: "#94A3B8" }}>43,440 Observations</p>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p className="muted">{copy.subtitle}</p>
          </div>
          <div className="environment-label">
            <span className="live-badge">● LIVE</span>
            <span>SYNTHETIC FINANCIAL LEDGER</span>
          </div>
        </header>

        {activePage === "overview"  && <OverviewPage dashboardData={dashboardData} dashboardError={dashboardError} />}
        {activePage === "analyser"  && <AnalyserPage featureStats={featureStats} />}
        {activePage === "analytics" && <AnalyticsPage />}
        {activePage === "batch"     && <BatchPage />}
        {activePage === "directory" && (
          <DirectoryPage
            officialConstituencies={officialConstituencies}
            officialLoading={officialLoading}
            officialError={officialError}
            onOpen={item => { setSelectedOfficial(item); setActivePage("explorer"); }}
          />
        )}
        {activePage === "explorer" && (
          <ExplorerPage
            selectedOfficial={selectedOfficial}
            onBack={() => setActivePage("directory")}
            constituencies={constituencies}
          />
        )}

        <footer style={{ marginTop: 40, borderTop: "1px solid #E2E8F0", paddingTop: 18, color: "#94A3B8", fontSize: 12 }}>
          MPLADS Anomaly Detection System • Prototype for demonstration and statistical research. Flags indicate mathematical outliers, not proof of irregularity.
        </footer>
      </main>
    </div>
  );
}

/* ============================================================
   Sentinel frontend — talks to sentinel/main.py on the same origin.
   No build step. No framework. Every number on screen is derived
   from a real backend response, nothing here is hardcoded demo data.
 
   Endpoints used (all same-origin, defined in sentinel/main.py):
     GET  /status                 -> { target_url, attack_modules, sentinel_version }
     POST /start                  -> [Finding]  (runs recon+attack+analyze)
     GET  /findings               -> [Finding]
     POST /apply-fix/{finding_id} -> Finding     (remediate+test+retest+verify)
     GET  /source/{finding_id}    -> { original, patched }
   ============================================================ */
 
const state = {
  view: "overview",
  findings: [],
  loadingFindings: false,
  startingAssessment: false,
  fixingId: null,        // finding_id currently mid apply-fix, or null
  connected: null,       // null = unknown yet, true/false after first /status
  targetUrl: null,
  sentinelVersion: null,
  everStarted: false,    // have we ever seen a non-empty findings list this session
  assessmentStartedAt: null, // ms timestamp of the most recent /start click
  testsExecuted: 0,
  fixDurationsMs: [],    // elapsed ms from assessmentStartedAt to each verified fix
  sourceCache: {},       // finding_id -> { original, patched }
  expandedId: null,      // which finding row is expanded
  searchOpen: false,
  searchQuery: "",
};
 
/* ---------------------------------------------------------
   tiny fetch helper: timeout + consistent error messages
   --------------------------------------------------------- */
async function fetchJSON(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = body.detail || JSON.stringify(body);
      } catch (_) {
        /* body wasn't JSON, ignore */
      }
      throw new Error(detail || `Request failed (${res.status})`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Request timed out, is the Sentinel backend running?");
    throw err;
  }
}
 
/* ---------------------------------------------------------
   icons — small stroke-based inline SVGs, no external assets
   --------------------------------------------------------- */
const ICONS = {
  shield: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2.5l6 2.2v4.4c0 4-2.6 6.7-6 8.4-3.4-1.7-6-4.4-6-8.4V4.7l6-2.2z" fill="currentColor"/><path d="M7.2 10.1l1.9 1.9 3.7-3.9" stroke="#0f1729" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  grid: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="6" height="6" rx="1.3" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="2" width="6" height="6" rx="1.3" stroke="currentColor" stroke-width="1.6"/><rect x="2" y="10" width="6" height="6" rx="1.3" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="10" width="6" height="6" rx="1.3" stroke="currentColor" stroke-width="1.6"/></svg>`,
  target: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.4" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="9" r="3.2" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="9" r="0.9" fill="currentColor"/></svg>`,
  doc: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M5 2.5h5.5L14 6v9.5H5V2.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M10.5 2.5V6H14" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 10h4M7 12.3h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  people: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="6.6" cy="6.4" r="2.3" stroke="currentColor" stroke-width="1.6"/><path d="M2.4 15c0-2.5 1.9-4 4.2-4s4.2 1.5 4.2 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="13" cy="7" r="1.9" stroke="currentColor" stroke-width="1.5"/><path d="M12 11.6c1.9.2 3.4 1.6 3.4 3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  code: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M6.5 5L2.5 9l4 4M11.5 5l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  gear: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="2.6" stroke="currentColor" stroke-width="1.6"/><path d="M9 2.6v1.8M9 13.6v1.8M15.4 9h-1.8M4.4 9H2.6M13.4 4.6l-1.3 1.3M5.9 12.1l-1.3 1.3M13.4 13.4l-1.3-1.3M5.9 5.9L4.6 4.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  help: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.6" stroke="currentColor" stroke-width="1.6"/><path d="M6.9 7.1a2.1 2.1 0 1 1 3.1 1.9c-.8.5-1 .9-1 1.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="9" cy="12.6" r="0.15" fill="currentColor" stroke="currentColor" stroke-width="1.3"/></svg>`,
  search: `<svg width="17" height="17" viewBox="0 0 18 18" fill="none"><circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.6"/><path d="M15.5 15.5l-3.6-3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  bell: `<svg width="17" height="17" viewBox="0 0 18 18" fill="none"><path d="M4.5 13V8.2c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5V13l1.3 1.6H3.2L4.5 13z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M7.4 15.6a1.7 1.7 0 0 0 3.2 0" stroke="currentColor" stroke-width="1.5"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2.5v11M2.5 8h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  chevron: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3.5l5 4.5-5 4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pulse: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M2 11h4l2-6 3 12 2-8 1.5 2H20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M3 7.7l3 3 6-6.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  score: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2l5.5 2v4c0 3.6-2.3 6-5.5 7.6C5.8 14 3.5 11.6 3.5 8V4L9 2z" stroke="currentColor" stroke-width="1.5"/></svg>`,
  flag: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4.5 2.5v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4.5 3.3h8l-2 3 2 3h-8" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  activity: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 9h3l1.5-4.5L9.5 14 11 6.5l1 2.5h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  clock: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6.6" stroke="currentColor" stroke-width="1.6"/><path d="M9 5.3V9l2.6 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  printer: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="1.5" width="10" height="5.5" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M3 7H1.8A1.3 1.3 0 0 0 .5 8.3v4.2A1.3 1.3 0 0 0 1.8 13.8H3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M13 7h1.2a1.3 1.3 0 0 1 1.3 1.3v4.2a1.3 1.3 0 0 1-1.3 1.3H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="3" y="9.5" width="10" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 12h5M5.5 13.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="12.8" cy="9.5" r="0.7" fill="currentColor"/></svg>`,
};
 
/* ---------------------------------------------------------
   nav model
   --------------------------------------------------------- */
const NAV = [
  { id: "overview", label: "Overview", icon: "grid" },
  { id: "assessments", label: "Assessments", icon: "target" },
  { id: "findings", label: "Findings", icon: "doc", badgeFrom: "openFindings" },
  { id: "agents", label: "Agents", icon: "people" },
  { id: "codebase", label: "Codebase", icon: "code" },
];
const NAV_FOOT = [
  { id: "settings", label: "Settings", icon: "gear" },
  { id: "help", label: "Help & support", icon: "help" },
];
 
/* ---------------------------------------------------------
   derived data helpers
   --------------------------------------------------------- */
function counts() {
  const total = state.findings.length;
  const verified = state.findings.filter((f) => f.status === "verified").length;
  const fixedOrBetter = state.findings.filter((f) => f.status === "fixed" || f.status === "verified").length;
  const open = state.findings.filter((f) => f.status !== "verified").length;
  return { total, verified, fixedOrBetter, open };
}
 
function stepStatuses() {
  const { total, verified, fixedOrBetter } = counts();
  const started = state.everStarted;
  if (!started) return ["pending", "pending", "pending", "pending", "pending"];
  const recon = "done";
  const attack = "done";
  const analyze = "done";
  let remediate = "pending";
  let verify = "pending";
  if (total === 0) {
    remediate = "done";
    verify = "done";
  } else {
    remediate = fixedOrBetter === total ? "done" : "active";
    if (fixedOrBetter < total) verify = "pending";
    else verify = verified === total ? "done" : "active";
  }
  return [recon, attack, analyze, remediate, verify];
}
 
function fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
 
function timeAgo(ts) {
  if (!ts) return null;
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
}
 
function severityClass(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  return "medium";
}
 
function statusBadge(status) {
  const map = {
    vulnerable: ["badge-vulnerable", "Vulnerable"],
    fixed: ["badge-fixed", "Fixed, unverified"],
    verified: ["badge-verified", "Verified"],
  };
  const [cls, label] = map[status] || ["badge-fixed", status];
  return `<span class="badge ${cls}">${label}</span>`;
}
 
/* ---------------------------------------------------------
   toasts
   --------------------------------------------------------- */
function toast(message, kind = "info") {
  const stack = document.getElementById("toast-stack");
  const el = document.createElement("div");
  el.className = `toast ${kind === "error" ? "error" : kind === "success" ? "success" : ""}`.trim();
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 200ms ease";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 220);
  }, 4200);
}
 
/* ---------------------------------------------------------
   data actions
   --------------------------------------------------------- */
async function pollStatus() {
  try {
    const data = await fetchJSON("/status", {}, 5000);
    state.targetUrl = data.target_url || null;
    state.sentinelVersion = data.sentinel_version || null;
    const wasDisconnected = state.connected === false;
    state.connected = true;
    if (wasDisconnected) toast("Backend connection restored", "success");
    render();
  } catch (err) {
    const wasConnected = state.connected;
    state.connected = false;
    if (wasConnected !== false) render();
  }
}
 
async function loadFindings(initial = false) {
  state.loadingFindings = true;
  if (!initial) render();
  try {
    const data = await fetchJSON("/findings", {}, 8000);
    state.findings = Array.isArray(data) ? data : [];
    // Only mark everStarted on a follow-up poll (after the user triggered an
    // assessment this session). The initial boot load just hydrates the list
    // so stale findings from a previous session don't skip the stepper to
    // step 4 before the user has clicked "New assessment".
    if (!initial && state.findings.length > 0) state.everStarted = true;
  } catch (err) {
    if (!initial) toast(`Couldn't load findings: ${err.message}`, "error");
  } finally {
    state.loadingFindings = false;
    render();
  }
}
 
async function runAssessment() {
  if (state.startingAssessment || state.connected === false) {
    if (state.connected === false) toast("Backend is unreachable right now.", "error");
    return;
  }
  state.startingAssessment = true;
  state.assessmentStartedAt = Date.now();
  state.fixDurationsMs = [];
  render();
  try {
    const data = await fetchJSON("/start", { method: "POST" }, 20000);
    state.findings = Array.isArray(data) ? data : [];
    state.everStarted = true;
    state.testsExecuted += 3; // sqli + idor + cmdi
    toast(`Assessment complete: ${state.findings.length} finding(s) identified.`, "success");
  } catch (err) {
    toast(`Assessment failed: ${err.message}`, "error");
  } finally {
    state.startingAssessment = false;
    render();
    loadFindings();
  }
}
 
async function applyFix(findingId) {
  if (state.fixingId || state.connected === false) {
    if (state.connected === false) toast("Backend is unreachable right now.", "error");
    return;
  }
  state.fixingId = findingId;
  render();
  try {
    const updated = await fetchJSON(`/apply-fix/${encodeURIComponent(findingId)}`, { method: "POST" }, 20000);
    const idx = state.findings.findIndex((f) => f.finding_id === findingId);
    if (idx >= 0 && updated && typeof updated === "object") {
      state.findings[idx] = { ...state.findings[idx], ...updated };
    }
    state.testsExecuted += 1; // the retest
    if (updated && updated.status === "verified" && state.assessmentStartedAt) {
      state.fixDurationsMs.push(Date.now() - state.assessmentStartedAt);
    }
    if (updated && updated.status === "verified") {
      toast(`${findingId} verified fixed.`, "success");
    } else {
      toast(`${findingId} patched, but not yet verified. Check the retest result.`, "info");
    }
  } catch (err) {
    toast(`Apply fix failed for ${findingId}: ${err.message}`, "error");
  } finally {
    state.fixingId = null;
    render();
    loadFindings();
  }
}
 
async function loadSource(findingId) {
  // Don't cache errors — the patch file may not exist yet on first load
  if (state.sourceCache[findingId] && !state.sourceCache[findingId].error) return state.sourceCache[findingId];
  try {
    const data = await fetchJSON(`/source/${encodeURIComponent(findingId)}`, {}, 8000);
    state.sourceCache[findingId] = data;
    return data;
  } catch (err) {
    return { error: err.message };
  }
}
 
/* ---------------------------------------------------------
   print report — opens a self-contained HTML page in a new tab
   --------------------------------------------------------- */
function printReport() {
  const findings = state.findings;
  const { total, verified } = counts();
  const score = total > 0 ? Math.round((verified / total) * 100) : 0;
  const now = new Date().toLocaleString();

  const sevColour = { critical: "#dc2626", high: "#d97706", medium: "#2563eb" };
  const statusLabel = { verified: "Verified fixed", fixed: "Patched", vulnerable: "Open" };

  const findingSections = findings.map((f) => {
    const sev = (f.severity || "").toLowerCase();
    const colour = sevColour[sev] || "#374151";
    const st = statusLabel[f.status] || f.status || "—";
    const stColour = f.status === "verified" ? "#059669" : f.status === "fixed" ? "#d97706" : "#dc2626";
    const src = state.sourceCache[f.finding_id] || {};

    const beforeBlock = src.original
      ? `<h4 style="margin:16px 0 6px;font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:.06em;">Vulnerable code (before)</h4>
         <pre style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:14px;font-size:11.5px;line-height:1.55;overflow-x:auto;white-space:pre-wrap;word-break:break-all;">${src.original.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))}</pre>`
      : "";
    const afterBlock = src.patched
      ? `<h4 style="margin:16px 0 6px;font-size:12px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.06em;">Patched code (after)</h4>
         <pre style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:14px;font-size:11.5px;line-height:1.55;overflow-x:auto;white-space:pre-wrap;word-break:break-all;">${src.patched.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))}</pre>`
      : "";

    return `
      <div style="break-inside:avoid;border:1px solid #e5e7eb;border-radius:10px;padding:22px 24px;margin-bottom:24px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;flex-wrap:wrap;">
          <div>
            <span style="font-family:ui-monospace,monospace;font-size:11px;color:#6b7280;">${f.finding_id}</span>
            <h3 style="font-size:16px;font-weight:700;margin:2px 0 0;color:#111827;">${f.title || ""}</h3>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">
            <span style="font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:999px;background:${colour}1a;color:${colour};">${f.severity || ""}</span>
            <span style="font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:999px;background:${stColour}1a;color:${stColour};">${st}</span>
          </div>
        </div>
        <p style="font-size:12px;font-family:ui-monospace,monospace;color:#6b7280;margin:0 0 14px;word-break:break-all;">${f.affected_component || ""}</p>

        <h4 style="margin:0 0 5px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">What was found</h4>
        <p style="font-size:13.5px;line-height:1.6;margin:0 0 14px;color:#1f2937;">${f.description || f.root_cause || ""}</p>

        <h4 style="margin:0 0 5px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Why it's a problem</h4>
        <p style="font-size:13.5px;line-height:1.6;margin:0 0 14px;color:#1f2937;">${f.root_cause || ""}</p>

        <h4 style="margin:0 0 5px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">How it was fixed</h4>
        <p style="font-size:13.5px;line-height:1.6;margin:0 0 2px;color:#1f2937;">${f.recommended_remediation || ""}</p>
        ${f.retest_result ? `<p style="font-size:12.5px;line-height:1.55;margin:10px 0 0;color:#374151;padding:10px 14px;background:#f0fdf4;border-left:3px solid #34d399;border-radius:4px;">✔ ${f.retest_result}</p>` : ""}
        ${beforeBlock}
        ${afterBlock}
      </div>`;
  }).join("");

  const tableRows = findings.map((f) => {
    const sev = (f.severity || "").toLowerCase();
    const colour = sevColour[sev] || "#374151";
    const stColour = f.status === "verified" ? "#059669" : f.status === "fixed" ? "#d97706" : "#dc2626";
    const st = statusLabel[f.status] || f.status || "—";
    return `<tr>
      <td style="padding:10px 12px;font-family:ui-monospace,monospace;font-size:11.5px;color:#6b7280;">${f.finding_id}</td>
      <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#111827;">${f.title || ""}</td>
      <td style="padding:10px 12px;"><span style="font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:999px;background:${colour}1a;color:${colour};">${f.severity || ""}</span></td>
      <td style="padding:10px 12px;"><span style="font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:999px;background:${stColour}1a;color:${stColour};">${st}</span></td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Sentinel Security Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system,"Segoe UI",system-ui,sans-serif; font-size: 14px; color: #1f2937; background: #fff; padding: 40px; max-width: 860px; margin: 0 auto; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none !important; }
      @page { margin: 18mm 16mm; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:28px;display:flex;gap:10px;">
    <button onclick="window.print()" style="padding:9px 20px;background:#1a3560;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">Print / Save as PDF</button>
    <button onclick="window.close()" style="padding:9px 16px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:7px;font-size:13px;cursor:pointer;">Close</button>
  </div>

  <!-- Header -->
  <div style="border-bottom:2px solid #1a3560;padding-bottom:18px;margin-bottom:28px;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin-bottom:4px;">Security Assessment Report</div>
        <h1 style="font-size:26px;font-weight:800;color:#1a3560;letter-spacing:-.01em;">Sentinel</h1>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:#6b7280;">Generated</div>
        <div style="font-size:13px;font-weight:600;color:#374151;">${now}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">Target</div>
        <div style="font-size:12px;font-family:ui-monospace,monospace;color:#374151;">${state.targetUrl || "—"}</div>
      </div>
    </div>
  </div>

  <!-- Executive summary -->
  <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:32px;">
    <h2 style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:16px;">Executive Summary</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:16px;">
      <div style="text-align:center;">
        <div style="font-size:32px;font-weight:800;color:${score === 100 ? "#059669" : score >= 60 ? "#d97706" : "#dc2626"};">${score}<span style="font-size:16px;font-weight:500;color:#6b7280;">/100</span></div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-top:3px;">Security Score</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:32px;font-weight:800;color:#111827;">${total}</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-top:3px;">Total Findings</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:32px;font-weight:800;color:#059669;">${verified}</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-top:3px;">Verified Fixed</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:32px;font-weight:800;color:#dc2626;">${total - verified}</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-top:3px;">Remaining Open</div>
      </div>
    </div>
  </div>

  <!-- Remediation table -->
  <h2 style="font-size:16px;font-weight:700;margin-bottom:12px;color:#111827;">Findings Overview</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:36px;font-size:13px;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">ID</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Title</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Severity</th>
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #e5e7eb;">Status</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <!-- Detailed findings -->
  <h2 style="font-size:16px;font-weight:700;margin-bottom:16px;color:#111827;">Detailed Findings</h2>
  ${findingSections}

  <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">Generated by Sentinel &mdash; IBM Bob &mdash; ${now}</p>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) { toast("Pop-up blocked — please allow pop-ups for this page.", "error"); return; }
  w.document.write(html);
  w.document.close();
}

/* ---------------------------------------------------------
   render: sidebar
   --------------------------------------------------------- */
function renderSidebar() {
  const el = document.getElementById("sidebar");
  const { open } = counts();
 
  const navItem = (item) => `
    <button class="nav-item ${state.view === item.id ? "active" : ""}" data-nav="${item.id}">
      ${ICONS[item.icon]}
      <span>${item.label}</span>
      ${item.badgeFrom === "openFindings" && open > 0 ? `<span class="nav-badge">${open}</span>` : ""}
    </button>`;
 
  const connLabel = state.connected === null ? "Checking…" : state.connected ? "Connected" : "Unreachable";
  const connDotClass = state.connected === null ? "" : state.connected ? "ok" : "off";
 
  el.innerHTML = `
    <div class="brand">
      <div class="brand-mark">${ICONS.shield}</div>
      <div>
        <div class="brand-name">Sentinel</div>
        <div class="brand-sub">SECURITY AI</div>
      </div>
    </div>
 
    <div class="nav-section-label">Workspace</div>
    <ul class="nav-list">
      ${NAV.map((n) => `<li>${navItem(n)}</li>`).join("")}
    </ul>
 
    <div class="sidebar-spacer"></div>
 
    <div class="env-card">
      <div class="env-label"><span class="env-dot ${connDotClass}"></span>Environment</div>
      <div class="env-name">Local sandbox</div>
      <div class="env-detail">${state.targetUrl || "target app"}</div>
      <div class="env-status ${state.connected === false ? "bad" : ""}">
        ${ICONS.shield.replace("20", "13").replace("20", "13")} ${connLabel}
      </div>
    </div>
 
    <ul class="nav-list">
      ${NAV_FOOT.map((n) => `<li>${navItem(n)}</li>`).join("")}
    </ul>
 
    <div class="user-card">
      <div class="avatar">B2</div>
      <div>
        <div class="user-name">Bob 2.0</div>
        <div class="user-role">Security agent</div>
      </div>
      <button class="user-chevron" aria-label="User menu">${ICONS.chevron}</button>
    </div>
  `;
 
  el.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.getAttribute("data-nav");
      state.expandedId = null;
      closeMobileSidebar();
      render();
    });
  });
}
 
/* ---------------------------------------------------------
   render: topbar
   --------------------------------------------------------- */
const VIEW_META = {
  overview: ["Overview", "Monitor your security posture and active assessments"],
  assessments: ["Assessments", "The current run against your target application"],
  findings: ["Findings", "Vulnerabilities identified across your environment"],
  agents: ["Agents", "The AI agent performing this assessment"],
  codebase: ["Codebase", "Files touched by this assessment"],
  settings: ["Settings", "Runtime configuration for this environment"],
  help: ["Help & support", "How Sentinel works, and what to do if something looks wrong"],
};
 
function renderTopbar() {
  const el = document.getElementById("topbar");
  const [title, subtitle] = VIEW_META[state.view] || VIEW_META.overview;
  const { open, total, verified } = counts();
  const allFixed = total > 0 && verified === total;

  el.innerHTML = `
    <div>
      <h1 class="page-title">${title}</h1>
      <p class="page-subtitle">${subtitle}</p>
    </div>
    <div class="topbar-actions">
      ${
        state.searchOpen
          ? `<input id="search-input" type="text" placeholder="Search findings…" value="${escapeHtml(state.searchQuery)}"
              style="padding:9px 12px;border:1px solid var(--border-strong);border-radius:8px;font-size:13px;width:180px;" />`
          : `<button class="icon-btn" id="search-btn" title="Search findings">${ICONS.search}</button>`
      }
      <button class="icon-btn" id="bell-btn" title="Summary">
        ${ICONS.bell}${open > 0 ? `<span class="icon-dot">${open}</span>` : ""}
      </button>
      ${allFixed ? `<button class="btn btn-secondary btn-sm" id="print-report-btn" title="Print security report">${ICONS.printer} Print report</button>` : ""}
      <button class="btn btn-primary" id="new-assessment-btn" ${state.startingAssessment || state.connected === false ? "disabled" : ""}>
        ${state.startingAssessment ? '<span class="spinner"></span>' : ICONS.plus}
        New assessment
      </button>
    </div>
  `;

  const searchBtn = document.getElementById("search-btn");
  if (searchBtn) searchBtn.addEventListener("click", () => { state.searchOpen = true; render(); });
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.focus();
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    searchInput.addEventListener("input", (e) => { state.searchQuery = e.target.value; renderPageBody(); });
    searchInput.addEventListener("blur", () => {
      if (!state.searchQuery) { state.searchOpen = false; render(); }
    });
  }
  document.getElementById("bell-btn").addEventListener("click", () => {
    toast(`${open} open finding${open === 1 ? "" : "s"} · ${verified}/${total} verified`, "info");
  });
  document.getElementById("new-assessment-btn").addEventListener("click", runAssessment);
  const printBtn = document.getElementById("print-report-btn");
  if (printBtn) printBtn.addEventListener("click", printReport);
}
 
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
 
/* ---------------------------------------------------------
   render: connectivity banner (prepended to page body)
   --------------------------------------------------------- */
function connBannerHTML() {
  const show = state.connected === false;
  return `<div class="conn-banner ${show ? "show" : ""}">
    ${show ? "⚠" : ""} ${show ? "Backend unreachable. Is <code>uvicorn sentinel.main:app --port 8000</code> running?" : ""}
  </div>`;
}
 
/* ---------------------------------------------------------
   render: hero assessment card (shared by Overview + Assessments)
   --------------------------------------------------------- */
function heroCardHTML() {
  const { total, verified, open } = counts();
  const steps = stepStatuses();
  const stepLabels = ["Recon", "Attack", "Analyze", "Remediate", "Verify"];
  const running = state.startingAssessment;
  const complete = state.everStarted && total > 0 && verified === total;
 
  let pillLabel = "ASSESSMENT NOT STARTED";
  let dotClass = "";
  if (running) { pillLabel = "ASSESSMENT RUNNING"; dotClass = "live"; }
  else if (complete) { pillLabel = "ALL FINDINGS VERIFIED"; dotClass = "done"; }
  else if (state.everStarted) { pillLabel = "DEFENSIVE PERIMETER ACTIVE · REMEDIATION IN PROGRESS"; dotClass = "live"; }
 
  let subtitle = "Click New assessment to have Bob 2.0 attack, analyze, and verify fixes for the target application.";
  if (state.everStarted && !running) {
    const ago = timeAgo(state.assessmentStartedAt);
    subtitle = `${ago ? `Started ${ago}` : "Loaded from a previous run"} · Bob 2.0 · ${verified}/${total} vulnerabilities resolved`;
  } else if (running) {
    subtitle = "Bob 2.0 is attacking the target application now…";
  }
 
  return `
    <div class="hero-card">
      <div class="hero-top">
        <div class="hero-icon">${ICONS.pulse}</div>
        <div class="hero-meta">
          <div class="status-pill"><span class="status-dot ${dotClass}"></span>${pillLabel}</div>
          <h2 class="hero-title">Target Application — Full Security Assessment</h2>
          <p class="hero-subtitle">${subtitle}</p>
        </div>
        <div class="stepper">
          ${steps
            .map((s, i) => {
              const circle = s === "done" ? `${ICONS.check}` : i + 1;
              // 4 lines: t goes 0 → 1 across them, producing light-to-dark colour progression
              let line = "";
              if (i < steps.length - 1) {
                const t = i / (steps.length - 2); // 0, 0.33, 0.67, 1
                const isDone = steps[i + 1] !== "pending" || s === "done";
                const lineStyle = isDone
                  // done: light steel-blue (#5a9fd4) → deep navy-blue (#0f2f7a)
                  ? `background:linear-gradient(90deg,
                      rgba(${Math.round(90 - 50*t)},${Math.round(159 - 80*t)},${Math.round(212 - 90*t)},1) 0%,
                      rgba(${Math.round(26 - 11*t)},${Math.round(77 - 30*t)},${Math.round(184 - 62*t)},1) 100%);
                     box-shadow:0 0 ${Math.round(4 + 3*t)}px rgba(20,60,160,${(0.20 + 0.20*t).toFixed(2)});`
                  // pending: light grey (#dde3ed) → mid grey (#b0bbc8)
                  : `background:rgba(${Math.round(221 - 30*t)},${Math.round(227 - 30*t)},${Math.round(237 - 30*t)},1);`;
                line = `<div class="step-line ${isDone ? "done" : ""}" style="${lineStyle}"></div>`;
              }
              return `<div class="step">
                <div class="step-circle ${s}">${circle}</div>
                <div class="step-label ${s !== "pending" ? "on" : ""}">${stepLabels[i]}</div>
              </div>${line}`;
            })
            .join("")}
        </div>
        ${
          !state.everStarted
            ? `<button class="btn btn-hero" id="hero-start-btn" ${state.connected === false ? "disabled" : ""}>
                ${running ? '<span class="spinner"></span>' : ''} Start assessment
              </button>`
            : ""
        }
      </div>
    </div>
  `;
}
 
/* ---------------------------------------------------------
   render: stat cards
   --------------------------------------------------------- */
function statGridHTML() {
  const { total, verified, open } = counts();
  const score = total > 0 ? Math.round((verified / total) * 100) : null;
  const avgFixMs = state.fixDurationsMs.length
    ? state.fixDurationsMs.reduce((a, b) => a + b, 0) / state.fixDurationsMs.length
    : null;
 
  const cards = [
    {
      label: "SECURITY SCORE",
      icon: "score",
      accent: "var(--green-600)",
      value: score === null ? "—" : `${score}<small>/100</small>`,
      bar: score || 0,
      caption: total === 0 ? "Run an assessment to generate a score" : `${verified} of ${total} findings verified`,
    },
    {
      label: "OPEN FINDINGS",
      icon: "flag",
      accent: "var(--amber-600)",
      value: `${open}`,
      bar: total > 0 ? (open / total) * 100 : 0,
      caption: open > 0 ? `${open} require action` : total > 0 ? "All clear" : "None yet",
    },
    {
      label: "TESTS EXECUTED",
      icon: "activity",
      accent: "var(--blue-500)",
      value: `${state.testsExecuted}`,
      bar: Math.min(100, (state.testsExecuted / 12) * 100),
      caption: `${state.testsExecuted === 1 ? "1 automated check" : `${state.testsExecuted} automated checks`} run this session`,
    },
    {
      label: "MEAN TIME TO FIX",
      icon: "clock",
      accent: "#8a5cd6",
      value: avgFixMs === null ? "—" : fmtDuration(avgFixMs),
      bar: avgFixMs === null ? 0 : Math.max(8, 100 - (avgFixMs / 60000) * 100),
      caption: avgFixMs === null ? "No fixes verified yet" : `Across ${state.fixDurationsMs.length} verified fix${state.fixDurationsMs.length === 1 ? "" : "es"}`,
    },
  ];
 
  return `<div class="stat-grid">
    ${cards
      .map(
        (c) => `
      <div class="stat-card" style="--accent:${c.accent}">
        <div class="stat-head">
          <span class="stat-label">${c.label}</span>
          <span class="stat-icon">${ICONS[c.icon]}</span>
        </div>
        <div class="stat-value">${c.value}</div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${c.bar}%"></div></div>
        <div class="stat-caption">${c.caption}</div>
      </div>`
      )
      .join("")}
  </div>`;
}
 
/* ---------------------------------------------------------
   render: findings list (used by Overview "recent" + Findings page)
   --------------------------------------------------------- */
function findingRowHTML(f) {
  const isOpen = state.expandedId === f.finding_id;
  const isFixing = state.fixingId === f.finding_id;
  const sev = severityClass(f.severity);
 
  return `
    <div class="finding-row">
      <div class="finding-summary" data-toggle="${f.finding_id}">
        <span class="sev-dot ${sev}"></span>
        <span class="finding-id">${f.finding_id}</span>
        <span class="finding-title">${escapeHtml(f.title || "")}</span>
        <span class="badge badge-${sev}">${f.severity || ""}</span>
        ${statusBadge(f.status)}
        <span class="chevron ${isOpen ? "open" : ""}">${ICONS.chevron}</span>
      </div>
      <div class="finding-detail ${isOpen ? "open" : ""}" id="detail-${f.finding_id}">
        ${isOpen ? findingDetailHTML(f, isFixing) : ""}
      </div>
    </div>
  `;
}
 
function findingDetailHTML(f, isFixing) {
  const canFix = f.status !== "verified";
  return `
    <div class="finding-detail-inner">
      <div class="detail-block">
        <div class="detail-block-label">Affected component</div>
        <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;">${escapeHtml(f.affected_component || "")}</p>
      </div>
      <div class="detail-block">
        <div class="detail-block-label">Root cause</div>
        <p>${escapeHtml(f.root_cause || f.description || "")}</p>
      </div>
      <div class="detail-block">
        <div class="detail-block-label">Recommended remediation</div>
        <p>${escapeHtml(f.recommended_remediation || "")}</p>
      </div>
      ${f.retest_result ? `<div class="detail-block">
        <div class="detail-block-label">Retest result</div>
        <p>${escapeHtml(typeof f.retest_result === "string" ? f.retest_result : JSON.stringify(f.retest_result))}</p>
      </div>` : ""}
      <div class="detail-block" id="source-${f.finding_id}">
        <div class="detail-block-label">Before / after source</div>
        <p style="color:var(--text-muted);font-size:12.5px;">Loading…</p>
      </div>
      <div class="detail-actions">
        <button class="btn btn-primary btn-sm" data-fix="${f.finding_id}" ${!canFix || isFixing ? "disabled" : ""}>
          ${isFixing ? '<span class="spinner"></span> Applying…' : canFix ? "Apply fix" : "Already verified"}
        </button>
        ${f.status === "fixed" ? `<span class="retest-note">Patched, waiting on verification.</span>` : ""}
      </div>
    </div>
  `;
}
 
async function renderSourceInto(findingId) {
  const container = document.getElementById(`source-${findingId}`);
  if (!container) return;
  const data = await loadSource(findingId);
  const el = document.getElementById(`source-${findingId}`);
  if (!el) return; // view changed while loading
  if (data.error) {
    el.innerHTML = `<div class="detail-block-label">Before / after source</div><p style="color:var(--text-muted);font-size:12.5px;">Not available yet (${escapeHtml(data.error)})</p>`;
    return;
  }
  el.innerHTML = `
    <div class="detail-block-label">Before / after source</div>
    <div class="code-grid">
      <div>
        <div class="code-col-label before">Vulnerable (original)</div>
        <pre class="code-block">${escapeHtml(data.original)}</pre>
      </div>
      <div>
        <div class="code-col-label after">Patched</div>
        <pre class="code-block">${escapeHtml(data.patched)}</pre>
      </div>
    </div>
  `;
}
 
function findingsListHTML(list) {
  if (state.loadingFindings && list.length === 0) {
    return `<div class="empty-state">Loading findings…</div>`;
  }
  if (list.length === 0) {
    return `<div class="empty-state">No findings yet. Run an assessment to have Bob 2.0 attack the target application.</div>`;
  }
  return `<div class="finding-list">${list.map(findingRowHTML).join("")}</div>`;
}
 
function wireFindingRows() {
  document.querySelectorAll("[data-toggle]").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.getAttribute("data-toggle");
      state.expandedId = state.expandedId === id ? null : id;
      renderPageBody();
      if (state.expandedId) renderSourceInto(state.expandedId);
    });
  });
  document.querySelectorAll("[data-fix]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyFix(btn.getAttribute("data-fix"));
    });
  });
}
 
/* ---------------------------------------------------------
   page bodies
   --------------------------------------------------------- */
function pageOverview() {
  const recent = state.findings.slice(0, 5);
  return `
    ${heroCardHTML()}
    ${statGridHTML()}
    <div class="section-card">
      <div class="section-head">
        <div>
          <h3 class="section-title">Recent findings</h3>
          <p class="section-subtitle">Vulnerabilities identified across your environment</p>
        </div>
      </div>
      ${findingsListHTML(recent)}
    </div>
  `;
}
 
function pageAssessments() {
  return `
    ${heroCardHTML()}
    <div class="section-card">
      <div class="section-head">
        <div>
          <h3 class="section-title">This assessment's findings</h3>
          <p class="section-subtitle">Everything Bob 2.0 found in the current run</p>
        </div>
      </div>
      ${findingsListHTML(state.findings)}
    </div>
  `;
}
 
function pageFindings() {
  const q = state.searchQuery.trim().toLowerCase();
  const list = q
    ? state.findings.filter(
        (f) =>
          (f.title || "").toLowerCase().includes(q) ||
          (f.finding_id || "").toLowerCase().includes(q) ||
          (f.severity || "").toLowerCase().includes(q)
      )
    : state.findings;
  return `
    <div class="section-card">
      <div class="section-head">
        <div>
          <h3 class="section-title">All findings</h3>
          <p class="section-subtitle">${state.findings.length} identified this session</p>
        </div>
      </div>
      ${findingsListHTML(list)}
    </div>
  `;
}
 
function pageAgents() {
  return `
    <div class="section-card">
      <div class="agent-card">
        <div class="agent-avatar">${ICONS.people}</div>
        <div>
          <div class="agent-name">Bob 2.0</div>
          <div class="agent-roles">
            <span class="role-chip">Attacker</span>
            <span class="role-chip">Analyst</span>
            <span class="role-chip">Remediation engineer</span>
            <span class="role-chip">Verifier</span>
          </div>
          <p class="agent-desc">
            Sentinel deliberately uses a single agent across the full security lifecycle instead of
            separate models per role. Bob 2.0 runs the attack scripts against the target application,
            writes the root-cause analysis and remediation for each finding, applies the patch, and
            retests the original attack to confirm it no longer succeeds. Every finding on the
            Findings page was produced by this loop.
          </p>
        </div>
      </div>
    </div>
  `;
}
 
function pageCodebase() {
  const files = state.findings.map((f) => ({
    id: f.finding_id,
    path: (f.affected_component || "").split(" ::")[0] || f.affected_component,
    title: f.title,
    status: f.status,
  }));
  return `
    <div class="section-card">
      <div class="section-head">
        <div>
          <h3 class="section-title">Files touched by this assessment</h3>
          <p class="section-subtitle">Click a file to see the vulnerable and patched source side by side</p>
        </div>
      </div>
      ${
        files.length === 0
          ? `<div class="empty-state">No assessment has run yet, so no files have been touched.</div>`
          : files
              .map(
                (f) => `
        <div>
          <div class="file-row" data-toggle="${f.id}">
            ${ICONS.code}
            <span class="file-path">${escapeHtml(f.path || "")}</span>
            ${statusBadge(f.status)}
          </div>
          <div class="finding-detail ${state.expandedId === f.id ? "open" : ""}" id="detail-${f.id}">
            ${state.expandedId === f.id ? `<div class="finding-detail-inner"><div class="detail-block" id="source-${f.id}"><p style="color:var(--text-muted);font-size:12.5px;">Loading…</p></div></div>` : ""}
          </div>
        </div>`
              )
              .join("")
      }
    </div>
  `;
}
 
function pageSettings() {
  return `
    <div class="section-card">
      <div class="info-row">
        <span class="info-key">Target application</span>
        <span class="info-val">${state.targetUrl || "unknown"}</span>
      </div>
      <div class="info-row">
        <span class="info-key">Sentinel version</span>
        <span class="info-val">${state.sentinelVersion || "unknown"}</span>
      </div>
      <div class="info-row">
        <span class="info-key">Backend connectivity</span>
        <span class="info-val">${state.connected ? "Connected" : state.connected === false ? "Unreachable" : "Checking…"}</span>
      </div>
      <div class="info-row">
        <span class="info-key">Findings this session</span>
        <span class="info-val">${state.findings.length}</span>
      </div>
    </div>
  `;
}
 
function pageHelp() {
  const items = [
    ["What does \"Start assessment\" do?", "It calls the Sentinel backend's /start endpoint, which resets the target application, runs the three attack scripts (SQL injection, IDOR, command injection), and records what it finds as Findings."],
    ["What does \"Apply fix\" do?", "It swaps in the pre-written patch for that finding, confirms the app still works, re-runs the original attack, and marks the finding Verified only if the attack no longer succeeds."],
    ["The banner says the backend is unreachable, what do I do?", "Confirm sentinel/main.py is running (uvicorn sentinel.main:app --port 8000) and that the target application is running on the port it expects."],
    ["Where do these numbers come from?", "Every number on this dashboard, the security score, open findings, tests executed, and mean time to fix, is computed from real responses from the backend during this browser session. Nothing here is placeholder data."],
  ];
  return `
    <div class="section-card">
      ${items.map(([q, a]) => `<div class="help-item"><p class="help-q">${q}</p><p class="help-a">${a}</p></div>`).join("")}
    </div>
  `;
}
 
function renderPageBody() {
  const el = document.getElementById("page-body");
  const pages = {
    overview: pageOverview,
    assessments: pageAssessments,
    findings: pageFindings,
    agents: pageAgents,
    codebase: pageCodebase,
    settings: pageSettings,
    help: pageHelp,
  };
  const pageFn = pages[state.view] || pageOverview;
  el.innerHTML = connBannerHTML() + pageFn();
 
  wireFindingRows();
  // If a finding is already expanded (e.g. after applyFix re-renders), load its source
  if (state.expandedId && document.getElementById(`source-${state.expandedId}`)) {
    renderSourceInto(state.expandedId);
  }
  document.querySelectorAll("[data-toggle]").forEach((row) => {
    if (row.hasAttribute("data-fix")) return;
  });
  // re-wire codebase file rows (share the same data-toggle pattern as findings)
  document.querySelectorAll(".file-row[data-toggle]").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.getAttribute("data-toggle");
      state.expandedId = state.expandedId === id ? null : id;
      renderPageBody();
      if (state.expandedId) renderSourceInto(state.expandedId);
    });
  });
  const heroBtn = document.getElementById("hero-start-btn");
  if (heroBtn) heroBtn.addEventListener("click", runAssessment);
}
 
/* ---------------------------------------------------------
   mobile nav
   --------------------------------------------------------- */
function closeMobileSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-scrim").classList.remove("show");
}
document.getElementById("mobile-nav-toggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-scrim").classList.toggle("show");
});
document.getElementById("sidebar-scrim").addEventListener("click", closeMobileSidebar);
 
/* ---------------------------------------------------------
   top-level render + boot
   --------------------------------------------------------- */
function render() {
  renderSidebar();
  renderTopbar();
  renderPageBody();
}
 
render();
loadFindings(true);
pollStatus();
setInterval(pollStatus, 5000);
 
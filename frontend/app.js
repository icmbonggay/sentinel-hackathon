/* ─────────────────────────────────────────────────────────────────────────
   Sentinel Frontend  ·  app.js
   Connects to the Sentinel orchestrator at http://localhost:8000
   ───────────────────────────────────────────────────────────────────────── */

const API = 'http://localhost:8000';

/* ─── SVG icon helpers ─────────────────────────────────────────────── */
const svg = (path, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" ${extra}>${path}</svg>`;

const ICONS = {
  shield:     svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  grid:       svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
  activity:   svg('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'),
  file:       svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
  users:      svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  code:       svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  settings:   svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  help:       svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  search:     svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  bell:       svg('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
  plus:       svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  chevronD:   svg('<polyline points="6 9 12 15 18 9"/>'),
  chevronR:   svg('<polyline points="9 18 15 12 9 6"/>'),
  check:      svg('<polyline points="20 6 9 13 4 10"/>'),
  wrench:     svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'),
  clock:      svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  alertT:     svg('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
  zap:        svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  checkCirc:  svg('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
};

/* ─── State ────────────────────────────────────────────────────────── */
const state = {
  findings: [],
  assessmentRunning: false,
  pipelineStep: 0,   // 0=idle, 1=Recon, 2=Scan, 3=Analyze, 4=Remediate, 5=Verify(done)
  feedItems: [],
  fixingId: null,
  // Populated from GET /status on boot
  config: {
    target_url: null,
    attack_modules: [],
    sentinel_version: null,
    // Optional fields the server may add in future
    user_name: null,
    user_role: null,
  },
  // Timing data tracked during this session
  assessmentStartedAt: null,
  lastFixDurations: [],   // ms per fix, used to compute real MTTR
};

/* ─── Bootstrap DOM globals ────────────────────────────────────────── */
let $sidebar, $topbar, $body;

/* ─── Helpers ──────────────────────────────────────────────────────── */
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type = 'info') {
  const map = {
    info:    ICONS.bell,
    success: ICONS.checkCirc,
    error:   ICONS.alertT,
  };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${map[type]}${esc(msg)}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function setLoading(visible, msg = 'Running assessment…') {
  const ov = document.getElementById('loading-overlay');
  ov.querySelector('p').textContent = msg;
  ov.classList.toggle('visible', visible);
}

function addFeedItem(text, type = 'info') {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false });
  state.feedItems.unshift({ text, type, time });
  if (state.feedItems.length > 50) state.feedItems.pop();
  renderFeed();
}

/* ─── Render helpers ───────────────────────────────────────────────── */
function severityClass(s) {
  s = (s || '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high')     return 'high';
  return 'medium';
}

function statusLabel(s) {
  if (s === 'verified')  return 'Verified';
  if (s === 'fixed')     return 'Fixed';
  return 'Vulnerable';
}

/* ─── Derived stats from real finding data ─────────────────────────── */
function derivedStats() {
  const total    = state.findings.length;
  const vuln     = state.findings.filter(f => f.status === 'vulnerable').length;
  const fixed    = state.findings.filter(f => f.status === 'fixed').length;
  const verified = state.findings.filter(f => f.status === 'verified').length;

  // Security score: start at 100, subtract 20 per unpatched vuln, 5 per patched-not-verified
  const score = total === 0 ? 100 : Math.max(0, Math.min(100,
    Math.round(100 - (vuln * 20 + fixed * 5))
  ));

  // Tests executed = 2 HTTP requests per attack module (control + exploit) × number of modules
  // plus 1 per finding that went through apply-fix (smoke test + retest = 2 each)
  const moduleCount = state.config.attack_modules.length || 0;
  const fixAttempts = state.findings.filter(f => f.retest_result !== null && f.retest_result !== undefined).length;
  const testsExecuted = moduleCount > 0
    ? (moduleCount * 2) + (fixAttempts * 2)
    : 0;

  // Pass rate: tests that didn't produce a finding / total tests
  const passRate = testsExecuted > 0
    ? Math.round(((testsExecuted - total) / testsExecuted) * 100)
    : 0;

  // MTTR from tracked fix durations (ms → minutes, then rounded to 1dp in hours)
  let mttrDisplay = '—';
  let mttrUnit = '';
  if (state.lastFixDurations.length > 0) {
    const avgMs = state.lastFixDurations.reduce((a, b) => a + b, 0) / state.lastFixDurations.length;
    const avgMin = avgMs / 60000;
    if (avgMin < 60) {
      mttrDisplay = avgMin < 1 ? '<1' : String(Math.round(avgMin));
      mttrUnit = 'min';
    } else {
      mttrDisplay = (avgMin / 60).toFixed(1);
      mttrUnit = 'h';
    }
  }

  return { total, vuln, fixed, verified, score, testsExecuted, passRate, mttrDisplay, mttrUnit };
}

/* ─── Pipeline step derives from findings ──────────────────────────── */
// Steps:  0=idle  1=Recon  2=Scan  3=Analyze  4=Remediate  5=done(Verify shown as done)
function pipelineStepFor(findings) {
  if (!findings || findings.length === 0) return 0;
  const allVerified = findings.every(f => f.status === 'verified');
  const anyFixed    = findings.some(f => f.status === 'fixed');
  const anyVuln     = findings.some(f => f.status === 'vulnerable');
  if (allVerified) return 5;   // all done — Verify step complete
  if (anyFixed)    return 4;   // Remediate active
  if (anyVuln)     return 3;   // Analyze active
  return 2;                    // Scan active (findings present but no vuln/fixed status yet)
}

/* ─── Sidebar ──────────────────────────────────────────────────────── */
function renderSidebar() {
  const stats     = derivedStats();
  const targetUrl = state.config.target_url || '—';
  const version   = state.config.sentinel_version ? `v${state.config.sentinel_version}` : '';
  const userName  = state.config.user_name  || 'Alex Kim';
  const userRole  = state.config.user_role  || 'Security engineer';
  const initials  = userName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  // Extract host:port from the full target URL for compact display
  let envHost = targetUrl;
  let envName = 'Staging sandbox';
  try {
    const u = new URL(targetUrl);
    envHost = u.host;
    // Derive a friendly name: strip port, replace dots+hyphens with spaces, title-case
    envName = u.hostname.replace(/[-_.]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim() || 'Staging sandbox';
    if (envName.length > 22) envName = envName.slice(0, 20) + '…';
  } catch (_) { /* keep defaults */ }

  $sidebar.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-icon">${ICONS.shield}</div>
      <div class="brand-text">
        <div class="brand-name">Sentinel</div>
        <div class="brand-sub">Security AI</div>
      </div>
    </div>

    <div class="sidebar-section-label">Workspace</div>
    <ul class="sidebar-nav">
      <li><a href="#" class="active">${ICONS.grid} Overview</a></li>
      <li><a href="#">${ICONS.activity} Assessments</a></li>
      <li><a href="#">${ICONS.file} Findings ${stats.total > 0 ? `<span class="badge">${stats.total}</span>` : ''}</a></li>
      <li><a href="#">${ICONS.users} Agents</a></li>
      <li><a href="#">${ICONS.code} Codebase</a></li>
    </ul>

    <div class="sidebar-env">
      <div class="env-label"><span class="dot-live"></span>Environment</div>
      <div class="env-name">${esc(envName)}</div>
      <div class="env-host">${esc(envHost)}</div>
      <div class="env-status">${ICONS.shield} Defensive perimeter active</div>
    </div>

    <div class="sidebar-bottom">
      <ul class="sidebar-bottom-links">
        <li><a href="#">${ICONS.settings} Settings</a></li>
        <li><a href="#">${ICONS.help} Help &amp; support</a></li>
      </ul>
      <div class="sidebar-user">
        <div class="avatar">${esc(initials)}</div>
        <div class="user-info">
          <div class="user-name">${esc(userName)}</div>
          <div class="user-role">${esc(userRole)}</div>
        </div>
        <button class="chevron-btn" aria-label="user menu">${ICONS.chevronR}</button>
      </div>
    </div>`;
}

/* ─── Topbar ───────────────────────────────────────────────────────── */
function renderTopbar() {
  $topbar.innerHTML = `
    <div class="topbar-titles">
      <h1>Overview</h1>
      <p>Monitor your security posture and active assessments</p>
    </div>
    <div class="topbar-actions">
      <button class="icon-btn" aria-label="search">${ICONS.search}</button>
      <button class="icon-btn" aria-label="notifications">
        ${ICONS.bell}
        ${state.findings.some(f => f.status === 'vulnerable') ? '<span class="notif-dot"></span>' : ''}
      </button>
      <button class="btn-primary" id="btn-new-assessment" ${state.assessmentRunning ? 'disabled' : ''}>
        ${state.assessmentRunning
          ? `<span class="spinner"></span> Running…`
          : `${ICONS.plus} New assessment`}
      </button>
    </div>`;

  document.getElementById('btn-new-assessment')?.addEventListener('click', runAssessment);
}

/* ─── Pipeline banner ──────────────────────────────────────────────── */
// PIPELINE_STEPS[i] is active when state.pipelineStep === i+1.
// When step > PIPELINE_STEPS.length all steps are done.
const PIPELINE_STEPS = ['Recon', 'Scan', 'Analyze', 'Remediate', 'Verify'];

function renderBanner() {
  const step        = state.pipelineStep;
  const isRunning   = state.assessmentRunning;
  const moduleCount = state.config.attack_modules.length;
  const activeCount = state.config.attack_modules.filter(m => m.active !== false).length || moduleCount;
  const targetUrl   = state.config.target_url || '…';
  const userName    = state.config.user_name || 'Alex Kim';

  // Derive a friendly name from the target URL for the banner title
  let appName = 'Target App';
  try {
    const u = new URL(targetUrl);
    // e.g. "localhost" → "Target App", "api.staging.example.com" → "Staging API"
    const parts = u.hostname.split('.');
    if (parts.length >= 2 && parts[0] !== 'localhost') {
      appName = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
  } catch (_) { /* keep default */ }

  // Elapsed time since the last assessment started
  let elapsedStr = '';
  if (state.assessmentStartedAt) {
    const ms = Date.now() - state.assessmentStartedAt;
    const mins = Math.floor(ms / 60000);
    elapsedStr = mins < 1 ? 'just now' : `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  }

  let statusB;
  if (step === 0)                         statusB = 'Ready';
  else if (step >= PIPELINE_STEPS.length) statusB = 'All findings verified';
  else                                    statusB = 'Assessment in progress';

  // Build subtitle: "Started X ago by Name · N of M agents active"
  let subtitle = '';
  if (elapsedStr && step > 0) {
    subtitle = `Started ${elapsedStr} by ${userName}`;
    if (activeCount > 0) subtitle += ` · ${activeCount} of ${moduleCount} agents active`;
  } else if (moduleCount > 0) {
    subtitle = `${moduleCount} attack module${moduleCount !== 1 ? 's' : ''} configured`;
  }

  // Map pipeline step index: step=1 → Recon active (i=0), step=5 → all done
  const stepsHtml = PIPELINE_STEPS.map((label, i) => {
    const stepIndex = i + 1;
    const isDone    = step > stepIndex;
    const isActive  = step === stepIndex;
    const cls   = isDone ? 'done' : isActive ? 'active' : '';
    const inner = isDone ? ICONS.check : `${i + 1}`;
    return `<div class="pipeline-step ${cls}">
      <div class="step-circle">${inner}</div>
      <div class="step-label">${label}</div>
    </div>`;
  }).join('');

  $body.innerHTML = `
    <div class="assessment-banner">
      <div class="banner-header">
        <div class="banner-icon">
          ${ICONS.activity}
          <span class="status-dot ${isRunning ? 'live' : 'idle'}"></span>
        </div>
        <div class="banner-meta">
          <div class="banner-status-line">
            Defensive perimeter active <span class="sep">·</span> ${esc(statusB)}
          </div>
          <div class="banner-title">${esc(appName)} — Full security assessment</div>
          ${subtitle ? `<div class="banner-sub">${esc(subtitle)}</div>` : ''}
        </div>
      </div>
      <div class="pipeline">${stepsHtml}</div>
    </div>`;
}

/* ─── Stats cards ──────────────────────────────────────────────────── */
function renderStats() {
  const s = derivedStats();
  const scoreBar    = s.score;
  const openBar     = s.total > 0 ? Math.min(100, Math.round((s.total / Math.max(s.total, 3)) * 100)) : 0;
  const testsBar    = s.testsExecuted > 0 ? s.passRate : 0;
  const moduleCount = state.config.attack_modules.length;

  const statsGrid = document.createElement('div');
  statsGrid.className = 'stats-grid';
  statsGrid.innerHTML = `
    <div class="stat-card blue">
      <div class="stat-header">
        <div class="stat-label">Security Score</div>
        <div class="stat-icon">${ICONS.shield}</div>
      </div>
      <div class="stat-value">${s.score}<span class="unit">/100</span></div>
      <div class="stat-bar-track"><div class="stat-bar-fill blue" style="width:${scoreBar}%"></div></div>
      <div class="stat-foot">${s.verified > 0 ? `<span class="up">↑ ${s.verified} verified</span>` : 'No fixes verified yet'}</div>
    </div>

    <div class="stat-card yellow">
      <div class="stat-header">
        <div class="stat-label">Open Findings</div>
        <div class="stat-icon">${ICONS.file}</div>
      </div>
      <div class="stat-value">${s.total}</div>
      <div class="stat-bar-track"><div class="stat-bar-fill yellow" style="width:${openBar}%"></div></div>
      <div class="stat-foot">${s.vuln > 0 ? `${s.vuln} require action` : (s.total > 0 ? 'No active vulnerabilities' : 'Run assessment to begin')}</div>
    </div>

    <div class="stat-card indigo">
      <div class="stat-header">
        <div class="stat-label">Tests Executed</div>
        <div class="stat-icon">${ICONS.activity}</div>
      </div>
      <div class="stat-value">${s.testsExecuted > 0 ? s.testsExecuted.toLocaleString() : (moduleCount > 0 ? '0' : '—')}</div>
      <div class="stat-bar-track"><div class="stat-bar-fill indigo" style="width:${testsBar}%"></div></div>
      <div class="stat-foot">${s.testsExecuted > 0 ? `${s.passRate}% passed` : (moduleCount > 0 ? 'Run assessment to begin' : 'Waiting for status…')}</div>
    </div>

    <div class="stat-card purple">
      <div class="stat-header">
        <div class="stat-label">Mean Time to Fix</div>
        <div class="stat-icon">${ICONS.clock}</div>
      </div>
      <div class="stat-value">${esc(s.mttrDisplay)}<span class="unit">${esc(s.mttrUnit)}</span></div>
      <div class="stat-bar-track"><div class="stat-bar-fill purple" style="width:${state.lastFixDurations.length > 0 ? Math.min(100, Math.round((parseFloat(s.mttrDisplay) / 60) * 100)) : 0}%"></div></div>
      <div class="stat-foot">${state.lastFixDurations.length > 0 ? `Based on ${state.lastFixDurations.length} fix${state.lastFixDurations.length !== 1 ? 'es' : ''} this session` : 'No fix data yet'}</div>
    </div>`;
  $body.appendChild(statsGrid);
}

/* ─── Activity Feed ────────────────────────────────────────────────── */
function renderFeed() {
  let feedEl = document.getElementById('activity-feed-panel');
  if (!feedEl) return; // panel not yet rendered

  const itemsHtml = state.feedItems.length === 0
    ? `<div style="padding:20px;text-align:center;font-size:13px;color:var(--muted)">No activity yet. Start an assessment to begin.</div>`
    : state.feedItems.map(item => `
        <div class="feed-item">
          <span class="feed-dot ${item.type}"></span>
          <div class="feed-text">${item.text}</div>
          <div class="feed-time">${item.time}</div>
        </div>`).join('');

  feedEl.querySelector('.feed-items').innerHTML = itemsHtml;
}

function buildFeedPanel() {
  const version = state.config.sentinel_version ? `Sentinel ${state.config.sentinel_version}` : 'Sentinel';
  const el = document.createElement('div');
  el.className = 'activity-feed';
  el.id = 'activity-feed-panel';
  el.innerHTML = `
    <div class="feed-header">
      <div>
        <h2>${esc(version)} Activity</h2>
        <p>Live agent log for the current assessment</p>
      </div>
      <div class="feed-live-badge"><span class="pulse"></span> Live</div>
    </div>
    <div class="feed-items">
      <div style="padding:20px;text-align:center;font-size:13px;color:var(--muted)">No activity yet. Start an assessment to begin.</div>
    </div>`;
  return el;
}

/* ─── Findings section ─────────────────────────────────────────────── */
function buildVulnSnippet(f) {
  if (!f.evidence) return '<span class="c-grey">// No evidence recorded</span>';
  const ev = f.evidence;
  if (f.finding_id === 'F-01') {
    return `<span class="c-grey">// Exploit payload</span>
<span class="c-yellow">username</span> = <span class="c-red">"${esc(ev.exploit_payload?.username || '')}"</span>
<span class="c-yellow">password</span> = <span class="c-red">"${esc(ev.exploit_payload?.password || '')}"</span>
<span class="c-grey">// Response</span>
<span class="c-green">token</span>: <span class="c-red">"${esc(ev.exploit_response?.token || 'bypassed')}"</span>`;
  }
  if (f.finding_id === 'F-02') {
    return `<span class="c-grey">// IDOR: accessed user ${esc(String(ev.requested_without_auth_as))} without auth</span>
<span class="c-yellow">GET</span> /profile/<span class="c-red">${esc(String(ev.requested_without_auth_as))}</span>
<span class="c-green">200 OK</span> — returned ${(ev.response?.notes || []).length} private notes`;
  }
  if (f.finding_id === 'F-03') {
    return `<span class="c-grey">// Command injection payload</span>
<span class="c-yellow">host</span> = <span class="c-red">"${esc(ev.payload || '')}"</span>
<span class="c-grey">// Marker in output</span>
<span class="c-green">${esc(ev.marker_injected || '')}</span>`;
  }
  return `<span class="c-yellow">${esc(JSON.stringify(ev, null, 2))}</span>`;
}

function buildFixSnippet(f) {
  if (f.finding_id === 'F-01') return `<span class="c-grey">// Before (vulnerable)</span>
<span class="c-red">query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"</span>

<span class="c-grey">// After (parameterised)</span>
<span class="c-green">row = conn.execute(
  "SELECT * FROM users WHERE username = ? AND password = ?",
  (body.username, body.password),
)</span>`;

  if (f.finding_id === 'F-02') return `<span class="c-grey">// Before (no auth check)</span>
<span class="c-red">@router.get("/profile/{user_id}")
def get_profile(user_id: int):
    # Returns any user's data unconditionally</span>

<span class="c-grey">// After (ownership enforced)</span>
<span class="c-green">if current_user_id != user_id:
    raise HTTPException(status_code=403, detail="Access forbidden")</span>`;

  if (f.finding_id === 'F-03') return `<span class="c-grey">// Before (shell=True, unsanitised)</span>
<span class="c-red">subprocess.run(f"ping -c 1 {host}", shell=True, ...)</span>

<span class="c-grey">// After (shell=False + allowlist)</span>
<span class="c-green">if not _ALLOWED_HOST.match(host):
    raise HTTPException(400, "Invalid host parameter")
subprocess.run(["ping", "-c", "1", host], shell=False, ...)</span>`;

  return '<span class="c-grey">// No patch preview available</span>';
}

function buildSourcePanel(original, patched) {
  return `
    <div class="source-compare">
      <div class="source-col">
        <div class="source-col-label source-label-original">Original (vulnerable)</div>
        <pre class="code-block source-pre">${esc(original)}</pre>
      </div>
      <div class="source-col">
        <div class="source-col-label source-label-patched">Patched</div>
        <pre class="code-block source-pre">${esc(patched)}</pre>
      </div>
    </div>`;
}

function buildRetestBanner(f) {
  if (!f.retest_result) return '';
  const isVerified = f.status === 'verified';
  const cls = isVerified ? 'success' : 'warn';
  const icon = isVerified ? '✓' : '⚠';
  return `<div class="retest-result ${cls}">
    <strong>${icon} Retest result:</strong> ${esc(f.retest_result)}
  </div>`;
}

function buildFindingCard(f) {
  const sevCls  = severityClass(f.severity);
  const statCls = f.status;

  const card = document.createElement('div');
  card.className = 'finding-card';
  card.dataset.id = f.finding_id;

  card.innerHTML = `
    <div class="finding-card-header">
      <span class="severity-pill ${sevCls}">${esc(f.severity)}</span>
      <span class="fid">${esc(f.finding_id)}</span>
      <span class="ftitle">${esc(f.title)}</span>
      <span class="fcomp">${esc(f.affected_component)}</span>
      <span class="status-badge ${statCls}">${statusLabel(f.status)}</span>
      <span class="chevron-toggle">${ICONS.chevronD}</span>
    </div>
    <div class="finding-detail">
      <div class="detail-grid">
        <div class="detail-col">
          <div class="detail-section">
            <h4>Description</h4>
            <p>${esc(f.description)}</p>
          </div>
          <div class="detail-section">
            <h4>Root Cause</h4>
            <p>${esc(f.root_cause)}</p>
          </div>
          <div class="detail-section">
            <h4>Evidence</h4>
            <div class="code-block">${buildVulnSnippet(f)}</div>
          </div>
        </div>
        <div class="detail-col">
          <div class="detail-section">
            <h4>Recommended Remediation</h4>
            <p>${esc(f.recommended_remediation)}</p>
          </div>
          <div class="detail-section">
            <h4>Before / After</h4>
            <div class="code-block">${buildFixSnippet(f)}</div>
          </div>
          ${(f.status === 'fixed' || f.status === 'verified') ? `
          <div class="detail-section">
            <h4>Source files</h4>
            <div class="source-compare-container"></div>
          </div>` : ''}
        </div>
      </div>
      ${buildRetestBanner(f)}
      <div class="detail-actions">
        ${f.status === 'verified'
          ? `<button class="btn-fix" disabled>${ICONS.checkCirc} Verified</button>`
          : `<button class="btn-fix" data-fix="${esc(f.finding_id)}">
               ${ICONS.wrench} Apply Fix &amp; Retest
             </button>`}
        <button class="btn-ghost">View details</button>
      </div>
    </div>`;

  // Toggle expand — fetch source for fixed/verified findings on first open
  card.querySelector('.finding-card-header').addEventListener('click', async () => {
    const wasOpen = card.classList.contains('open');
    card.classList.toggle('open');
    const isNowOpen = !wasOpen;

    if (isNowOpen && (f.status === 'fixed' || f.status === 'verified')) {
      const container = card.querySelector('.source-compare-container');
      // Only fetch once — skip if already populated
      if (container && !container.dataset.loaded) {
        container.dataset.loaded = 'loading';
        container.innerHTML = `<div class="source-loading">Loading source…</div>`;
        try {
          const res = await fetch(`${API}/source/${encodeURIComponent(f.finding_id)}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const { original, patched } = await res.json();
          container.innerHTML = buildSourcePanel(original, patched);
          container.dataset.loaded = 'done';
        } catch (err) {
          container.innerHTML = `<div class="source-error">Could not load source: ${esc(err.message)}</div>`;
          delete container.dataset.loaded; // allow retry on next expand
        }
      }
    }
  });

  // Fix button
  const fixBtn = card.querySelector('[data-fix]');
  if (fixBtn) {
    fixBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      applyFix(f.finding_id);
    });
  }

  return card;
}

function renderFindings() {
  let section = document.getElementById('findings-section');
  if (!section) return;

  const heading = section.querySelector('.section-heading');
  const grid    = section.querySelector('.findings-grid');

  if (state.findings.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        ${ICONS.shield}
        <h3>No findings yet</h3>
        <p>Click <strong>New assessment</strong> to run a full security scan against the target application.</p>
        <button class="btn-primary" id="btn-start-empty">
          ${ICONS.plus} Start assessment
        </button>
      </div>`;
    document.getElementById('btn-start-empty')?.addEventListener('click', runAssessment);
    return;
  }

  const s = derivedStats();
  heading.querySelector('p').textContent = `${s.vuln} vulnerable · ${s.fixed} patched · ${s.verified} verified`;

  grid.innerHTML = '';
  for (const f of state.findings) {
    grid.appendChild(buildFindingCard(f));
  }
}

/* ─── Full page render ─────────────────────────────────────────────── */
function render() {
  renderSidebar();
  renderTopbar();
  renderBanner();
  renderStats();

  // Feed panel — rebuild when config is ready so the title reflects the real version
  const existingFeed = document.getElementById('activity-feed-panel');
  if (!existingFeed) {
    $body.appendChild(buildFeedPanel());
  }
  renderFeed();

  // Findings section
  let findingsSection = document.getElementById('findings-section');
  if (!findingsSection) {
    findingsSection = document.createElement('div');
    findingsSection.id = 'findings-section';
    findingsSection.innerHTML = `
      <div class="section-heading">
        <div>
          <h2>Recent findings</h2>
          <p>Vulnerabilities identified across your environment</p>
        </div>
        <button class="filter-btn">${ICONS.chevronD} All findings</button>
      </div>
      <div class="findings-grid"></div>`;
    $body.appendChild(findingsSection);
  }
  renderFindings();
}

/* ─── API calls ────────────────────────────────────────────────────── */
async function loadStatus() {
  try {
    const res = await fetch(`${API}/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.config.target_url      = data.target_url      ?? state.config.target_url;
    state.config.attack_modules  = data.attack_modules  ?? state.config.attack_modules;
    state.config.sentinel_version = data.sentinel_version ?? state.config.sentinel_version;
  } catch (_) {
    // /status unavailable — keep defaults; the UI will show '—' for unknowns
  }
}

async function loadFindings() {
  try {
    const res = await fetch(`${API}/findings`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.findings = await res.json();
    state.pipelineStep = pipelineStepFor(state.findings);
  } catch (err) {
    // findings.json may not exist yet — that's fine
    state.findings = [];
    state.pipelineStep = 0;
  }
}

async function runAssessment() {
  if (state.assessmentRunning) return;

  state.assessmentRunning = true;
  state.pipelineStep = 1;
  state.findings = [];
  state.feedItems = [];
  state.assessmentStartedAt = Date.now();
  render();

  const targetHost = (() => {
    try { return new URL(state.config.target_url || '').host; } catch (_) { return state.config.target_url || 'target'; }
  })();
  const moduleCount = state.config.attack_modules.length;
  const moduleNames = moduleCount > 0
    ? state.config.attack_modules.map(m => m.name).join(' · ')
    : 'attack modules';
  const version = state.config.sentinel_version ? `Sentinel ${state.config.sentinel_version}` : 'Sentinel';

  addFeedItem(`${version} · Starting full security assessment against ${targetHost}`, 'purple');
  addFeedItem('Resetting target application to pristine state…', 'info');

  try {
    setLoading(true, 'Running assessment…');
    addFeedItem(`Launching ${moduleCount} attack module${moduleCount !== 1 ? 's' : ''}: ${moduleNames}`, 'warn');

    const res = await fetch(`${API}/start`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }

    state.findings = await res.json();
    state.pipelineStep = pipelineStepFor(state.findings);

    // Feed summary
    for (const f of state.findings) {
      addFeedItem(`${ICONS.alertT} <span class="feed-label">${esc(f.finding_id)}</span> — ${esc(f.title)} (${esc(f.severity)})`, 'error');
    }
    addFeedItem(`Assessment complete. ${state.findings.length} finding(s) identified.`, 'success');

    toast(`Assessment complete — ${state.findings.length} finding(s) found`, 'success');
  } catch (err) {
    addFeedItem(`Error: ${err.message}`, 'error');
    toast(`Assessment failed: ${err.message}`, 'error');
  } finally {
    state.assessmentRunning = false;
    setLoading(false);
    render();
  }
}

async function applyFix(findingId) {
  if (state.fixingId) return;
  state.fixingId = findingId;
  const fixStart = Date.now();

  const card = document.querySelector(`.finding-card[data-id="${findingId}"]`);
  const btn  = card?.querySelector('[data-fix]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Applying fix…`;
  }

  addFeedItem(`Sentinel · Applying patch for <span class="feed-label">${esc(findingId)}</span>…`, 'purple');

  try {
    setLoading(true, `Applying fix for ${findingId}…`);

    const res = await fetch(`${API}/apply-fix/${encodeURIComponent(findingId)}`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }

    const updated = await res.json();

    // Record fix duration for MTTR calculation
    state.lastFixDurations.push(Date.now() - fixStart);

    // Patch local state
    const idx = state.findings.findIndex(f => f.finding_id === findingId);
    if (idx !== -1) state.findings[idx] = updated;
    state.pipelineStep = pipelineStepFor(state.findings);

    if (updated.status === 'verified') {
      addFeedItem(`✓ <span class="feed-label">${esc(findingId)}</span> verified — vulnerability no longer reproducible`, 'success');
      toast(`${findingId} verified — fix confirmed`, 'success');
    } else {
      addFeedItem(`⚠ <span class="feed-label">${esc(findingId)}</span> patched but not yet verified`, 'warn');
      toast(`${findingId} patched — retest result recorded`, 'info');
    }
  } catch (err) {
    addFeedItem(`Error fixing ${findingId}: ${err.message}`, 'error');
    toast(`Fix failed for ${findingId}: ${err.message}`, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${ICONS.wrench} Apply Fix &amp; Retest`;
    }
  } finally {
    state.fixingId = null;
    setLoading(false);
    render();

    // Re-open the card after re-render
    setTimeout(() => {
      document.querySelector(`.finding-card[data-id="${findingId}"]`)?.classList.add('open');
    }, 50);
  }
}

/* ─── Bootstrap ────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  $sidebar = document.getElementById('sidebar');
  $topbar  = document.getElementById('topbar');
  $body    = document.getElementById('page-body');

  // Loading overlay + toast container + help FAB (injected once)
  document.body.insertAdjacentHTML('beforeend', `
    <div id="loading-overlay">
      <div class="ov-spinner"></div>
      <p>Running assessment…</p>
    </div>
    <div id="toast-container"></div>
    <button class="help-fab" aria-label="Help">?</button>`);

  // Load runtime config from the backend first, then findings
  await loadStatus();
  await loadFindings();
  render();
});

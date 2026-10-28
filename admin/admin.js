import {
  login,
  logout,
  getUser,
  handleAuthCallback,
  acceptInvite,
  updateUser,
  requestPasswordRecovery,
  AuthError,
  MissingIdentityError,
} from "@netlify/identity";

const STATUSES = ["Received", "In Progress", "Resolved", "Rejected"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const CATEGORIES = ["Roads", "Water", "Garbage collection", "Street lighting", "Public safety", "Other"];
const MANAGEMENT_ROLES = ["admin", "manager"];

const $ = (id) => document.getElementById(id);
const views = { auth: $("authView"), denied: $("deniedView"), dashboard: $("dashboardView") };

let reports = [];
let activeReport = null;
let inviteToken = null;

function show(name) {
  for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
}

function authMessage(text, isError = false) {
  $("authMessage").textContent = text;
  $("authMessage").classList.toggle("error", isError);
}

function describeAuthError(error) {
  if (error instanceof MissingIdentityError) return "Sign-in is not available yet. Identity is not enabled for this site.";
  if (error instanceof AuthError) {
    if (error.status === 401) return "Invalid email or password.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function fillSelect(select, options, placeholder) {
  if (placeholder !== undefined) select.replaceChildren(new Option(placeholder, ""));
  else select.replaceChildren();
  for (const option of options) select.append(new Option(option, option));
}

const formatDate = (value) =>
  new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const slug = (value) => value.toLowerCase().replace(/\s+/g, "-");

// ---------- Auth ----------

function showPasswordForm(intro) {
  $("loginForm").hidden = true;
  $("passwordForm").hidden = false;
  $("passwordIntro").textContent = intro;
  show("auth");
}

async function enterApp(user) {
  if (!user) {
    $("loginForm").hidden = false;
    $("passwordForm").hidden = true;
    show("auth");
    return;
  }
  const roles = user.roles ?? [];
  if (!roles.some((role) => MANAGEMENT_ROLES.includes(role))) {
    $("deniedEmail").textContent = user.email;
    show("denied");
    return;
  }
  $("userEmail").textContent = user.name || user.email;
  show("dashboard");
  await loadReports();
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);
  authMessage("Signing in...");
  try {
    const user = await login(form.get("email"), form.get("password"));
    authMessage("");
    await enterApp(user);
  } catch (error) {
    authMessage(describeAuthError(error), true);
  }
});

$("forgotBtn").addEventListener("click", async () => {
  const email = $("loginForm").elements.email.value.trim();
  if (!email) {
    authMessage("Enter your email address above first.", true);
    return;
  }
  try {
    await requestPasswordRecovery(email);
    authMessage("If that account exists, a password reset link has been emailed.");
  } catch (error) {
    authMessage(describeAuthError(error), true);
  }
});

$("passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = new FormData(event.target).get("password");
  try {
    const user = inviteToken ? await acceptInvite(inviteToken, password) : await updateUser({ password });
    inviteToken = null;
    event.target.reset();
    authMessage("");
    await enterApp(user);
  } catch (error) {
    authMessage(describeAuthError(error), true);
  }
});

document.querySelectorAll("[data-logout]").forEach((button) =>
  button.addEventListener("click", async () => {
    await logout().catch(() => {});
    reports = [];
    enterApp(null);
  }),
);

// ---------- Data ----------

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (response.status === 401) {
    enterApp(null);
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function loadReports() {
  try {
    reports = await api("/api/admin/reports");
    render();
  } catch (error) {
    $("reportRows").replaceChildren();
    $("emptyState").hidden = false;
    $("emptyState").textContent = error.message;
  }
}

// ---------- Rendering ----------

function renderBars(container, entries, total) {
  container.replaceChildren();
  if (total === 0) {
    container.append(Object.assign(document.createElement("p"), { className: "empty", textContent: "No data yet." }));
    return;
  }
  const max = Math.max(...entries.map(([, count]) => count), 1);
  for (const [label, count, modifier] of entries) {
    const row = document.createElement("div");
    row.className = "bar-row";
    const name = Object.assign(document.createElement("span"), { className: "bar-label", textContent: label });
    const track = Object.assign(document.createElement("div"), { className: "bar-track" });
    const fill = Object.assign(document.createElement("div"), { className: `bar-fill ${modifier || ""}` });
    fill.style.width = `${(count / max) * 100}%`;
    track.append(fill);
    const value = Object.assign(document.createElement("span"), { className: "bar-value", textContent: count });
    row.append(name, track, value);
    container.append(row);
  }
}

function renderSummary() {
  const count = (fn) => reports.filter(fn).length;
  const open = reports.filter((r) => r.status === "Received" || r.status === "In Progress");
  const resolved = count((r) => r.status === "Resolved");

  $("kpiTotal").textContent = reports.length;
  $("kpiReceived").textContent = count((r) => r.status === "Received");
  $("kpiProgress").textContent = count((r) => r.status === "In Progress");
  $("kpiResolved").textContent = resolved;
  $("kpiRate").textContent = reports.length ? `${Math.round((resolved / reports.length) * 100)}% of all` : "";
  $("kpiUrgent").textContent = open.filter((r) => r.priority === "Urgent").length;

  const byCategory = CATEGORIES.map((c) => [c, open.filter((r) => r.category === c).length])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  renderBars($("categoryChart"), byCategory, open.length);

  const byStatus = STATUSES.map((s) => [s, count((r) => r.status === s), `status-${slug(s)}`]);
  renderBars($("statusChart"), byStatus, reports.length);
}

function filteredReports() {
  const query = $("search").value.toLowerCase().trim();
  const status = $("filterStatus").value;
  const category = $("filterCategory").value;
  const priority = $("filterPriority").value;
  return reports.filter(
    (r) =>
      (!status || r.status === status) &&
      (!category || r.category === category) &&
      (!priority || r.priority === priority) &&
      (!query ||
        [r.title, r.location, r.reference, r.assignedTo].some((v) => (v || "").toLowerCase().includes(query))),
  );
}

function pill(text, kind) {
  return Object.assign(document.createElement("span"), { className: `pill ${kind}-${slug(text)}`, textContent: text });
}

function renderTable() {
  const rows = filteredReports();
  const body = $("reportRows");
  body.replaceChildren();
  $("emptyState").hidden = rows.length > 0;
  $("emptyState").textContent = reports.length ? "No reports match these filters." : "No reports have been submitted yet.";

  for (const report of rows) {
    const tr = document.createElement("tr");
    tr.tabIndex = 0;
    const cells = [
      report.reference,
      report.title,
      report.category,
      report.location,
      pill(report.priority, "priority"),
      pill(report.status, "status"),
      report.assignedTo || "—",
      new Date(report.createdAt).toLocaleDateString(),
    ];
    for (const cell of cells) {
      const td = document.createElement("td");
      td.append(cell);
      tr.append(td);
    }
    tr.addEventListener("click", () => openDrawer(report));
    tr.addEventListener("keydown", (e) => e.key === "Enter" && openDrawer(report));
    body.append(tr);
  }
}

function render() {
  renderSummary();
  renderTable();
}

["search", "filterStatus", "filterCategory", "filterPriority"].forEach((id) =>
  $(id).addEventListener(id === "search" ? "input" : "change", renderTable),
);
$("refreshBtn").addEventListener("click", loadReports);

// ---------- Drawer ----------

function openDrawer(report) {
  activeReport = report;
  $("drawerRef").textContent = report.reference;
  $("drawerTitle").textContent = report.title;
  $("drawerCategory").textContent = report.category;
  $("drawerLocation").textContent = report.location;
  $("drawerCreated").textContent = formatDate(report.createdAt);
  $("drawerUpdated").textContent = formatDate(report.updatedAt);
  $("drawerDescription").textContent = report.description;

  const photo = $("drawerPhoto");
  photo.hidden = !report.photoKey;
  if (report.photoKey) photo.src = `/api/admin/photos/${encodeURIComponent(report.photoKey)}`;
  else photo.removeAttribute("src");

  $("editStatus").value = report.status;
  $("editPriority").value = report.priority;
  $("editAssigned").value = report.assignedTo;
  $("editNotes").value = report.managementNotes;
  $("drawerMessage").textContent = "";

  $("drawer").hidden = false;
  $("drawerBackdrop").hidden = false;
}

function closeDrawer() {
  activeReport = null;
  $("drawer").hidden = true;
  $("drawerBackdrop").hidden = true;
}

$("closeDrawer").addEventListener("click", closeDrawer);
$("drawerBackdrop").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

function replaceReport(updated) {
  reports = reports.map((r) => (r.id === updated.id ? updated : r));
  render();
}

$("drawerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeReport) return;
  const changes = Object.fromEntries(new FormData(event.target));
  $("drawerMessage").textContent = "Saving...";
  try {
    const updated = await api(`/api/admin/reports/${activeReport.id}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    });
    replaceReport(updated);
    activeReport = updated;
    $("drawerUpdated").textContent = formatDate(updated.updatedAt);
    $("drawerMessage").textContent = "Changes saved.";
  } catch (error) {
    $("drawerMessage").textContent = error.message;
  }
});

$("deleteBtn").addEventListener("click", async () => {
  if (!activeReport) return;
  if (!confirm(`Permanently delete ${activeReport.reference}? This cannot be undone.`)) return;
  try {
    await api(`/api/admin/reports/${activeReport.id}`, { method: "DELETE" });
    reports = reports.filter((r) => r.id !== activeReport.id);
    closeDrawer();
    render();
  } catch (error) {
    $("drawerMessage").textContent = error.message;
  }
});

// ---------- Init ----------

fillSelect($("filterStatus"), STATUSES, "All statuses");
fillSelect($("filterCategory"), CATEGORIES, "All categories");
fillSelect($("filterPriority"), PRIORITIES, "All priorities");
fillSelect($("editStatus"), STATUSES);
fillSelect($("editPriority"), PRIORITIES);

async function init() {
  try {
    const result = await handleAuthCallback();
    if (result?.type === "invite") {
      inviteToken = result.token;
      showPasswordForm("Welcome! Choose a password to activate your management account.");
      return;
    }
    if (result?.type === "recovery") {
      showPasswordForm("Choose a new password for your account.");
      return;
    }
  } catch (error) {
    authMessage(describeAuthError(error), true);
  }
  await enterApp(await getUser());
}

init();

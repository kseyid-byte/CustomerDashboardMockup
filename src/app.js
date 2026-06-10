const csvProducts = {
  accounts: "./public/data/accounts.csv",
  performance: "./public/data/performance.csv",
  orders: "./public/data/orders.csv",
  inventory: "./public/data/inventory.csv",
  opportunities: "./public/data/opportunities.csv",
  interactions: "./public/data/interactions.csv",
  weather: "./public/data/weather.csv",
  alerts: "./public/data/alerts.csv",
  feedback: "./public/data/feedback.csv",
  waterfall: "./public/data/waterfall.csv",
  account_health: "./public/data/account_health.csv",
  annual_plan: "./public/data/annual_plan.csv",
  last_year_sales: "./public/data/last_year_sales.csv",
  sell_out: "./public/data/sell_out.csv",
  data_freshness: "./public/data/data_freshness.csv",
  rebate_tiers: "./public/data/rebate_tiers.csv",
  next_best_actions: "./public/data/next_best_actions.csv",
  weather_alerts: "./public/data/weather_alerts.csv"
};

const state = {
  data: {},
  filters: {
    period: "All",
    region: "All",
    territory: "All",
    sales_rep: "All",
    customer: "All",
    crop: "All",
    product: "All",
    season: "All",
    search: ""
  },
  activeView: "Cockpit",
  activePage: "overview",
  platformView: "chat",
  sidebarCollapsed: false,
  platformSidebarCollapsed: false,
  platformChatMessages: [],
  dashboardChatOpen: false,
  dashboardChatMessages: [],
  expandedMonths: ["2026-05"],
  selectedAccountId: null
};

const app = document.querySelector("#app");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (value || row.length) {
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      }
      if (char === "\r" && next === "\n") i += 1;
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, coerce(record[index] ?? "")]))
  );
}

function coerce(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (!Number.isNaN(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

async function loadDataProducts() {
  const entries = await Promise.all(
    Object.entries(csvProducts).map(async ([name, path]) => {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`Unable to load ${path}`);
      return [name, parseCsv(await response.text())];
    })
  );
  return Object.fromEntries(entries);
}

function futureDatabricksAdapter() {
  return {
    note: "Replace loadDataProducts with Databricks SQL Warehouse or serving endpoint calls.",
    dimensions: ["period", "region", "territory", "sales_rep", "customer", "crop", "product", "channel", "season"],
    grain: "account-product-period",
    security: "Apply row-level entitlements by user role before returning records."
  };
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    notation: Math.abs(value) >= 1000000 ? "compact" : "standard",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value || 0);
}

function pct(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function byId(id) {
  return state.data.accounts.find((account) => account.account_id === id);
}

function joinedPerformance() {
  return state.data.performance.map((row) => ({
    ...row,
    account: byId(row.account_id)
  }));
}

function optionValues(field, rows) {
  return ["All", ...Array.from(new Set(rows.map((row) => row[field]).filter(Boolean))).sort()];
}

function filterRows() {
  const q = state.filters.search.toLowerCase();
  return joinedPerformance().filter((row) => {
    const account = row.account;
    const conditions = [
      state.filters.period === "All" || row.period === state.filters.period,
      state.filters.season === "All" || row.season === state.filters.season,
      state.filters.region === "All" || account.region === state.filters.region,
      state.filters.territory === "All" || account.territory === state.filters.territory,
      state.filters.sales_rep === "All" || account.sales_rep === state.filters.sales_rep,
      state.filters.customer === "All" || account.customer === state.filters.customer,
      state.filters.crop === "All" || row.crop === state.filters.crop,
      state.filters.product === "All" || row.product === state.filters.product,
      !q || `${account.customer} ${account.sales_rep} ${row.product} ${row.crop}`.toLowerCase().includes(q)
    ];
    return conditions.every(Boolean);
  });
}

function accountIdsInScope(rows) {
  return new Set(rows.map((row) => row.account_id));
}

function scoped(table, rows) {
  const ids = accountIdsInScope(rows);
  let result = state.data[table].filter((row) => ids.has(row.account_id));
  if (table === "waterfall") {
    result = result.filter((row) => {
      const conditions = [
        state.filters.period === "All" || row.period === state.filters.period,
        state.filters.season === "All" || row.season === state.filters.season,
        state.filters.product === "All" || row.product === state.filters.product
      ];
      return conditions.every(Boolean);
    });
  }
  return result;
}

function calcMetrics(rows) {
  const actual = rows.reduce((sum, row) => sum + row.sales_actual, 0);
  const target = rows.reduce((sum, row) => sum + row.sales_target, 0);
  const volume = rows.reduce((sum, row) => sum + row.volume_actual, 0);
  const grossProfit = rows.reduce((sum, row) => sum + row.gross_profit, 0);
  const marginActual = actual ? grossProfit / actual : 0;
  const orders = scoped("orders", rows);
  const openOrderValue = orders
    .filter((order) => ["Open", "Backorder"].includes(order.status))
    .reduce((sum, order) => sum + order.value, 0);
  const alerts = scoped("alerts", rows).filter((alert) => alert.status === "Open");
  const inventoryRisk = scoped("inventory", rows).filter((item) => ["Low", "Critical"].includes(item.stock_status)).length;
  return { actual, target, volume, grossProfit, marginActual, openOrderValue, alerts: alerts.length, inventoryRisk };
}

function varianceClass(value) {
  if (value >= 1) return "good";
  if (value >= 0.92) return "warn";
  return "bad";
}

function severityClass(value) {
  if (["High", "Critical", "Overdue", "Stale"].includes(value)) return "bad";
  if (["Medium", "Low", "Watch", "At risk"].includes(value)) return "warn";
  return "good";
}

function render() {
  const rows = filterRows();
  const metrics = calcMetrics(rows);
  const platformContent = state.platformView === "chat"
    ? renderNewChatPage()
    : `
      <div class="dashboard-shell">
        <header class="app-header">
          <div>
            <p>Wholesale customer cockpit</p>
            <h1>Customer Cockpit</h1>
          </div>
          <div class="brand-lockup">
            <img src="./public/assets/syngenta-logo.svg" alt="Syngenta" />
          </div>
        </header>
        ${renderEmbeddedDashboard(rows, metrics)}
      </div>
      ${renderDashboardChatWidget()}
    `;

  app.innerHTML = `
    ${renderPlatformShell(platformContent)}
    ${renderDrawer()}
    ${renderModal()}
    <div class="toast" id="toast"></div>
  `;

  bindEvents();
}

function renderPlatformShell(content) {
  return `
    <div class="platform-shell ${state.platformSidebarCollapsed ? "platform-collapsed" : ""}">
      <aside class="platform-sidebar" aria-label="Lynx platform navigation">
        <div class="platform-sidebar-top">
          <div class="platform-eye-mark"><img src="./public/assets/lynx-eye.webp" alt="" /></div>
          <button class="platform-collapse" data-action="toggle-platform-sidebar" aria-label="${state.platformSidebarCollapsed ? "Expand" : "Collapse"} platform navigation" title="${state.platformSidebarCollapsed ? "Expand" : "Collapse"} platform navigation">
            ${platformIcon(state.platformSidebarCollapsed ? "panel-left-open" : "panel-left-close")}
          </button>
        </div>
        <nav class="platform-nav">
          ${platformNavItem("copy-plus", "New chat", { action: "new-platform-chat", active: state.platformView === "chat", iconClass: "copy-plus-icon" })}
          ${platformNavItem("search", "Search chats")}
          ${platformNavItem("book-open", "Library")}
          ${platformNavItem("⌘", "Skills")}
          ${platformNavItem("layout-grid", "Canvas")}
          ${platformNavItem("books", "Catalogue")}
        </nav>
        <section class="platform-section">
          <button class="platform-section-title">Projects <span>⌄</span></button>
          ${platformNavItem("folder-plus", "New Project")}
        </section>
        <section class="platform-section">
          <button class="platform-section-title">Apps <span>⌄</span></button>
          <button class="platform-app-link ${state.platformView === "dashboard" ? "active" : ""}" data-action="open-customer-dashboard" type="button">
            <span class="platform-nav-icon">${platformIcon("head")}</span>
            <span>Customer Cockpit</span>
          </button>
        </section>
        <section class="platform-section platform-empty-section">
          <button class="platform-section-title">Your chats <span>⌄</span></button>
        </section>
        <div class="platform-user">
          <div class="platform-avatar">KS</div>
          <div>
            <strong>Kerem Seyid</strong>
            <span>Kerem.Seyid@syngenta.com</span>
          </div>
        </div>
      </aside>
      <main class="platform-main">
        <header class="platform-topbar">
          <div class="platform-product-switcher">Lynx <span>Max</span> <small>⌄</small></div>
          <div class="platform-logo"><img src="./public/assets/lynx-eye.webp" alt="" /> Luix</div>
        </header>
        <section class="platform-app-canvas ${state.platformView === "chat" ? "chat-canvas" : ""}" aria-label="Customer Cockpit app">
          ${content}
        </section>
      </main>
    </div>
  `;
}

function platformNavItem(icon, label, options = {}) {
  const actionAttr = options.action ? ` data-action="${options.action}"` : "";
  return `
    <button class="platform-nav-item ${options.active ? "active" : ""}"${actionAttr} type="button">
      <span class="platform-nav-icon ${options.iconClass || ""}">${platformIcon(icon)}</span>
      <span>${label}</span>
    </button>
  `;
}

function platformIcon(icon) {
  const icons = {
    search: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5"></circle>
        <path d="M15.5 15.5 21 21"></path>
      </svg>
    `,
    "book-open": `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 7v14"></path>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H12V5H6.5A2.5 2.5 0 0 0 4 7.5v12Z"></path>
        <path d="M20 19.5A2.5 2.5 0 0 0 17.5 17H12V5h5.5A2.5 2.5 0 0 1 20 7.5v12Z"></path>
      </svg>
    `,
    "layout-grid": `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="1.5"></rect>
        <rect x="13" y="4" width="7" height="7" rx="1.5"></rect>
        <rect x="4" y="13" width="7" height="7" rx="1.5"></rect>
        <rect x="13" y="13" width="7" height="7" rx="1.5"></rect>
      </svg>
    `,
    books: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h4a2 2 0 0 1 2 2v15H7a2 2 0 0 1-2-2V4Z"></path>
        <path d="M11 6a2 2 0 0 1 2-2h4v15a2 2 0 0 1-2 2h-4V6Z"></path>
        <path d="M8 8h1"></path>
        <path d="M15 8h1"></path>
      </svg>
    `,
    "folder-plus": `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.5h6l2 2h8v10.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6.5Z"></path>
        <path d="M13 15h6"></path>
        <path d="M16 12v6"></path>
      </svg>
    `,
    head: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 21v-2.4a4.6 4.6 0 0 1 4.6-4.6h.8A4.6 4.6 0 0 1 18 18.6V21"></path>
        <path d="M8.5 8.5a4.5 4.5 0 0 1 9 0c0 2.5-2 4.5-4.5 4.5S8.5 11 8.5 8.5Z"></path>
        <path d="M7 10.5c-1.2-.2-2-.9-2-2 0-1 .8-1.8 2-2"></path>
      </svg>
    `,
    paperclip: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.1 9.1a2 2 0 1 1-2.8-2.8l8.5-8.5"></path>
      </svg>
    `,
    microphone: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"></path>
        <path d="M19 11a7 7 0 0 1-14 0"></path>
        <path d="M12 18v4"></path>
        <path d="M8 22h8"></path>
      </svg>
    `,
    "panel-left-close": `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2"></rect>
        <path d="M9 4v16"></path>
        <path d="m15 10-3 2 3 2"></path>
      </svg>
    `,
    "panel-left-open": `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2"></rect>
        <path d="M9 4v16"></path>
        <path d="m12 10 3 2-3 2"></path>
      </svg>
    `,
    "message-circle": `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.8 8.8 0 0 1-3.8-.9L3 20l1.1-4.7a8.2 8.2 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.9-8.4 8.4 8.4 0 0 1 8.9 8.4Z"></path>
        <path d="M8 11h8"></path>
        <path d="M8 14h5"></path>
      </svg>
    `
  };
  return icons[icon] || icon;
}

function renderDashboardChatWidget() {
  const messages = state.dashboardChatMessages.length
    ? state.dashboardChatMessages
    : [{ role: "bot", text: "Ask me anything about this dashboard." }];

  return `
    <div class="dashboard-chat-widget ${state.dashboardChatOpen ? "open" : ""}">
      ${state.dashboardChatOpen ? `
        <section class="dashboard-chat-panel" aria-label="Dashboard chatbot">
          <div class="dashboard-chat-head">
            <div>
              <strong>Dashboard assistant</strong>
              <span>Mock chat for sales dashboard questions</span>
            </div>
            <button type="button" data-action="toggle-dashboard-chat" aria-label="Close dashboard chat">×</button>
          </div>
          <div class="dashboard-chat-messages">
            ${messages.map((message) => `
              <div class="dashboard-chat-message ${message.role}">
                <span>${escapeHtml(message.text)}</span>
              </div>
            `).join("")}
          </div>
          <form class="dashboard-chat-form" id="dashboard-chat-form">
            <input id="dashboard-chat-input" autocomplete="off" placeholder="Ask about sales, customers, stock..." />
            <button type="submit" aria-label="Send dashboard question">↑</button>
          </form>
        </section>
      ` : `
        <button class="dashboard-chat-launcher" type="button" data-action="toggle-dashboard-chat" aria-label="Open dashboard chat">
          <span>${platformIcon("message-circle")}</span>
        </button>
      `}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderNewChatPage() {
  const prompts = [
    "What can you do?",
    "What fungicides does Syngenta sell ?",
    "Tell me about Product Labels and Packaging information"
  ];
  return `
    <div class="chat-landing">
      <div class="chat-center">
        <h2>Good to see you, Kerem.</h2>
        <form class="chat-composer" id="platform-chat-form" aria-label="Ask anything">
          <textarea id="platform-chat-input" rows="2" placeholder="Ask anything"></textarea>
          <div class="chat-composer-actions">
            <button type="button" aria-label="Attach file">${platformIcon("paperclip")}</button>
            <div>
              <button type="button" aria-label="Voice input">${platformIcon("microphone")}</button>
              <button class="send" type="button" aria-label="Send">↑</button>
            </div>
          </div>
        </form>
        <div class="chat-suggestions">
          ${prompts.map((prompt) => `
            <button type="button">
              <span>↗</span>
              <strong>${prompt}</strong>
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderEmbeddedDashboard(rows, metrics) {
  return `
    <div class="dashboard-frame ${state.sidebarCollapsed ? "sidebar-collapsed" : ""}">
      <aside class="mini-sidebar">
        <div class="mini-brand">
          <span>KAM - Wholesaler view</span>
          <button class="collapse-button" data-action="toggle-sidebar" title="${state.sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}">${state.sidebarCollapsed ? "›" : "‹"}</button>
        </div>
        ${sidebarPages().map((page) => `
          <button class="${state.activePage === page.id ? "active" : ""}" data-page="${page.id}" title="${page.label}" aria-label="${page.label}">
            <span class="nav-icon">${page.icon}</span>
            <span class="nav-label">${page.label}</span>
          </button>
        `).join("")}
        <div class="upload-label">UPLOAD</div>
        <button class="${state.activePage === "data-input" ? "active" : ""}" data-page="data-input" title="Customer data input" aria-label="Customer data input">
          <span class="nav-icon">↥</span>
          <span class="nav-label">Customer data input</span>
        </button>
      </aside>
      <section class="mini-main">
        <div class="mini-topbar">
          <strong><span class="filter-icon product-icon">▣</span>Product</strong>
          <select data-filter="product">${optionValues("product", joinedPerformance()).map((option) => `<option value="${option}" ${state.filters.product === option ? "selected" : ""}>${option}</option>`).join("")}</select>
          <strong><span class="filter-icon customer-icon">👤</span>Customer</strong>
          <select data-filter="customer">${optionValues("customer", state.data.accounts).map((option) => `<option value="${option}" ${state.filters.customer === option ? "selected" : ""}>${option}</option>`).join("")}</select>
          <strong><span class="filter-icon crop-icon">◒</span>Crop</strong>
          <select data-filter="crop">${optionValues("crop", joinedPerformance()).map((option) => `<option value="${option}" ${state.filters.crop === option ? "selected" : ""}>${option}</option>`).join("")}</select>
          <strong><span class="filter-icon territory-icon">⌖</span>Territory</strong>
          <select data-filter="territory">${optionValues("territory", state.data.accounts).map((option) => `<option value="${option}" ${state.filters.territory === option ? "selected" : ""}>${option}</option>`).join("")}</select>
        </div>
        ${renderPageContent(rows, metrics)}
      </section>
    </div>
  `;
}

function sidebarPages() {
  return [
    { id: "overview", label: "Account overview", icon: "◎" },
    { id: "planner", label: "Weekly planner", icon: "▦" },
    { id: "prep", label: "Pre-meeting prep", icon: "◫" },
    { id: "changelog", label: "Changes", icon: "⚙" }
  ];
}

function pageFromHash() {
  const hash = window.location.hash.replace("#", "");
  const validPages = new Set([...sidebarPages().map((page) => page.id), "data-input"]);
  return validPages.has(hash) ? hash : null;
}

function renderPageContent(rows, metrics) {
  const pageMap = {
    overview: () => renderOverviewPage(rows, metrics),
    planner: () => renderPlannerPage(rows),
    prep: () => renderPrepPage(rows),
    changelog: () => renderChangelogPage(rows),
    "data-input": () => renderDataInputPage(rows)
  };
  return (pageMap[state.activePage] || pageMap.overview)();
}

function renderOverviewPage(rows, metrics) {
  return `
    <div class="mini-kpis">
      <div><span>Sales</span><strong>${formatMoney(metrics.actual)}</strong></div>
      <div><span>Volume</span><strong>${formatNumber(metrics.volume)} L</strong></div>
      <div><span>Gross profit</span><strong>${formatMoney(metrics.grossProfit)}</strong></div>
      <div><span>Open orders</span><strong>${formatMoney(metrics.openOrderValue)}</strong></div>
      <div><span>Inventory risk</span><strong>${metrics.inventoryRisk}</strong></div>
      <div><span>Credit risk</span><strong>${scoped("alerts", rows).filter((alert) => alert.category === "Credit").length}</strong></div>
    </div>
    <div class="mini-tabs">
      <button class="selected" data-page="overview">Scenario</button>
      <button data-page="prep">Target scenario</button>
      <button data-action="export">Download CSV</button>
    </div>
    <div class="mini-content">
      <div class="mini-table-wrap account-overview-wrap" tabindex="0">${accountOverviewMonthlyTable(rows)}</div>
      <div class="right-rail">
        ${miniWeather(rows)}
        ${miniAlerts(rows)}
      </div>
    </div>
    <div class="overview-card-grid">
      ${accountHeatMapPanel(rows)}
      ${weatherDrivenAlertsPanel(rows)}
      ${miniWaterfall(rows)}
      ${miniOpportunity(rows)}
      ${miniAccountHealth(rows)}
      ${miniOrders(rows)}
    </div>
  `;
}

function monthDefinitions() {
  return {
    "2026-Q1": [
      { key: "2026-01", label: "Jan 2026", factor: 0.3 },
      { key: "2026-02", label: "Feb 2026", factor: 0.32 },
      { key: "2026-03", label: "Mar 2026", factor: 0.38 }
    ],
    "2026-Q2": [
      { key: "2026-04", label: "Apr 2026", factor: 0.29 },
      { key: "2026-05", label: "May 2026", factor: 0.34 },
      { key: "2026-06", label: "Jun 2026", factor: 0.37 }
    ],
    "2026-Q3": [
      { key: "2026-07", label: "Jul 2026", factor: 0.32 },
      { key: "2026-08", label: "Aug 2026", factor: 0.33 },
      { key: "2026-09", label: "Sep 2026", factor: 0.35 }
    ],
    "2026-Q4": [
      { key: "2026-10", label: "Oct 2026", factor: 0.34 },
      { key: "2026-11", label: "Nov 2026", factor: 0.33 },
      { key: "2026-12", label: "Dec 2026", factor: 0.33 }
    ]
  };
}

function accountOverviewRows(rows) {
  const monthMap = monthDefinitions();
  const months = Object.values(monthMap).flat();
  const monthRows = new Map(months.map((month) => [month.key, {
    key: month.key,
    label: month.label,
    products: new Map(),
    sales: 0,
    salesPlan: 0,
    salesLy: 0,
    volume: 0,
    volumePlan: 0,
    volumeLy: 0,
    gp: 0,
    gpPlan: 0,
    gpLy: 0
  }]));
  const scopeKeys = new Set(rows.map((row) => `${row.account_id}|${row.product}|${row.crop}`));

  const addToMonth = (monthKey, row, values) => {
    const monthRow = monthRows.get(monthKey);
    if (!monthRow) return;
    const productKey = row.product;
    if (!monthRow.products.has(productKey)) {
      monthRow.products.set(productKey, {
        key: `${monthKey}-${productKey}`,
        label: productKey,
        crop: row.crop,
        sales: 0,
        salesPlan: 0,
        salesLy: 0,
        volume: 0,
        volumePlan: 0,
        volumeLy: 0,
        gp: 0,
        gpPlan: 0,
        gpLy: 0
      });
    }
    const target = monthRow.products.get(productKey);
    [target, monthRow].forEach((bucket) => {
      bucket.sales += values.sales || 0;
      bucket.salesPlan += values.salesPlan || 0;
      bucket.salesLy += values.salesLy || 0;
      bucket.volume += values.volume || 0;
      bucket.volumePlan += values.volumePlan || 0;
      bucket.volumeLy += values.volumeLy || 0;
      bucket.gp += values.gp || 0;
      bucket.gpPlan += values.gpPlan || 0;
      bucket.gpLy += values.gpLy || 0;
    });
  };

  rows.forEach((row) => {
    (monthMap[row.period] || []).forEach((month) => {
      addToMonth(month.key, row, {
        sales: row.sales_actual * month.factor,
        volume: row.volume_actual * month.factor,
        gp: row.gross_profit * month.factor
      });
    });
  });

  state.data.annual_plan
    .filter((row) => scopeKeys.has(`${row.account_id}|${row.product}|${row.crop}`))
    .forEach((row) => addToMonth(row.month, row, {
      salesPlan: row.sales_plan,
      volumePlan: row.volume_plan,
      gpPlan: row.gross_profit_plan
    }));

  state.data.last_year_sales
    .filter((row) => scopeKeys.has(`${row.account_id}|${row.product}|${row.crop}`))
    .forEach((row) => addToMonth(row.month.replace("2025", "2026"), row, {
      salesLy: row.sales_actual,
      volumeLy: row.volume_actual,
      gpLy: row.gross_profit
    }));

  return Array.from(monthRows.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function accountOverviewMonthlyTable(rows) {
  const monthRows = accountOverviewRows(rows);
  return `
    <table class="mini-table account-overview-table">
      <thead>
        <tr>
          <th class="sticky-dim sticky-corner-top">Month / Product</th>
          <th colspan="5">Sales</th>
          <th colspan="5">Volume</th>
          <th colspan="5">GP</th>
        </tr>
        <tr>
          <th class="sticky-dim sticky-corner-sub" aria-label="Month and product hierarchy"></th>
          ${["Actual", "Plan", "% Plan", "LY", "% LY"].map((label) => `<th>${label}</th>`).join("")}
          ${["Actual", "Plan", "% Plan", "LY", "% LY"].map((label) => `<th>${label}</th>`).join("")}
          ${["Actual", "Plan", "% Plan", "LY", "% LY"].map((label) => `<th>${label}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${monthRows.map((month) => {
          const expanded = state.expandedMonths.includes(month.key);
          return `
            ${overviewTableRow(month, "month", expanded)}
            ${expanded ? Array.from(month.products.values()).sort((a, b) => b.sales - a.sales).map((product) => overviewTableRow(product, "product")).join("") : ""}
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function overviewTableRow(row, type, expanded = false) {
  const isMonth = type === "month";
  return `
    <tr class="${isMonth ? "month-row" : "product-row"}">
      <td class="sticky-dim">
        ${isMonth ? `<button class="expand-month" data-month-toggle="${row.key}" aria-label="${expanded ? "Collapse" : "Expand"} ${row.label}">${expanded ? "−" : "+"}</button>` : `<span class="product-indent"></span>`}
        <strong>${row.label}</strong>
        ${row.crop ? `<small>${row.crop}</small>` : ""}
      </td>
      ${metricCells(row.sales, row.salesPlan, row.salesLy, "money")}
      ${metricCells(row.volume, row.volumePlan, row.volumeLy, "number")}
      ${metricCells(row.gp, row.gpPlan, row.gpLy, "money")}
    </tr>
  `;
}

function metricCells(actual, plan, ly, format) {
  const formatter = format === "money" ? formatMoney : (value) => formatNumber(value);
  const vsPlan = plan ? actual / plan : 0;
  const vsLy = ly ? actual / ly : 0;
  return `
    <td>${formatter(actual)}</td>
    <td>${formatter(plan)}</td>
    <td class="${vsPlan >= 1 ? "pos" : "neg"}">${pct(vsPlan)}</td>
    <td>${formatter(ly)}</td>
    <td class="${vsLy >= 1 ? "pos" : "neg"}">${pct(vsLy)}</td>
  `;
}

function renderPlannerPage(rows) {
  const alerts = scoped("alerts", rows);
  const healthRows = scoped("account_health", rows);
  const events = weeklyPlannerEvents(rows, alerts, healthRows);
  const days = ["Mon 25", "Tue 26", "Wed 27", "Thu 28", "Fri 29"];
  const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const pendingActions = healthRows
    .filter((item) => item.priority !== "Low")
    .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] ?? 3) - ({ High: 0, Medium: 1, Low: 2 }[b.priority] ?? 3))
    .slice(0, 6);
  return `
    <div class="page-head">
      <div><h2>Weekly planner</h2><p>Sales rep calendar with trips, customer visits, weekly team calls, updates, and pending customer actions.</p></div>
      <button class="btn primary" data-action="visit-plan">Rebuild plan</button>
    </div>
    <div class="calendar-layout">
      <section class="calendar-board">
        <div class="calendar-toolbar">
          <div><strong>Rep calendar</strong><span>Week of 25 May 2026</span></div>
          <div class="calendar-legend">
            <span><i class="event-dot visit"></i>Visit</span>
            <span><i class="event-dot trip"></i>Trip</span>
            <span><i class="event-dot team"></i>Team</span>
            <span><i class="event-dot action"></i>Action</span>
          </div>
        </div>
        <div class="calendar-grid">
          <div class="calendar-corner"></div>
          ${days.map((day) => `<div class="day-head">${day}</div>`).join("")}
          <div class="calendar-time-grid">
            <div class="time-gutter">
              ${hours.map((hour) => `<div class="time-slot-label">${String(hour).padStart(2, "0")}:00</div>`).join("")}
            </div>
            <div class="calendar-days-grid">
              ${days.map((day) => `
                <div class="calendar-day">
                  ${hours.map(() => `<div class="calendar-hour"></div>`).join("")}
                  ${events.filter((event) => event.day === day).map((event) => calendarEvent(event)).join("")}
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </section>
      <aside class="planner-actions">
        <div class="mini-panel">
          <div class="panel-title-row">
            <h3>Pending actions</h3>
            <span>${pendingActions.length} open</span>
          </div>
          <div class="pending-list">
            ${pendingActions.map((item) => {
              const account = byId(item.account_id);
              return `
                <button class="pending-item clickable" data-account="${item.account_id}">
                  <span class="health-badge ${healthClass(item.health_status)}">${item.priority}</span>
                  <strong>${account.customer}</strong>
                  <small>${item.rep_action_status}</small>
                  <p>${item.manager_recommendation}</p>
                  <em>${item.due_date}</em>
                </button>
              `;
            }).join("")}
          </div>
        </div>
      </aside>
    </div>
  `;
}

function weeklyPlannerEvents(rows, alerts, healthRows) {
  const accountIds = Array.from(accountIdsInScope(rows));
  const account = (index) => byId(accountIds[index % accountIds.length]);
  const highRisk = healthRows.find((item) => item.priority === "High");
  const mediumRisk = healthRows.find((item) => item.priority === "Medium");
  const firstAlert = alerts[0];
  return [
    { day: "Mon 25", time: "08:30", duration: 75, type: "team", title: "Weekly sales team call", detail: "Pipeline, supply constraints, rebate gaps", meta: "Regional team" },
    { day: "Mon 25", time: "10:30", duration: 120, type: "visit", account: byId(highRisk?.account_id) || account(0), title: "Customer visit", detail: highRisk?.next_best_action || "Review account plan", meta: "On-site" },
    { day: "Mon 25", time: "15:00", duration: 75, type: "action", account: byId(firstAlert?.account_id) || account(1), title: "Follow-up actions", detail: firstAlert?.recommended_action || "Confirm next steps", meta: "CRM update" },
    { day: "Tue 26", time: "09:00", duration: 90, type: "trip", title: "Territory trip", detail: "Lower Saxony West route", meta: "2 customer stops" },
    { day: "Tue 26", time: "11:00", duration: 105, type: "visit", account: account(1), title: "Customer visit", detail: "Wheat program review and stock check", meta: "KAM prep required" },
    { day: "Tue 26", time: "16:00", duration: 60, type: "action", account: account(2), title: "Visit notes update", detail: "Update commitments and next best action", meta: "Due today" },
    { day: "Wed 27", time: "09:30", duration: 75, type: "team", title: "Supply & allocation sync", detail: "Critical stock, backorders, delivery ETAs", meta: "Ops + sales" },
    { day: "Wed 27", time: "13:00", duration: 120, type: "visit", account: byId(mediumRisk?.account_id) || account(3), title: "Customer visit", detail: mediumRisk?.next_best_action || "Opportunity review", meta: "Hybrid" },
    { day: "Thu 28", time: "08:00", duration: 120, type: "trip", title: "Bavaria South trip", detail: "Credit escalation and grape rescue order", meta: "Manager support" },
    { day: "Thu 28", time: "12:30", duration: 120, type: "visit", account: account(4), title: "Customer visit", detail: "Campaign execution and sell-out feedback", meta: "On-site" },
    { day: "Thu 28", time: "17:00", duration: 60, type: "action", account: account(4), title: "Customer update", detail: "Submit feedback and stock levels", meta: "Dashboard input" },
    { day: "Fri 29", time: "09:00", duration: 75, type: "team", title: "Weekly update", detail: "Commitments closed, next week risks", meta: "Sales manager" },
    { day: "Fri 29", time: "11:30", duration: 90, type: "visit", account: account(5), title: "Customer visit", detail: "Confirm substitute product and order status", meta: "Call" },
    { day: "Fri 29", time: "14:30", duration: 90, type: "action", title: "Planner clean-up", detail: "Close overdue actions and prepare Monday brief", meta: "Admin" }
  ];
}

function calendarEvent(event) {
  const accountAttr = event.account ? ` data-account="${event.account.account_id}"` : "";
  const top = calendarEventTop(event.time);
  const height = calendarEventHeight(event.duration || 60);
  return `
    <button class="calendar-event ${event.type} ${event.account ? "clickable" : ""}" style="top:${top}px;height:${height}px;"${accountAttr}>
      <time>${event.time}</time>
      <strong>${event.title}</strong>
      ${event.account ? `<span>${event.account.customer}</span>` : ""}
      <p>${event.detail}</p>
      <em>${event.meta}</em>
    </button>
  `;
}

function calendarEventTop(time) {
  const [hour, minute] = time.split(":").map(Number);
  return ((hour - 8) * 72) + (minute / 60) * 72 + 6;
}

function calendarEventHeight(minutes) {
  return Math.max(48, (minutes / 60) * 72 - 8);
}

function renderPrepPage(rows) {
  const trends = productTrendRows(rows);
  const declining = trends.filter((item) => item.vsLy < 1 || item.vsPlan < 0.98).sort((a, b) => a.vsLy - b.vsLy);
  const increasing = trends.filter((item) => item.vsLy >= 1 && item.vsPlan >= 1).sort((a, b) => b.vsLy - a.vsLy);
  const opportunities = scoped("opportunities", rows).slice(0, 6);
  const orders = scoped("orders", rows).slice(0, 6);
  return `
    <div class="page-head">
      <div><h2>Pre-meeting prep</h2><p>Account brief with monthly product performance, decline/growth signals, country benchmark trends, and open commitments.</p></div>
      <button class="btn primary" data-action="new-opportunity">Create opportunity</button>
    </div>
    <div class="prep-overview-table">
      <div class="mini-table-wrap account-overview-wrap" tabindex="0">${accountOverviewMonthlyTable(rows)}</div>
    </div>
    <div class="prep-signal-grid">
      ${productSignalPanel("Products going down", declining, "decline")}
      ${productSignalPanel("Products increasing", increasing, "growth")}
      ${countryBenchmarkPanel(trends)}
    </div>
    <div class="prep-signal-grid">
      ${sellInSellOutPanel(rows)}
      ${rebateTierPanel(rows)}
      ${nextBestActionPanel(rows)}
    </div>
    <div class="prep-signal-grid prep-two-one-grid">
      ${dataFreshnessPanel(rows)}
      ${customerPrepSummaryPanel(rows)}
    </div>
    <div class="prep-grid">
      <div class="mini-panel"><h3>Talking points</h3><div class="talking-points">${opportunities.map((item) => `<button class="clickable" data-account="${item.account_id}"><strong>${byId(item.account_id).customer}</strong><span>${item.next_step}</span></button>`).join("")}</div></div>
      <div class="mini-panel"><h3>Open commitments</h3><table class="mini-table micro"><tbody>${orders.map((item) => `<tr class="clickable" data-account="${item.account_id}"><td>${byId(item.account_id).customer}</td><td>${item.commitment_due}</td><td>${item.commitment_status}</td></tr>`).join("")}</tbody></table></div>
      ${miniWaterfall(rows)}
    </div>
  `;
}

function productTrendRows(rows) {
  const countryTrendByProduct = {
    "Axial Prime": 1.08,
    "Elatus Plus": 0.96,
    "Revus Top": 1.12,
    "Switch Max": 0.91,
    "Score Flex": 1.04,
    "Amistar Pro": 0.94
  };
  const lyFactors = {
    "Axial Prime": 0.94,
    "Elatus Plus": 1.08,
    "Revus Top": 0.91,
    "Switch Max": 1.12,
    "Score Flex": 0.96,
    "Amistar Pro": 1.1
  };
  const grouped = Object.values(rows.reduce((acc, row) => {
    acc[row.product] ??= {
      product: row.product,
      crop: row.crop,
      accounts: new Set(),
      actual: 0,
      plan: 0,
      volume: 0,
      gp: 0,
      ly: 0,
      countryTrend: countryTrendByProduct[row.product] || 1
    };
    acc[row.product].accounts.add(row.account_id);
    acc[row.product].actual += row.sales_actual;
    acc[row.product].plan += row.sales_target;
    acc[row.product].volume += row.volume_actual;
    acc[row.product].gp += row.gross_profit;
    acc[row.product].ly += row.sales_actual / (lyFactors[row.product] || 1);
    return acc;
  }, {}));

  return grouped.map((item) => ({
    ...item,
    accountCount: item.accounts.size,
    vsPlan: item.plan ? item.actual / item.plan : 0,
    vsLy: item.ly ? item.actual / item.ly : 0,
    marketGap: (item.ly ? item.actual / item.ly : 0) - item.countryTrend
  }));
}

function productSignalPanel(title, products, mode) {
  const fallback = mode === "decline" ? "No declining products in current scope." : "No increasing products in current scope.";
  return `
    <div class="mini-panel product-signal-panel">
      <h3>${title}</h3>
      <table class="mini-table micro">
        <thead><tr><th>Product</th><th>Sales</th><th>% Plan</th><th>% LY</th><th>Action</th></tr></thead>
        <tbody>
          ${products.slice(0, 5).map((item) => `
            <tr>
              <td data-label="Product"><strong>${item.product}</strong><small>${item.crop} · ${item.accountCount} accounts</small></td>
              <td data-label="Sales">${formatMoney(item.actual)}</td>
              <td data-label="% Plan" class="${item.vsPlan >= 1 ? "pos" : "neg"}">${pct(item.vsPlan)}</td>
              <td data-label="% LY" class="${item.vsLy >= 1 ? "pos" : "neg"}">${pct(item.vsLy)}</td>
              <td data-label="Action">${mode === "decline" ? "Prepare recovery ask and stock check" : "Protect margin and secure upside"}</td>
            </tr>
          `).join("") || `<tr><td colspan="5">${fallback}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function countryBenchmarkPanel(products) {
  return `
    <div class="mini-panel product-signal-panel">
      <h3>Product trend vs Germany</h3>
      <table class="mini-table micro">
        <thead><tr><th>Product</th><th>Account trend</th><th>Germany trend</th><th>Gap</th><th>Prep note</th></tr></thead>
        <tbody>
          ${products.sort((a, b) => a.marketGap - b.marketGap).map((item) => `
            <tr>
              <td data-label="Product"><strong>${item.product}</strong><small>${item.crop}</small></td>
              <td data-label="Account trend" class="${item.vsLy >= 1 ? "pos" : "neg"}">${pct(item.vsLy)}</td>
              <td data-label="Germany trend" class="${item.countryTrend >= 1 ? "pos" : "neg"}">${pct(item.countryTrend)}</td>
              <td data-label="Gap" class="${item.marketGap >= 0 ? "pos" : "neg"}">${item.marketGap >= 0 ? "+" : ""}${pct(item.marketGap)}</td>
              <td data-label="Prep note">${item.marketGap < -0.05 ? "Underperforming country trend; ask why in meeting" : "Trend in line or ahead; defend position"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function accountHeatMapPanel(rows) {
  const healthRows = scoped("account_health", rows);
  const weatherAlerts = scoped("weather_alerts", rows);
  const accounts = Array.from(accountIdsInScope(rows)).map((id) => {
    const account = byId(id);
    const accountRows = rows.filter((row) => row.account_id === id);
    const sales = accountRows.reduce((sum, row) => sum + row.sales_actual, 0);
    const target = accountRows.reduce((sum, row) => sum + row.sales_target, 0);
    const health = healthRows.find((item) => item.account_id === id);
    const weather = weatherAlerts.find((item) => item.account_id === id);
    return { account, sales, target, health, weather };
  }).filter((item) => item.account).sort((a, b) => (a.health?.health_score || 100) - (b.health?.health_score || 100)).slice(0, 8);

  return `
    <div class="mini-panel heat-map-panel">
      <div class="panel-title-row">
        <h3>Account heat map</h3>
        <span>${accounts.filter((item) => ["Critical", "At risk"].includes(item.health?.health_status)).length} risk</span>
      </div>
      <div class="heat-map-grid">
        ${accounts.map((item) => {
          const attainment = item.target ? item.sales / item.target : 0;
          const status = item.health?.health_status || "Watch";
          return `
            <button class="heat-cell clickable ${healthClass(status)}" data-account="${item.account.account_id}">
              <strong>${item.account.customer}</strong>
              <small>${item.account.territory}</small>
              <div>
                <span>${pct(attainment)}</span>
                <em>${status}</em>
              </div>
              <p>${item.weather?.weather_event || item.health?.next_best_action || "No active signal"}</p>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function weatherDrivenAlertsPanel(rows) {
  const alerts = scoped("weather_alerts", rows)
    .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.risk_level] ?? 3) - ({ High: 0, Medium: 1, Low: 2 }[b.risk_level] ?? 3))
    .slice(0, 5);

  return `
    <div class="mini-panel weather-alert-panel">
      <div class="panel-title-row">
        <h3>Weather-driven alerts</h3>
        <span>${alerts.filter((item) => item.risk_level === "High").length} high</span>
      </div>
      <div class="weather-alert-list">
        ${alerts.map((item) => {
          const account = byId(item.account_id);
          return `
            <button class="weather-alert-row clickable" data-account="${item.account_id}">
              <span class="health-badge ${severityClass(item.risk_level)}">${item.risk_level}</span>
              <div>
                <strong>${account.customer}</strong>
                <small>${item.territory} · ${item.crop} · ${item.expected_window}</small>
                <p>${item.weather_event}</p>
                <em>${item.product_recommendation}: ${item.recommended_action}</em>
              </div>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function sellInSellOutPanel(rows) {
  const data = Object.values(scoped("sell_out", rows).reduce((acc, row) => {
    acc[row.product] ??= {
      product: row.product,
      crop: row.crop,
      sellIn: 0,
      sellOut: 0,
      stock: 0,
      cover: 0,
      count: 0,
      trend: row.sell_out_trend,
      latest: row.last_submission_date
    };
    acc[row.product].sellIn += row.sell_in_value;
    acc[row.product].sellOut += row.sell_out_value;
    acc[row.product].stock += row.channel_stock_units;
    acc[row.product].cover += row.weeks_of_cover;
    acc[row.product].count += 1;
    acc[row.product].latest = row.last_submission_date > acc[row.product].latest ? row.last_submission_date : acc[row.product].latest;
    if (row.sell_out_trend === "Declining") acc[row.product].trend = "Declining";
    return acc;
  }, {})).sort((a, b) => b.sellIn - a.sellIn).slice(0, 5);

  return `
    <div class="mini-panel product-signal-panel">
      <h3>Sell-in / sell-out</h3>
      <table class="mini-table micro">
        <thead><tr><th>Product</th><th>Sell-in</th><th>Sell-out</th><th>Ratio</th><th>Stock</th></tr></thead>
        <tbody>
          ${data.map((item) => {
            const ratio = item.sellIn ? item.sellOut / item.sellIn : 0;
            return `
              <tr>
                <td><strong>${item.product}</strong><small>${item.crop} · ${item.trend} · ${item.latest}</small></td>
                <td>${formatMoney(item.sellIn)}</td>
                <td>${formatMoney(item.sellOut)}</td>
                <td class="${ratio >= 0.9 ? "pos" : "neg"}">${pct(ratio)}</td>
                <td>${formatNumber(item.stock)}<small>${Math.round(item.cover / item.count)} wks cover</small></td>
              </tr>
            `;
          }).join("") || `<tr><td colspan="5">No sell-out rows in current scope.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function rebateTierPanel(rows) {
  const tiers = scoped("rebate_tiers", rows)
    .sort((a, b) => a.gap_to_next_tier - b.gap_to_next_tier)
    .slice(0, 5);

  return `
    <div class="mini-panel product-signal-panel rebate-panel">
      <h3>Rebate tier tracker</h3>
      <div class="rebate-list">
        ${tiers.map((item) => {
          const account = byId(item.account_id);
          const progress = item.next_tier_threshold ? Math.min(item.year_to_date_sales / item.next_tier_threshold, 1) : 0;
          return `
            <button class="rebate-row clickable" data-account="${item.account_id}">
              <div>
                <strong>${account.customer}</strong>
                <small>${item.current_tier} ${item.current_rebate_pct}% to ${item.next_tier} ${item.next_rebate_pct}%</small>
              </div>
              <div class="rebate-progress"><span style="width:${Math.round(progress * 100)}%"></span></div>
              <p><b>${formatMoney(item.gap_to_next_tier)}</b> gap · ${formatMoney(item.expected_incremental_rebate)} incremental rebate</p>
              <em>${item.recommended_offer}</em>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function nextBestActionPanel(rows) {
  const actions = scoped("next_best_actions", rows)
    .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] ?? 3) - ({ High: 0, Medium: 1, Low: 2 }[b.priority] ?? 3))
    .slice(0, 5);

  return `
    <div class="mini-panel product-signal-panel next-action-panel">
      <h3>Next Best Action Engine</h3>
      <div class="next-action-list">
        ${actions.map((item) => {
          const account = byId(item.account_id);
          return `
            <button class="next-action-row clickable" data-account="${item.account_id}">
              <span class="health-badge ${severityClass(item.priority)}">${item.priority}</span>
              <div>
                <strong>${account.customer}</strong>
                <small>${item.trigger} · ${item.owner} · ${item.due_date}</small>
                <p>${item.next_best_action}</p>
                <em>${formatMoney(item.commercial_impact)} impact · ${item.status}</em>
              </div>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function dataFreshnessPanel(rows) {
  const freshness = scoped("data_freshness", rows);
  const statusCounts = freshness.reduce((acc, row) => {
    acc[row.freshness_status] = (acc[row.freshness_status] || 0) + 1;
    return acc;
  }, {});
  const rowsToShow = freshness
    .sort((a, b) => b.latency_hours - a.latency_hours)
    .slice(0, 6);

  return `
    <div class="mini-panel product-signal-panel freshness-panel">
      <div class="panel-title-row">
        <h3>Data freshness</h3>
        <span>${statusCounts.Stale || 0} stale</span>
      </div>
      <div class="freshness-summary">
        ${["Fresh", "Watch", "Stale"].map((status) => `<div><strong>${statusCounts[status] || 0}</strong><span>${status}</span></div>`).join("")}
      </div>
      <table class="mini-table micro">
        <tbody>
          ${rowsToShow.map((item) => `
            <tr class="clickable" data-account="${item.account_id}">
              <td><strong>${byId(item.account_id).customer}</strong><small>${item.data_domain} · ${item.source_system}</small></td>
              <td><span class="health-badge ${severityClass(item.freshness_status)}">${item.freshness_status}</span><small>${item.latency_hours}h</small></td>
              <td>${item.recommended_fix}<small>${item.owner}</small></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function customerPrepSummaryPanel(rows) {
  const sellOut = scoped("sell_out", rows);
  const freshness = scoped("data_freshness", rows);
  const actions = scoped("next_best_actions", rows);
  const sellInValue = sellOut.reduce((sum, row) => sum + row.sell_in_value, 0);
  const sellOutValue = sellOut.reduce((sum, row) => sum + row.sell_out_value, 0);
  const staleCount = freshness.filter((row) => row.freshness_status === "Stale").length;
  const highActions = actions.filter((row) => row.priority === "High").length;

  return `
    <div class="mini-panel prep-summary-panel">
      <h3>Customer prep brief</h3>
      <div class="prep-summary-grid">
        <div><span>Sell-out ratio</span><strong>${pct(sellInValue ? sellOutValue / sellInValue : 0)}</strong><small>${formatMoney(sellOutValue)} sell-out</small></div>
        <div><span>Open NBA</span><strong>${actions.length}</strong><small>${highActions} high priority</small></div>
        <div><span>Data issues</span><strong>${staleCount}</strong><small>stale customer feeds</small></div>
      </div>
      <div class="prep-summary-note">
        <strong>Meeting focus</strong>
        <p>Validate sell-out movement, ask for missing customer data, close rebate tier gaps, and agree the next best action before leaving the account meeting.</p>
      </div>
    </div>
  `;
}

function renderCustomer360Page(rows) {
  const accounts = Array.from(accountIdsInScope(rows)).map(byId).filter(Boolean);
  return `
    <div class="page-head">
      <div><h2>MCD Customer view</h2><p>Customer 360 view combining performance, credit, health, stock, interactions, and opportunities.</p></div>
      <button class="btn" data-action="export">Export customers</button>
    </div>
    <div class="customer-grid">
      ${accounts.map((account) => {
        const perf = rows.filter((row) => row.account_id === account.account_id);
        const sales = perf.reduce((sum, row) => sum + row.sales_actual, 0);
        const target = perf.reduce((sum, row) => sum + row.sales_target, 0);
        const inv = state.data.inventory.find((item) => item.account_id === account.account_id);
        return `
          <button class="customer-card clickable" data-account="${account.account_id}">
            <span class="mini-status ${varianceClass(target ? sales / target : 0)}">${pct(target ? sales / target : 0)} target</span>
            <h3>${account.customer}</h3>
            <p>${account.region} / ${account.territory} · ${account.sales_rep}</p>
            <div><strong>${formatMoney(sales)}</strong><span>Health ${account.health_score}</span><span>${inv?.stock_status || "No stock"}</span></div>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderMarketMapPage(rows) {
  const territories = marketTerritoryRows(rows);
  const highRisk = territories.filter((item) => item.risk === "High").length;
  const weatherRows = scoped("weather_alerts", rows)
    .sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.risk_level] ?? 3) - ({ High: 0, Medium: 1, Low: 2 }[b.risk_level] ?? 3));
  return `
    <div class="page-head">
      <div><h2>Market Map</h2><p>Germany territory view with customer location, weather pressure, account risk, and near-term commercial actions.</p></div>
      <button class="btn" data-action="export">Export map data</button>
    </div>
    <div class="map-kpi-row">
      <div><span>Territories</span><strong>${territories.length}</strong></div>
      <div><span>High weather risk</span><strong>${highRisk}</strong></div>
      <div><span>Sales in scope</span><strong>${formatMoney(territories.reduce((sum, item) => sum + item.sales, 0))}</strong></div>
      <div><span>Avg. attainment</span><strong>${pct(avg(territories.map((item) => item.attainment)))}</strong></div>
    </div>
    <div class="market-map-layout">
      <section class="market-map-card">
        <div class="map-toolbar">
          <div><strong>Germany field view</strong><span>Pin size = sales value, color = current risk</span></div>
          <div class="map-legend">
            <span><i class="risk-dot bad"></i>High</span>
            <span><i class="risk-dot warn"></i>Medium</span>
            <span><i class="risk-dot good"></i>Low</span>
          </div>
        </div>
        <div class="germany-map" aria-label="Mock Germany territory map">
          <div class="map-region north">North</div>
          <div class="map-region west">West</div>
          <div class="map-region east">East</div>
          <div class="map-region central">Central</div>
          <div class="map-region south">South</div>
          ${territories.map((item) => mapAccountPin(item)).join("")}
        </div>
      </section>
      <aside class="map-side-panel">
        <div class="mini-panel">
          <div class="panel-title-row"><h3>Weather pressure</h3><span>${weatherRows.filter((item) => item.risk_level === "High").length} high</span></div>
          <div class="market-alert-list">
            ${weatherRows.slice(0, 5).map((item) => {
              const account = byId(item.account_id);
              return `
                <button class="market-alert-item clickable" data-account="${item.account_id}">
                  <span class="health-badge ${severityClass(item.risk_level)}">${item.risk_level}</span>
                  <div>
                    <strong>${account.customer}</strong>
                    <small>${item.territory} · ${item.crop}</small>
                    <p>${item.weather_event}</p>
                  </div>
                </button>
              `;
            }).join("")}
          </div>
        </div>
        <div class="mini-panel">
          <h3>Map actions</h3>
          <div class="map-action-list">
            ${territories.slice(0, 5).map((item) => `
              <button class="map-action-item clickable" data-account="${item.account.account_id}">
                <strong>${item.account.territory}</strong>
                <span>${item.nextAction}</span>
                <small>${item.account.customer}</small>
              </button>
            `).join("")}
          </div>
        </div>
      </aside>
    </div>
    <div class="territory-grid">
      ${territories.map((item) => territoryCard(item)).join("")}
    </div>
  `;
}

function renderChangelogPage() {
  const changelogUrl = "https://raw.githubusercontent.com/kseyid-byte/CustomerDashboardMockup/main/CHANGELOG.md";
  return `
    <div class="page-head">
      <div><h2>Changes</h2><p>Simple changelog of dashboard updates.</p></div>
    </div>
    <div class="mini-panel" id="changelog-container">
      <ul class="change-log-list">
        <li><strong>2026-05-28</strong> - Added hover overlay expansion for the scenario table in the pre-meeting prep account overview matrix so large tables can be viewed without resizing the layout. <em>Requested by: Shantanu</em></li>
        <li><strong>2026-05-28</strong> - Added hover expansion behavior and horizontal scroll hint for all scrollable tables to improve readability of wide matrices. <em>Requested by: Shantanu</em></li>
        <li><strong>2026-05-27</strong> - Fixed mobile layout for pre-meeting prep product trend panels so table contents fit inside the card. <em>Requested by: Kerem Seyid</em></li>
        <li><strong>2026-05-27</strong> - Added mobile-friendly layout rules so dashboard pages stack cleanly on phone-width screens while preserving the desktop mockup. <em>Requested by: Kerem Seyid</em></li>
        <li><strong>2026-05-26</strong> — Added deployment delay banner at top of dashboard. <em>Requested by: Kerem S</em></li>
        <li><strong>2026-05-26</strong> — Updated gross-to-net waterfall colors (gross: yellow, deductions/net: black). <em>Requested by: Kerem S</em></li>
        <li><strong>2026-05-26</strong> — Policy introduced: every change entry must include who requested it. <em>Requested by: Kerem S</em></li>
      </ul>
      <p class="changelog-rule"><strong>Rule:</strong> Every change logged must include the person who requested it.</p>
    </div>
    <script>
      (async function() {
        try {
          const res = await fetch("${changelogUrl}");
          if (!res.ok) return;
          const md = await res.text();
          const container = document.getElementById("changelog-container");
          if (!container) return;
          container.innerHTML = '<div class="change-log-md">' + md.split("\\n").filter(l => l.trim()).map(l => {
            if (l.startsWith("# ")) return '<h2>' + l.slice(2) + '</h2>';
            if (l.startsWith("## ")) return '<h3>' + l.slice(3) + '</h3>';
            if (l.startsWith("- ")) return '<p class="change-entry">' + l.slice(2) + '</p>';
            return '<p>' + l + '</p>';
          }).join("") + '</div>';
        } catch(e) {}
      })();
    </script>
  `;
}

function marketTerritoryRows(rows) {
  const scopedWeather = scoped("weather", rows);
  const scopedWeatherAlerts = scoped("weather_alerts", rows);
  const scopedHealth = scoped("account_health", rows);
  const scopedActions = scoped("next_best_actions", rows);
  const items = Array.from(accountIdsInScope(rows)).map((id) => {
    const account = byId(id);
    const accountRows = rows.filter((row) => row.account_id === id);
    const sales = accountRows.reduce((sum, row) => sum + row.sales_actual, 0);
    const target = accountRows.reduce((sum, row) => sum + row.sales_target, 0);
    const gp = accountRows.reduce((sum, row) => sum + row.gross_profit, 0);
    const weather = scopedWeather.find((item) => item.account_id === id);
    const weatherAlert = scopedWeatherAlerts.find((item) => item.account_id === id);
    const health = scopedHealth.find((item) => item.account_id === id);
    const nba = scopedActions.find((item) => item.account_id === id);
    const risk = weatherAlert?.risk_level || weather?.signal_strength || health?.priority || "Low";
    return {
      account,
      sales,
      target,
      gp,
      attainment: target ? sales / target : 0,
      margin: sales ? gp / sales : 0,
      weather,
      weatherAlert,
      health,
      risk,
      nextAction: nba?.next_best_action || weatherAlert?.recommended_action || health?.next_best_action || "Monitor account"
    };
  }).filter((item) => item.account);
  const maxSales = Math.max(...items.map((item) => item.sales), 1);
  return items.map((item) => ({
    ...item,
    size: 34 + Math.round((item.sales / maxSales) * 30)
  })).sort((a, b) => {
    const riskOrder = { High: 0, Critical: 0, Medium: 1, Watch: 1, Low: 2 };
    return (riskOrder[a.risk] ?? 3) - (riskOrder[b.risk] ?? 3) || b.sales - a.sales;
  });
}

function mapAccountPin(item) {
  const position = projectGermanyPoint(item.account.lat, item.account.lon);
  return `
    <button class="map-account-pin clickable ${severityClass(item.risk)}" style="left:${position.x}%;top:${position.y}%;width:${item.size}px;height:${item.size}px;" data-account="${item.account.account_id}" title="${item.account.customer}">
      <span>${item.account.territory.split(/[ -]/).map((word) => word[0]).join("").slice(0, 3)}</span>
      <strong>${formatMoney(item.sales)}</strong>
    </button>
  `;
}

function projectGermanyPoint(lat, lon) {
  const minLat = 47.2;
  const maxLat = 55.1;
  const minLon = 5.7;
  const maxLon = 15.2;
  return {
    x: 16 + ((lon - minLon) / (maxLon - minLon)) * 68,
    y: 9 + (1 - ((lat - minLat) / (maxLat - minLat))) * 80
  };
}

function territoryCard(item) {
  return `
    <button class="territory-card clickable" data-account="${item.account.account_id}">
      <div class="territory-card-head">
        <div><strong>${item.account.territory}</strong><span>${item.account.customer}</span></div>
        <span class="health-badge ${severityClass(item.risk)}">${item.risk}</span>
      </div>
      <div class="territory-metrics">
        <div><span>Sales</span><strong>${formatMoney(item.sales)}</strong></div>
        <div><span>Plan</span><strong>${pct(item.attainment)}</strong></div>
        <div><span>GP margin</span><strong>${pct(item.margin)}</strong></div>
      </div>
      <p>${item.weatherAlert?.weather_event || item.weather?.risk_signal || "No weather pressure"}</p>
      <em>${item.nextAction}</em>
    </button>
  `;
}

function avg(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function renderDataInputPage(rows) {
  return `
    <div class="page-head">
      <div><h2>Customer data input</h2><p>Capture sell-out, stock, and product feedback directly into the mock data workflow.</p></div>
      <button class="btn primary" data-action="feedback">Submit feedback</button>
    </div>
    <div class="data-input-grid">
      <div class="mini-panel">
        <h3>Feedback queue</h3>
        <table class="mini-table micro">
          <tbody>${state.data.feedback.map((item) => `<tr class="clickable" data-account="${item.account_id}"><td>${item.date}</td><td>${byId(item.account_id).customer}</td><td>${item.topic}</td><td>${item.status}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="mini-panel">
        <h3>Stock submission status</h3>
        <table class="mini-table micro">
          <tbody>${scoped("inventory", rows).map((item) => `<tr class="clickable" data-account="${item.account_id}"><td>${byId(item.account_id).customer}</td><td>${item.product}</td><td>${item.stock_units} units</td><td>${item.last_stock_update}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
}

function miniPerformanceTable(rows) {
  return `
    <table class="mini-table">
      <thead><tr><th>Type</th><th>Target</th><th>Sales</th><th>Δ</th><th>Vol.</th><th>Margin</th><th>Credit</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.slice(0, 6).map((row) => {
          const attainment = row.sales_target ? row.sales_actual / row.sales_target : 0;
          return `
            <tr class="clickable" data-account="${row.account_id}">
              <td>${row.product}</td>
              <td>${formatMoney(row.sales_target)}</td>
              <td>${formatMoney(row.sales_actual)}</td>
              <td class="${attainment >= 1 ? "pos" : "neg"}">${pct(attainment - 1)}</td>
              <td>${row.volume_actual}</td>
              <td>${pct(row.margin_actual)}</td>
              <td>${pct(row.account.credit_used / row.account.credit_limit)}</td>
              <td><span class="mini-status ${varianceClass(attainment)}">${attainment >= 1 ? "On plan" : "Gap"}</span></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function miniWeather(rows) {
  const weather = scoped("weather", rows)[0];
  if (!weather) return "";
  return `
    <div class="rail-card weather-card">
      <div class="rail-title">Weather & external signals <button>View details</button></div>
      <div class="weather-icon">☔</div>
      <strong>${weather.condition}, ${weather.temp_c}°C</strong>
      <p>${weather.risk_signal}</p>
    </div>
  `;
}

function miniAlerts(rows) {
  const alerts = scoped("alerts", rows).slice(0, 5);
  return `
    <div class="rail-card">
      <div class="rail-title">Alerts <button>View all</button></div>
      ${alerts.map((alert) => `
        <div class="mini-alert">
          <span class="${severityClass(alert.severity)}"></span>
          <div><strong>${alert.category}</strong><p>${alert.recommended_action}</p></div>
        </div>
      `).join("")}
    </div>
  `;
}

function miniWaterfall(rows) {
  const source = scoped("waterfall", rows);
  const totals = source.reduce((acc, row) => {
    acc.gross_sales += row.gross_sales;
    acc.invoice_discount += row.invoice_discount;
    acc.rebates += row.rebates;
    acc.promo_support += row.promo_support;
    acc.returns_logistics += row.returns_logistics;
    acc.net_sales += row.net_sales;
    acc.cogs += row.cogs;
    acc.gross_profit += row.gross_profit;
    return acc;
  }, {
    gross_sales: 0,
    invoice_discount: 0,
    rebates: 0,
    promo_support: 0,
    returns_logistics: 0,
    net_sales: 0,
    cogs: 0,
    gross_profit: 0
  });
  const steps = [
    { label: "Gross sales", value: totals.gross_sales, type: "total", start: 0, end: totals.gross_sales },
    { label: "Invoice disc.", value: totals.invoice_discount, type: "deduction" },
    { label: "Rebates", value: totals.rebates, type: "deduction" },
    { label: "Promo support", value: totals.promo_support, type: "deduction" },
    { label: "Returns/log.", value: totals.returns_logistics, type: "deduction" },
    { label: "Net sales", value: totals.net_sales, type: "total", start: 0, end: totals.net_sales },
    { label: "COGS", value: totals.cogs, type: "deduction" },
    { label: "Gross profit", value: totals.gross_profit, type: "total", start: 0, end: totals.gross_profit }
  ].map((step, index, all) => {
    if (step.type === "deduction") {
      const previous = all[index - 1].end;
      step.start = previous;
      step.end = previous + step.value;
    }
    return step;
  });
  const maxValue = Math.max(totals.gross_sales, 1);
  const toY = (value) => 16 + (1 - value / maxValue) * 126;
  const barWidth = 48;
  const gap = 18;
  const chartWidth = steps.length * barWidth + (steps.length - 1) * gap;
  return `
    <div class="mini-panel">
      <h3>Gross-to-net waterfall</h3>
      <svg class="waterfall-svg" viewBox="0 0 ${chartWidth} 178" role="img" aria-label="Gross to net waterfall from sales through deductions to gross profit">
        <line class="wf-grid" x1="0" y1="${toY(maxValue)}" x2="${chartWidth}" y2="${toY(maxValue)}"></line>
        ${steps.map((step, index) => {
          const x = index * (barWidth + gap);
          const y1 = toY(step.start);
          const y2 = toY(step.end);
          const top = Math.min(y1, y2);
          const height = Math.max(2, Math.abs(y2 - y1));
          const labelY = step.type === "deduction" ? top - 5 : top - 6;
          const connectorY = y2;
          const nextX = x + barWidth + gap;
          return `
            <g>
              <rect class="wf-rect ${step.type}" x="${x}" y="${top}" width="${barWidth}" height="${height}" rx="3"></rect>
              ${index < steps.length - 1 ? `<line class="wf-connector" x1="${x + barWidth}" y1="${connectorY}" x2="${nextX}" y2="${connectorY}"></line>` : ""}
              <text class="wf-amount" x="${x + barWidth / 2}" y="${Math.max(10, labelY)}" text-anchor="middle">${step.value < 0 ? "-" : ""}${formatMoney(Math.abs(step.value)).replace("€", "€ ")}</text>
              <text class="wf-label" x="${x + barWidth / 2}" y="166" text-anchor="middle">${step.label}</text>
            </g>
          `;
        }).join("")}
      </svg>
    </div>
  `;
}

function miniOpportunity(rows) {
  const opportunities = scoped("opportunities", rows).slice(0, 4);
  return `
    <div class="mini-panel">
      <h3>Opportunity</h3>
      <table class="mini-table micro">
        <tbody>${opportunities.map((item) => `<tr class="clickable" data-account="${item.account_id}"><td>${item.title}</td><td>${formatMoney(item.expected_value)}</td><td>${pct(item.probability)}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function miniAccountHealth(rows) {
  const healthRows = scoped("account_health", rows)
    .sort((a, b) => {
      const priorityOrder = { High: 0, Medium: 1, Low: 2 };
      return (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9) || a.health_score - b.health_score;
    })
    .slice(0, 5);

  return `
    <div class="mini-panel account-health-panel">
      <div class="panel-title-row">
        <h3>Account health & KAM actions</h3>
        <span>${healthRows.filter((row) => ["Critical", "At risk"].includes(row.health_status)).length} need attention</span>
      </div>
      <table class="mini-table micro account-health-table">
        <thead>
          <tr><th>Account</th><th>Status</th><th>Rep action</th><th>Recommended manager action</th><th>Due</th></tr>
        </thead>
        <tbody>
          ${healthRows.map((item) => {
            const account = byId(item.account_id);
            return `
              <tr class="clickable" data-account="${item.account_id}">
                <td><strong>${account.customer}</strong><small>${account.territory}</small></td>
                <td><span class="health-badge ${healthClass(item.health_status)}">${item.health_status}</span><small>${item.health_score}</small></td>
                <td>${item.rep_action_status}<small>${item.next_best_action}</small></td>
                <td>${item.manager_recommendation}<small>${item.owner_role}</small></td>
                <td>${item.due_date}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function healthClass(status) {
  if (status === "Critical") return "bad";
  if (status === "At risk" || status === "Watch") return "warn";
  return "good";
}

function miniInteractions(rows) {
  const interactions = scoped("interactions", rows).slice(0, 4);
  return `
    <div class="mini-panel">
      <h3>Interaction and health</h3>
      <table class="mini-table micro">
        <tbody>${interactions.map((item) => `<tr class="clickable" data-account="${item.account_id}"><td>${byId(item.account_id).customer}</td><td>${item.type}</td><td>${item.outcome}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function miniOrders(rows) {
  const orders = scoped("orders", rows).slice(0, 4);
  return `
    <div class="mini-panel">
      <h3>Open orders</h3>
      <table class="mini-table micro">
        <tbody>${orders.map((item) => `<tr class="clickable" data-account="${item.account_id}"><td>${item.order_id}</td><td>${item.status}</td><td>${formatMoney(item.value)}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderFeatureList() {
  const features = [
    ["Standard cockpit", "Display core metrics per product, customer, crop, and territory; including sales, volume, gross profit, open orders, inventory, and credit limit, with flexible filtering and role-based scope"],
    ["Performance", "Compare actuals against scenario-based targets and prior year, including gross-to-net waterfall breaking down each layer from gross sales to gross profit"],
    ["Opportunities", "Surface gap-to-next-rebate-tier scenarios per customer and product, deltas to plan on crop level with expected landing and risk status, and system-generated opportunities based on Customer 360 and Market Map"],
    ["Interaction & health", "Track visit frequency & open commitments. Build composite health score per account based on revenue vs. plan, volume trend, product listing breadth, and stock rotation. Surface open actions with due dates and status"],
    ["Weather & external signals", "Surface weather events, as contextual overlay"],
    ["Smart alerts", "Trigger alerts on gaps to target, stock buildups, customer deviations, weather/market events, health score deterioration, and commitment overdue. Generate actionable proposals that feed directly into weekly planner and pre-meeting preparation"],
    ["Customer data input", "Allow customers or KAM to submit sell-out data, stock levels, and mid-season product feedback directly into the dashboard"]
  ];

  return `
    <div class="features-head"><h2>Main features</h2></div>
    <ol class="feature-list">
      ${features.map(([title, body], index) => `
        <li>
          <span>${index + 1}</span>
          <p><strong>${title}:</strong> ${body}</p>
        </li>
      `).join("")}
    </ol>
  `;
}

function renderFilters() {
  const rows = joinedPerformance();
  const accountRows = state.data.accounts;
  const filters = [
    ["period", "Period", optionValues("period", rows)],
    ["season", "Season", optionValues("season", rows)],
    ["region", "Region", optionValues("region", accountRows)],
    ["territory", "Territory", optionValues("territory", accountRows)],
    ["sales_rep", "Sales Rep", optionValues("sales_rep", accountRows)],
    ["customer", "Customer", optionValues("customer", accountRows)],
    ["crop", "Crop", optionValues("crop", rows)],
    ["product", "Product", optionValues("product", rows)],
    ["channel", "Channel", optionValues("channel", accountRows)]
  ];

  return `
    <section class="filters">
      ${filters.map(([key, label, options]) => `
        <div class="filter">
          <label for="${key}">${label}</label>
          <select id="${key}" data-filter="${key}">
            ${options.map((option) => `<option value="${option}" ${state.filters[key] === option ? "selected" : ""}>${option}</option>`).join("")}
          </select>
        </div>
      `).join("")}
      <div class="filter">
        <label for="search">Search</label>
        <input id="search" data-filter="search" value="${state.filters.search}" placeholder="Customer, crop, product" />
      </div>
    </section>
  `;
}

function renderMetrics(metrics) {
  const attainment = metrics.target ? metrics.actual / metrics.target : 0;
  return `
    <section class="metrics">
      <div class="metric"><span>Sales vs target</span><strong>${pct(attainment)}</strong><small>${formatMoney(metrics.actual)} / ${formatMoney(metrics.target)}</small></div>
      <div class="metric"><span>Volume</span><strong>${formatNumber(metrics.volume)}</strong><small>units sold in scope</small></div>
      <div class="metric"><span>Gross profit</span><strong>${formatMoney(metrics.grossProfit)}</strong><small>${pct(metrics.marginActual)} margin</small></div>
      <div class="metric"><span>Open orders</span><strong>${formatMoney(metrics.openOrderValue)}</strong><small>open and backorder value</small></div>
      <div class="metric"><span>Inventory risk</span><strong>${metrics.inventoryRisk}</strong><small>low or critical stock items</small></div>
      <div class="metric"><span>Smart alerts</span><strong>${metrics.alerts}</strong><small>open recommended actions</small></div>
    </section>
  `;
}

function renderView(rows, metrics) {
  const viewMap = {
    Cockpit: () => renderCockpit(rows, metrics),
    Performance: () => renderPerformance(rows),
    Orders: () => renderOrders(rows),
    Opportunities: () => renderOpportunities(rows),
    Interactions: () => renderInteractions(rows),
    Weather: () => renderWeather(rows),
    "Data Products": () => renderDataProducts()
  };
  return viewMap[state.activeView]();
}

function renderCockpit(rows) {
  return `
    <section class="grid">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>Account Performance</h3>
            <p>Click any account to inspect orders, stock, weather, opportunities, and activity.</p>
          </div>
          <span class="pill info">${rows.length} rows</span>
        </div>
        <div class="table-wrap">${performanceTable(rows)}</div>
      </div>
      <div class="side-stack">
        ${targetBreakdown(rows)}
        ${alertsPanel(rows)}
        ${weatherPanel(rows)}
      </div>
    </section>
  `;
}

function performanceTable(rows) {
  return `
    <table>
      <thead><tr><th>Customer</th><th>Rep</th><th>Product</th><th>Crop</th><th>Sales</th><th>Target</th><th>Attain.</th><th>Margin</th><th>Health</th></tr></thead>
      <tbody>
        ${rows.map((row) => {
          const attainment = row.sales_target ? row.sales_actual / row.sales_target : 0;
          return `
            <tr class="clickable" data-account="${row.account_id}">
              <td>${row.account.customer}</td>
              <td>${row.account.sales_rep}</td>
              <td>${row.product}</td>
              <td>${row.crop}</td>
              <td>${formatMoney(row.sales_actual)}</td>
              <td>${formatMoney(row.sales_target)}</td>
              <td><span class="pill ${varianceClass(attainment)}">${pct(attainment)}</span></td>
              <td>${pct(row.margin_actual)}</td>
              <td>${row.account.health_score}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function targetBreakdown(rows) {
  const byCrop = Object.values(rows.reduce((acc, row) => {
    acc[row.crop] ??= { crop: row.crop, actual: 0, target: 0 };
    acc[row.crop].actual += row.sales_actual;
    acc[row.crop].target += row.sales_target;
    return acc;
  }, {})).sort((a, b) => b.actual - a.actual);

  return `
    <div class="panel">
      <div class="panel-header"><div><h3>Crop Target Tracking</h3><p>Actual against scenario target</p></div></div>
      <div class="panel-body bars">
        ${byCrop.map((row) => {
          const value = row.target ? Math.min(row.actual / row.target, 1.25) : 0;
          return `
            <div class="bar-row">
              <span>${row.crop}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(value * 80)}%"></div></div>
              <strong>${pct(row.target ? row.actual / row.target : 0)}</strong>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function alertsPanel(rows) {
  const alerts = scoped("alerts", rows).slice(0, 6);
  return `
    <div class="panel">
      <div class="panel-header"><div><h3>Smart Alerts</h3><p>Gaps, stock, weather, credit, and commitments</p></div></div>
      <div class="panel-body alert-list">
        ${alerts.map((alert) => {
          const account = byId(alert.account_id);
          return `
            <div class="item">
              <div class="item-top">
                <h4>${account.customer}</h4>
                <span class="pill ${severityClass(alert.severity)}">${alert.severity}</span>
              </div>
              <p>${alert.message}</p>
              <p><strong>${alert.recommended_action}</strong></p>
            </div>
          `;
        }).join("") || `<p class="eyebrow">No alerts in scope.</p>`}
      </div>
    </div>
  `;
}

function weatherPanel(rows) {
  const weather = scoped("weather", rows).slice(0, 4);
  return `
    <div class="panel">
      <div class="panel-header"><div><h3>Weather Signals</h3><p>External overlay for local sales action</p></div></div>
      <div class="panel-body weather-list">
        ${weather.map((item) => `
          <div class="item">
            <div class="item-top">
              <h4>${byId(item.account_id).territory}</h4>
              <span class="pill ${severityClass(item.signal_strength)}">${item.condition} ${item.temp_c}C</span>
            </div>
            <p>${item.risk_signal}</p>
            <p>${item.rain_mm_7d} mm rain in last 7 days</p>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderPerformance(rows) {
  return `
    <section class="panel">
      <div class="panel-header"><div><h3>Performance Waterfall</h3><p>Sales, volume, margin, gross profit, and net waterfall delta.</p></div></div>
      <div class="table-wrap">${performanceTable(rows)}</div>
    </section>
  `;
}

function renderOrders(rows) {
  const orders = scoped("orders", rows);
  return `
    <section class="panel">
      <div class="panel-header"><div><h3>Orders and Commitments</h3><p>Track open orders, backorders, due commitments, and status.</p></div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Status</th><th>Units</th><th>Value</th><th>Due</th><th>Commitment</th><th></th></tr></thead>
          <tbody>
            ${orders.map((order) => `
              <tr class="clickable" data-account="${order.account_id}">
                <td>${order.order_id}</td><td>${byId(order.account_id).customer}</td><td>${order.product}</td>
                <td><span class="pill ${severityClass(order.status)}">${order.status}</span></td>
                <td>${order.units}</td><td>${formatMoney(order.value)}</td><td>${order.commitment_due}</td>
                <td><span class="pill ${severityClass(order.commitment_status)}">${order.commitment_status}</span></td>
                <td><button class="btn" data-action="complete-commitment" data-order="${order.order_id}">Complete</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderOpportunities(rows) {
  const opportunities = scoped("opportunities", rows);
  return `
    <section class="panel">
      <div class="panel-header"><div><h3>Opportunities</h3><p>Cap-to-next-rebate scenarios and generated account opportunities.</p></div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Opportunity</th><th>Customer</th><th>Stage</th><th>Expected</th><th>Probability</th><th>Next step</th><th>Owner</th><th>Due</th></tr></thead>
          <tbody>
            ${opportunities.map((item) => `
              <tr class="clickable" data-account="${item.account_id}">
                <td>${item.title}</td><td>${byId(item.account_id).customer}</td><td><span class="pill info">${item.stage}</span></td>
                <td>${formatMoney(item.expected_value)}</td><td>${pct(item.probability)}</td><td>${item.next_step}</td><td>${item.owner}</td><td>${item.due_date}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderInteractions(rows) {
  const interactions = scoped("interactions", rows);
  return `
    <section class="grid">
      <div class="panel">
        <div class="panel-header"><div><h3>Interaction Health</h3><p>Visits, calls, open commitments, and account notes.</p></div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>Type</th><th>Owner</th><th>Summary</th><th>Outcome</th></tr></thead>
            <tbody>
              ${interactions.map((item) => `
                <tr class="clickable" data-account="${item.account_id}">
                  <td>${item.date}</td><td>${byId(item.account_id).customer}</td><td>${item.type}</td><td>${item.owner}</td><td>${item.summary}</td><td>${item.outcome}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><div><h3>Customer Feedback</h3><p>Direct input captured into the dashboard.</p></div><button class="btn primary" data-action="feedback">Submit</button></div>
        <div class="panel-body action-list">
          ${state.data.feedback.map((item) => `
            <div class="item">
              <div class="item-top"><h4>${byId(item.account_id).customer}</h4><span class="pill info">${item.status}</span></div>
              <p>${item.topic}: ${item.comment}</p>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderWeather(rows) {
  const weather = scoped("weather", rows);
  return `
    <section class="panel">
      <div class="panel-header"><div><h3>Weather and External Signals</h3><p>Territory-level conditions connected to product and customer action.</p></div></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Customer</th><th>Station</th><th>Condition</th><th>Temp</th><th>Rain 7d</th><th>Signal</th><th>Strength</th><th>Updated</th></tr></thead>
          <tbody>
            ${weather.map((item) => `
              <tr class="clickable" data-account="${item.account_id}">
                <td>${byId(item.account_id).customer}</td><td>${item.station}</td><td>${item.condition}</td><td>${item.temp_c}C</td>
                <td>${item.rain_mm_7d} mm</td><td>${item.risk_signal}</td><td><span class="pill ${severityClass(item.signal_strength)}">${item.signal_strength}</span></td><td>${item.updated_at}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDataProducts() {
  const adapter = futureDatabricksAdapter();
  const products = Object.entries(state.data).map(([name, rows]) => ({ name, rows: rows.length }));
  return `
    <section class="grid">
      <div class="panel">
        <div class="panel-header"><div><h3>Mock Data Products</h3><p>CSV-backed products emulating Databricks tables or views.</p></div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Rows</th><th>Current Source</th><th>Future Source</th></tr></thead>
            <tbody>
              ${products.map((product) => `
                <tr><td>${product.name}</td><td>${product.rows}</td><td>public/data/${product.name}.csv</td><td>Databricks governed table or SQL view</td></tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><div><h3>Databricks Integration Boundary</h3><p>Designed replacement point for production data.</p></div></div>
        <div class="panel-body action-list">
          <div class="item"><h4>Security</h4><p>${adapter.security}</p></div>
          <div class="item"><h4>Grain</h4><p>${adapter.grain}</p></div>
          <div class="item"><h4>Dimensions</h4><p>${adapter.dimensions.join(", ")}</p></div>
          <div class="item"><h4>Adapter</h4><p>${adapter.note}</p></div>
        </div>
      </div>
    </section>
  `;
}

function renderDrawer() {
  const account = state.selectedAccountId ? byId(state.selectedAccountId) : null;
  if (!account) return `<aside class="drawer" id="drawer"><div class="drawer-panel"></div></aside>`;

  const perf = state.data.performance.filter((row) => row.account_id === account.account_id);
  const inventory = state.data.inventory.filter((row) => row.account_id === account.account_id);
  const alerts = state.data.alerts.filter((row) => row.account_id === account.account_id);
  const weather = state.data.weather.find((row) => row.account_id === account.account_id);
  const orders = state.data.orders.filter((row) => row.account_id === account.account_id);
  const sales = perf.reduce((sum, row) => sum + row.sales_actual, 0);
  const target = perf.reduce((sum, row) => sum + row.sales_target, 0);

  return `
    <aside class="drawer open" id="drawer">
      <div class="drawer-panel">
        <div class="drawer-head">
          <div>
            <p class="eyebrow">${account.segment} ${account.channel}</p>
            <h3>${account.customer}</h3>
          </div>
          <button class="btn" data-action="close-drawer">Close</button>
        </div>
        <div class="drawer-content">
          <div class="detail-grid">
            <div class="detail-box"><span>Sales attainment</span><strong>${pct(target ? sales / target : 0)}</strong></div>
            <div class="detail-box"><span>Health score</span><strong>${account.health_score}</strong></div>
            <div class="detail-box"><span>Credit used</span><strong>${pct(account.credit_used / account.credit_limit)}</strong></div>
            <div class="detail-box"><span>Owner</span><strong>${account.sales_rep}</strong></div>
          </div>
          <div class="item"><h4>Weather signal</h4><p>${weather ? `${weather.risk_signal}. ${weather.condition}, ${weather.temp_c}C, ${weather.rain_mm_7d} mm rain.` : "No signal."}</p></div>
          <div class="item"><h4>Inventory</h4><p>${inventory.map((row) => `${row.product}: ${row.stock_units} units, ${row.stock_status}`).join(" | ")}</p></div>
          <div class="item"><h4>Orders</h4><p>${orders.map((row) => `${row.order_id}: ${row.status}, ${formatMoney(row.value)}, ${row.commitment_status}`).join(" | ")}</p></div>
          <div class="item"><h4>Alerts</h4><p>${alerts.map((row) => `${row.category}: ${row.recommended_action}`).join(" | ") || "No open alerts."}</p></div>
          <div class="form-actions">
            <button class="btn" data-action="feedback">Submit Feedback</button>
            <button class="btn primary" data-action="new-opportunity">Create Opportunity</button>
          </div>
        </div>
      </div>
    </aside>
  `;
}

function renderModal() {
  return `
    <dialog class="modal" id="action-modal">
      <form method="dialog" id="action-form">
        <h3 id="modal-title">Action</h3>
        <input type="hidden" id="modal-kind" />
        <div class="field">
          <label for="modal-account">Customer</label>
          <select id="modal-account">
            ${state.data.accounts.map((account) => `<option value="${account.account_id}" ${state.selectedAccountId === account.account_id ? "selected" : ""}>${account.customer}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="modal-topic">Topic</label>
          <input id="modal-topic" required />
        </div>
        <div class="field">
          <label for="modal-notes">Notes</label>
          <textarea id="modal-notes" required></textarea>
        </div>
        <div class="form-actions">
          <button class="btn" value="cancel">Cancel</button>
          <button class="btn primary" value="default">Save</button>
        </div>
      </form>
    </dialog>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePage = button.dataset.page;
      window.history.replaceState(null, "", `#${state.activePage}`);
      render();
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.view;
      render();
    });
  });

  document.querySelectorAll("[data-filter]").forEach((control) => {
    control.addEventListener("input", () => {
      state.filters[control.dataset.filter] = control.value;
      render();
    });
  });

  document.querySelectorAll("[data-month-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const month = button.dataset.monthToggle;
      state.expandedMonths = state.expandedMonths.includes(month)
        ? state.expandedMonths.filter((item) => item !== month)
        : [...state.expandedMonths, month];
      render();
    });
  });

  document.querySelectorAll("[data-account]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      state.selectedAccountId = row.dataset.account;
      render();
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const action = button.dataset.action;
      if (action === "export") exportFilteredCsv();
      if (action === "visit-plan") buildVisitPlan();
      if (action === "new-opportunity") openActionModal("New Opportunity", "opportunity");
      if (action === "feedback") openActionModal("Submit Customer Feedback", "feedback");
      if (action === "toggle-sidebar") {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        render();
      }
      if (action === "toggle-platform-sidebar") {
        state.platformSidebarCollapsed = !state.platformSidebarCollapsed;
        render();
      }
      if (action === "new-platform-chat") {
        state.platformView = "chat";
        state.platformChatMessages = [];
        state.selectedAccountId = null;
        render();
      }
      if (action === "open-customer-dashboard") {
        state.platformView = "dashboard";
        render();
      }
      if (action === "toggle-dashboard-chat") {
        state.dashboardChatOpen = !state.dashboardChatOpen;
        render();
      }
      if (action === "close-drawer") {
        state.selectedAccountId = null;
        render();
      }
      if (action === "complete-commitment") {
        event.stopPropagation();
        completeCommitment(button.dataset.order);
      }
    });
  });

  const form = document.querySelector("#action-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveModalAction();
  });

  const dashboardChatForm = document.querySelector("#dashboard-chat-form");
  if (dashboardChatForm) {
    dashboardChatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      sendDashboardChatMessage();
    });
  }

}

function sendDashboardChatMessage() {
  const input = document.querySelector("#dashboard-chat-input");
  const text = input?.value.trim();
  if (!text) return;
  state.dashboardChatMessages.push({ role: "user", text });
  state.dashboardChatMessages.push({ role: "bot", text: "typing..." });
  state.dashboardChatOpen = true;
  render();
}

function openActionModal(title, kind) {
  document.querySelector("#modal-title").textContent = title;
  document.querySelector("#modal-kind").value = kind;
  document.querySelector("#modal-topic").value = kind === "opportunity" ? "Account growth action" : "Customer feedback";
  document.querySelector("#modal-notes").value = "";
  document.querySelector("#action-modal").showModal();
}

function saveModalAction() {
  const kind = document.querySelector("#modal-kind").value;
  const accountId = document.querySelector("#modal-account").value;
  const topic = document.querySelector("#modal-topic").value;
  const notes = document.querySelector("#modal-notes").value;

  if (kind === "opportunity") {
    state.data.opportunities.unshift({
      opportunity_id: `P${Math.floor(Math.random() * 9000) + 1000}`,
      account_id: accountId,
      title: topic,
      stage: "Created",
      expected_value: 50000,
      probability: 0.35,
      next_step: notes,
      owner: byId(accountId).sales_rep,
      due_date: "2026-06-05"
    });
    state.activeView = "Opportunities";
  } else {
    state.data.feedback.unshift({
      feedback_id: `F${Math.floor(Math.random() * 9000) + 1000}`,
      account_id: accountId,
      date: "2026-05-22",
      submitted_by: byId(accountId).sales_rep,
      topic,
      comment: notes,
      status: "Open"
    });
    state.activeView = "Interactions";
  }

  document.querySelector("#action-modal").close();
  showToast("Saved to mock data for this session.");
  render();
}

function completeCommitment(orderId) {
  const order = state.data.orders.find((item) => item.order_id === orderId);
  if (order) order.commitment_status = "Completed";
  showToast(`${orderId} marked complete.`);
  render();
}

function buildVisitPlan() {
  state.activeView = "Interactions";
  const rows = filterRows();
  const risky = scoped("alerts", rows)
    .filter((alert) => ["High", "Medium"].includes(alert.severity))
    .map((alert) => byId(alert.account_id).customer);
  showToast(`Visit plan prioritized: ${Array.from(new Set(risky)).slice(0, 3).join(", ") || "no urgent accounts"}.`);
  render();
}

function exportFilteredCsv() {
  const rows = filterRows().map((row) => ({
    customer: row.account.customer,
    region: row.account.region,
    territory: row.account.territory,
    sales_rep: row.account.sales_rep,
    product: row.product,
    crop: row.crop,
    period: row.period,
    sales_actual: row.sales_actual,
    sales_target: row.sales_target,
    margin_actual: row.margin_actual
  }));
  const headers = Object.keys(rows[0] || { customer: "", region: "", territory: "", sales_rep: "", product: "", crop: "", period: "", sales_actual: "", sales_target: "", margin_actual: "" });
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "customer-dashboard-filtered.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Filtered CSV export prepared.");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

loadDataProducts()
  .then((data) => {
    state.data = data;
    state.activePage = pageFromHash() || state.activePage;
    render();
  })
  .catch((error) => {
    app.innerHTML = `<main class="main"><h2>Unable to load dashboard</h2><p>${error.message}</p></main>`;
  });

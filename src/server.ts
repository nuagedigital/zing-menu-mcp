// src/server.ts
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import express from "express"
import cors from "cors"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, "..")
const DATA_FILE = path.join(ROOT, "data", "toast-menu.json")

const PORT = Number(process.env.PORT || 3100)
const ORDER_WEBHOOK_URL = process.env.ORDER_WEBHOOK_URL || ""
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || ""

// ============================================================
// TYPES
// ============================================================
type MenuItem = {
  id: string
  name: string
  title: string
  price: number
  description: string
  image: string
  category: string
  location: string
  url: string
}

type MenuSnapshot = {
  items: MenuItem[]
  scrapedAt: string
}

type LocationGroup = {
  cats: string[]
  byCat: Record<string, MenuItem[]>
}

// Exact tab order from Toast
const TAB_ORDER = [
  "Burgers",
  "Wraps",
  "Bowls",
  "Sides",
  "Milkshakes",
  "Drinks",
  "Sauce",
  "Kids Menu",
  "Tender Only",
]

const LOCATION_LABELS: Record<string, string> = {
  fremont: "Zingsters - Fremont",
  palo_alto: "Zingsters - Palo Alto",
}

const LOCATION_ADDRESSES: Record<string, string> = {
  fremont: "4169 Cushing Parkway, Fremont, CA",
  palo_alto: "220B University Ave, Palo Alto, CA",
}

// ============================================================
// HELPERS
// ============================================================
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// ============================================================
// MENU LOADER
// ============================================================
function loadMenu(): MenuSnapshot {
  if (!fs.existsSync(DATA_FILE)) {
    console.warn(`[mcp] No scrape file at ${DATA_FILE}`)
    return { items: [], scrapedAt: "never" }
  }

  let raw: any
  try {
    raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"))
  } catch (err) {
    console.error("[mcp] Failed to parse toast-menu.json:", err)
    return { items: [], scrapedAt: "invalid" }
  }

  const items: MenuItem[] = []
  for (const [locKey, locData] of Object.entries<any>(raw.locations || {})) {
    for (const item of locData.items || []) {
      items.push({
        id: `${locKey}-${slug(item.name)}`,
        name: item.name,
        title: item.title || item.name,
        price: Number(item.price),
        description: item.description || "",
        image: item.image || "",
        category: item.category || "Menu",
        location: locKey,
        url: item.url || "",
      })
    }
  }

  return { items, scrapedAt: raw.scrapedAt || "unknown" }
}

// ============================================================
// MCP HELPERS
// ============================================================
function textResult(data: unknown, isError = false) {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  }
}

function findItems(query: string, all: MenuItem[]): MenuItem[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  const exact = all.filter((i) => i.name.toLowerCase() === q)
  if (exact.length) return exact
  const partial = all.filter((i) => i.name.toLowerCase().includes(q))
  if (partial.length) return partial
  const qToks = q.split(/\s+/)
  return all.filter((i) => {
    const name = i.name.toLowerCase()
    return qToks.some((t) => t.length > 2 && name.includes(t))
  })
}

// ============================================================
// MCP SERVER
// ============================================================
function createMcpServer() {
  const server = new Server(
    { name: "zing-menu-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_menu",
        description: "Get the full live menu scraped from Toast.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "get_menu_item",
        description: "Search for a menu item by name.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            location: { type: "string", enum: ["fremont", "palo_alto"] },
          },
          required: ["name"],
        },
      },
      {
        name: "get_locations",
        description: "Get restaurant addresses and phone numbers.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "get_hours",
        description: "Get opening hours.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
      {
        name: "place_order",
        description: "Submit a pickup order.",
        inputSchema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  quantity: { type: "integer", minimum: 1 },
                },
                required: ["name", "quantity"],
              },
            },
            location: { type: "string", enum: ["fremont", "palo_alto"] },
            customerName: { type: "string" },
            customerPhone: { type: "string" },
            pickupTime: { type: "string" },
          },
          required: ["items", "location", "customerName", "customerPhone"],
        },
      },
      {
        name: "refresh_menu",
        description: "Reload the menu from the latest scrape file.",
        inputSchema: { type: "object", properties: {}, required: [] },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params
    try {
      switch (name) {
        case "get_menu": {
          const { items, scrapedAt } = loadMenu()
          if (!items.length) return textResult({ error: "No menu scraped yet." }, true)
          const byCategory: Record<string, MenuItem[]> = {}
          for (const it of items) {
            const key = `${it.category} (${it.location})`
            ;(byCategory[key] ||= []).push(it)
          }
          return textResult({ scrapedAt, total: items.length, categories: byCategory })
        }

        case "get_menu_item": {
          const { name: q, location } = z
            .object({
              name: z.string().min(1),
              location: z.enum(["fremont", "palo_alto"]).optional(),
            })
            .parse(args)
          const { items } = loadMenu()
          let matches = findItems(q, items)
          if (location) matches = matches.filter((m) => m.location === location)
          return textResult({ query: q, found: matches.length > 0, matches: matches.slice(0, 20) })
        }

        case "get_locations":
          return textResult({
            locations: {
              fremont: { name: "Fremont", address: "4169 Cushing Parkway, Fremont, CA 94538", phone: "(510) 771-9989" },
              palo_alto: { name: "Palo Alto", address: "220B University Ave, Palo Alto, CA 94301", phone: "(650) 800-7657" },
            },
          })

        case "get_hours":
          return textResult({
            hours: {
              monday: "11:00 AM - 12:00 AM",
              tuesday: "11:00 AM - 12:00 AM",
              wednesday: "11:00 AM - 12:00 AM",
              thursday: "11:00 AM - 12:00 AM",
              friday: "11:00 AM - 12:30 AM",
              saturday: "11:00 AM - 12:30 AM",
              sunday: "11:00 AM - 12:00 AM",
            },
            timezone: "America/Los_Angeles",
          })

        case "place_order": {
          const order = z
            .object({
              items: z.array(z.object({ name: z.string().min(1), quantity: z.number().int().positive() })).min(1),
              location: z.enum(["fremont", "palo_alto"]),
              customerName: z.string().min(1),
              customerPhone: z.string().min(1),
              pickupTime: z.string().optional(),
            })
            .parse(args)

          const { items: allMenu } = loadMenu()
          const priced = order.items.map((sel) => {
            const match =
              allMenu.find((m) => m.location === order.location && m.name.toLowerCase() === sel.name.toLowerCase()) ||
              allMenu.find((m) => m.name.toLowerCase().includes(sel.name.toLowerCase()))
            if (!match) throw new Error(`Item not found: ${sel.name}`)
            return {
              id: match.id,
              name: match.name,
              quantity: sel.quantity,
              unitPrice: match.price,
              lineTotal: +(match.price * sel.quantity).toFixed(2),
            }
          })

          const subtotal = +priced.reduce((s, i) => s + i.lineTotal, 0).toFixed(2)
          const tax = +(subtotal * 0.0875).toFixed(2)
          const total = +(subtotal + tax).toFixed(2)

          const orderRecord = {
            orderId: "ZG-" + randomUUID().slice(0, 8).toUpperCase(),
            location: order.location,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            pickupTime: order.pickupTime || "ASAP",
            items: priced,
            subtotal,
            tax,
            total,
            currency: "USD",
            createdAt: new Date().toISOString(),
          }

          if (!ORDER_WEBHOOK_URL) {
            return textResult({ success: false, status: "integration_required", draft: orderRecord })
          }

          const res = await fetch(ORDER_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(orderRecord),
            signal: AbortSignal.timeout(15000),
          })
          if (!res.ok) return textResult({ success: false, status: "submission_failed", draft: orderRecord }, true)
          const confirmed = await res.json().catch(() => ({}))
          return textResult({
            success: true,
            submittedToRestaurant: true,
            restaurantOrderId: confirmed.orderId || orderRecord.orderId,
            total,
          })
        }

        case "refresh_menu": {
          const { items, scrapedAt } = loadMenu()
          return textResult({ refreshed: true, itemCount: items.length, scrapedAt })
        }

        default:
          return textResult(`Unknown tool: ${name}`, true)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return textResult(`Error: ${msg}`, true)
    }
  })

  return server
}

// ============================================================
// GROUPING — sort categories using TAB_ORDER
// ============================================================
function groupByLocation(items: MenuItem[]) {
  const locationKeys: string[] = []
  const locSeen = new Set<string>()
  for (const it of items) {
    if (!locSeen.has(it.location)) {
      locSeen.add(it.location)
      locationKeys.push(it.location)
    }
  }

  const perLoc: Record<string, LocationGroup> = {}
  for (const loc of locationKeys) {
    const cats: string[] = []
    const catSeen = new Set<string>()
    const byCat: Record<string, MenuItem[]> = {}

    for (const it of items) {
      if (it.location !== loc) continue
      const c = it.category || "Menu"
      if (!catSeen.has(c)) {
        catSeen.add(c)
        cats.push(c)
      }
      ;(byCat[c] ||= []).push(it)
    }

    // Sort categories by TAB_ORDER, unknown ones at the end
    cats.sort((a, b) => {
      const ia = TAB_ORDER.indexOf(a)
      const ib = TAB_ORDER.indexOf(b)
      if (ia === -1 && ib === -1) return a.localeCompare(b)
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })

    perLoc[loc] = { cats, byCat }
  }

  return { locationKeys, perLoc }
}

// ============================================================
// HTML BUILDERS
// ============================================================
function buildLocationSwitcher(locationKeys: string[]): string {
  return `
    <div class="location-tabs" id="location-tabs">
      ${locationKeys
        .map(
          (loc, i) => `
        <button class="loc-btn${i === 0 ? " active" : ""}" data-loc="${loc}">
          <span class="loc-name">${LOCATION_LABELS[loc] || loc}</span>
          <span class="loc-addr">${LOCATION_ADDRESSES[loc] || ""}</span>
        </button>
      `
        )
        .join("")}
    </div>
  `
}

function buildCategoryNavs(locationKeys: string[], perLoc: Record<string, LocationGroup>): string {
  return locationKeys
    .map((loc, i) => {
      const { cats } = perLoc[loc]
      const tabs = [
        `<button class="cat-btn active" data-loc="${loc}" data-cat="all">All</button>`,
        ...cats.map((c) => `<button class="cat-btn" data-loc="${loc}" data-cat="${slug(c)}">${c}</button>`),
      ].join("")
      return `
        <div class="category-tabs${i === 0 ? " active" : ""}" data-loc="${loc}">
          <div class="cat-scroll">${tabs}</div>
        </div>
      `
    })
    .join("")
}

function buildLocationContents(locationKeys: string[], perLoc: Record<string, LocationGroup>): string {
  return locationKeys
    .map((loc, i) => {
      const { cats, byCat } = perLoc[loc]
      const sections = cats
        .map(
          (cat) => `
            <section id="${loc}-cat-${slug(cat)}" data-loc="${loc}" data-cat="${slug(cat)}">
              <div class="section-head">
                <h2>${escapeHtml(cat)}</h2>
                <span class="section-count">${byCat[cat].length} item${byCat[cat].length === 1 ? "" : "s"}</span>
              </div>
              <div class="grid">
                ${byCat[cat]
                  .map(
                    (it) => `
                  <div class="card">
                    ${it.image
                        ? `<img src="${it.image}" alt="${escapeHtml(it.name)}" loading="lazy" />`
                        : `<div class="noimg">no image</div>`}
                    <div class="body">
                      <h3>${escapeHtml(it.name)}</h3>
                      <div class="price">$${it.price.toFixed(2)}</div>
                      ${it.description ? `<p class="desc">${escapeHtml(it.description)}</p>` : ""}
                      ${it.url
                        ? `<a class="order-btn" href="${it.url}" target="_blank" rel="noopener">Order →</a>`
                        : `<span class="order-btn disabled">Not orderable</span>`}
                    </div>
                  </div>
                `
                  )
                  .join("")}
              </div>
            </section>
          `
        )
        .join("")

      return `<div class="location-panel${i === 0 ? " active" : ""}" data-loc="${loc}">${sections}</div>`
    })
    .join("")
}

// ============================================================
// EXPRESS
// ============================================================
const app = express()

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Accept", "Authorization", "Mcp-Session-Id", "x-upload-secret"],
    exposedHeaders: ["Mcp-Session-Id"],
  })
)
app.use(express.json({ limit: "5mb" }))

// ---------- MCP ----------
app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  const server = createMcpServer()
  res.on("close", () => {
    void transport.close()
    void server.close()
  })
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    console.error("[mcp] request failed:", err)
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed" })
  }
})

app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Use POST for MCP" })
})

// ---------- HEALTH ----------
app.get("/health", (_req, res) => {
  const { items, scrapedAt } = loadMenu()
  res.json({ status: "ok", items: items.length, scrapedAt })
})

// ---------- UPLOAD ----------
app.post("/upload-menu", (req, res) => {
  if (UPLOAD_SECRET && req.headers["x-upload-secret"] !== UPLOAD_SECRET) {
    return res.status(401).json({ error: "Unauthorized" })
  }
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2))
    const { items, scrapedAt } = loadMenu()
    console.log(`[upload] received ${items.length} items (scraped ${scrapedAt})`)
    res.json({ ok: true, items: items.length, scrapedAt })
  } catch (err: any) {
    console.error("[upload] failed:", err)
    res.status(500).json({ error: err.message })
  }
})

// ---------- MENU PAGE ----------
app.get("/menu", (_req, res) => {
  const { items, scrapedAt } = loadMenu()
  const { locationKeys, perLoc } = groupByLocation(items)

  const locationSwitcher = buildLocationSwitcher(locationKeys)
  const categoryNavs = buildCategoryNavs(locationKeys, perLoc)
  const locationContents = buildLocationContents(locationKeys, perLoc)

  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Zingsters Menu</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #0a0a0c;
    color: #f0f0f0;
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }

  /* ============ HEADER ============ */
  .page-header {
    padding: 32px 32px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    border-bottom: 1px solid #1e1e22;
  }
  .brand h1 {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #fff;
  }
  .brand .tagline {
    color: #666;
    font-size: 13px;
    margin-top: 4px;
  }
  .refresh-btn {
    color: #fff;
    text-decoration: none;
    font-weight: 600;
    padding: 10px 20px;
    background: #e11d48;
    border-radius: 10px;
    font-size: 14px;
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .refresh-btn:hover { background: #f43f5e; transform: translateY(-1px); }

  /* ============ LOCATION SWITCHER ============ */
  .location-tabs {
    display: flex;
    gap: 12px;
    padding: 20px 32px;
    background: #0f0f12;
    border-bottom: 1px solid #1e1e22;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .location-tabs::-webkit-scrollbar { display: none; }
  .loc-btn {
    flex-shrink: 0;
    background: #17171c;
    border: 1.5px solid #26262e;
    border-radius: 12px;
    padding: 12px 20px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    font-family: inherit;
    color: inherit;
    min-width: 220px;
  }
  .loc-btn:hover {
    border-color: #3a3a44;
    background: #1d1d24;
  }
  .loc-btn.active {
    background: linear-gradient(135deg, #e11d48 0%, #be123c 100%);
    border-color: #e11d48;
    box-shadow: 0 8px 24px rgba(225, 29, 72, 0.35);
  }
  .loc-name {
    display: block;
    font-size: 15px;
    font-weight: 700;
    color: #fff;
  }
  .loc-addr {
    display: block;
    font-size: 12px;
    color: #888;
    margin-top: 2px;
  }
  .loc-btn.active .loc-addr { color: rgba(255,255,255,0.75); }

  /* ============ CATEGORY TABS ============ */
  .category-tabs {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(10, 10, 12, 0.95);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid #1e1e22;
    display: none;
  }
  .category-tabs.active { display: block; }
  .cat-scroll {
    display: flex;
    gap: 6px;
    padding: 12px 32px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .cat-scroll::-webkit-scrollbar { display: none; }
  .cat-btn {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: #8a8a92;
    font-weight: 600;
    font-size: 14px;
    padding: 10px 18px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
    white-space: nowrap;
  }
  .cat-btn:hover {
    color: #fff;
    background: #1a1a20;
  }
  .cat-btn.active {
    color: #fff;
    background: #e11d48;
  }

  /* ============ LOCATION CONTENT ============ */
  .location-panel { display: none; }
  .location-panel.active { display: block; }

  main { padding: 0 32px 60px; }

  /* ============ SECTIONS ============ */
  section {
    scroll-margin-top: 90px;
    padding: 40px 0 24px;
  }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid #1e1e22;
  }
  .section-head h2 {
    font-size: 24px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #fff;
    position: relative;
    padding-left: 16px;
  }
  .section-head h2::before {
    content: "";
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 4px;
    background: #e11d48;
    border-radius: 2px;
  }
  .section-count {
    font-size: 13px;
    color: #666;
    font-weight: 500;
  }

  /* ============ GRID ============ */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 24px;
  }

  /* ============ CARD ============ */
  .card {
    background: #121216;
    border: 1px solid #1e1e22;
    border-radius: 16px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: all 0.2s;
  }
  .card:hover {
    transform: translateY(-3px);
    border-color: #2d2d38;
    box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  }
  .card img {
    width: 100%;
    height: 200px;
    object-fit: cover;
    background: #1a1a1f;
    display: block;
  }
  .noimg {
    width: 100%;
    height: 200px;
    background: #1a1a1f;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #444;
    font-size: 12px;
  }
  .body {
    padding: 18px;
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .body h3 {
    font-size: 17px;
    font-weight: 700;
    margin-bottom: 6px;
    letter-spacing: -0.01em;
    color: #fff;
  }
  .price {
    color: #22c55e;
    font-weight: 800;
    font-size: 18px;
    margin-bottom: 10px;
  }
  .desc {
    color: #888;
    font-size: 13px;
    line-height: 1.55;
    margin-bottom: 14px;
    flex: 1;
  }
  .order-btn {
    display: inline-block;
    padding: 11px 18px;
    background: #22c55e;
    color: #052e16;
    font-weight: 700;
    text-decoration: none;
    border-radius: 10px;
    font-size: 14px;
    text-align: center;
    transition: all 0.15s;
    margin-top: auto;
  }
  .order-btn:hover { background: #16a34a; color: #fff; }
  .order-btn:active { transform: scale(0.98); }
  .order-btn.disabled {
    background: #1e1e22;
    color: #555;
    cursor: not-allowed;
  }

  /* ============ MOBILE ============ */
  @media (max-width: 720px) {
    .page-header { padding: 20px 16px 16px; }
    .brand h1 { font-size: 22px; }
    .location-tabs { padding: 16px; gap: 8px; }
    .loc-btn { min-width: 180px; padding: 10px 16px; }
    .cat-scroll { padding: 10px 16px; gap: 4px; }
    .cat-btn { padding: 8px 14px; font-size: 13px; }
    main { padding: 0 16px 40px; }
    section { padding: 28px 0 16px; }
    .section-head h2 { font-size: 19px; }
    .grid {
      grid-template-columns: 1fr;
      gap: 16px;
    }
    .card img, .noimg { height: 180px; }
  }

  /* Hide sections when filtering */
  section[data-hidden="true"] { display: none; }
</style>
</head>
<body>

  <div class="page-header">
    <div class="brand">
      <h1>Zingsters Menu</h1>
      <div class="tagline">${items.length} items · updated ${scrapedAt}</div>
    </div>
    <a class="refresh-btn" href="/menu">🔄 Refresh</a>
  </div>

  ${locationSwitcher}
  ${categoryNavs}

  <main>
    ${locationContents}
  </main>

  <script>
    // ============================================================
    // STATE
    // ============================================================
    const locButtons = Array.from(document.querySelectorAll(".loc-btn"));
    const catTabs = Array.from(document.querySelectorAll(".category-tabs"));
    const panels = Array.from(document.querySelectorAll(".location-panel"));
    const catButtons = Array.from(document.querySelectorAll(".cat-btn"));

    let currentLoc = locButtons[0]?.dataset.loc || "";
    let currentCat = "all";

    // ============================================================
    // LOCATION SWITCH
    // ============================================================
    function showLocation(loc) {
      currentLoc = loc;
      currentCat = "all";

      locButtons.forEach((b) => b.classList.toggle("active", b.dataset.loc === loc));
      panels.forEach((p) => p.classList.toggle("active", p.dataset.loc === loc));
      catTabs.forEach((t) => t.classList.toggle("active", t.dataset.loc === loc));

      // Reset category tabs to "All"
      const activeCatBar = document.querySelector(\`.category-tabs[data-loc="\${loc}"]\`);
      if (activeCatBar) {
        activeCatBar.querySelectorAll(".cat-btn").forEach((b, i) => {
          b.classList.toggle("active", i === 0);
        });
      }

      // Show all sections
      document.querySelectorAll(\`.location-panel[data-loc="\${loc}"] section\`).forEach((s) => {
        s.dataset.hidden = "false";
      });

      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    locButtons.forEach((b) => {
      b.addEventListener("click", () => showLocation(b.dataset.loc));
    });

    // ============================================================
    // CATEGORY FILTER — smooth scroll + hide others
    // ============================================================
    catButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const loc = btn.dataset.loc;
        const cat = btn.dataset.cat;
        if (loc !== currentLoc) return;

        currentCat = cat;

        // Update active state
        const activeBar = document.querySelector(\`.category-tabs[data-loc="\${loc}"]\`);
        activeBar.querySelectorAll(".cat-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        // Scroll to top first if "All"
        if (cat === "all") {
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }

        // Scroll to that section
        const target = document.getElementById(\`\${loc}-cat-\${cat}\`);
        if (target) {
          const top = target.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top, behavior: "smooth" });
        }
      });
    });

    // ============================================================
    // SCROLLSPY — highlight tab as user scrolls
    // ============================================================
    function updateScrollspy() {
      const activePanel = document.querySelector(\`.location-panel[data-loc="\${currentLoc}"]\`);
      if (!activePanel) return;

      const sections = Array.from(activePanel.querySelectorAll("section[data-cat]"));
      const activeBar = document.querySelector(\`.category-tabs[data-loc="\${currentLoc}"]\`);
      if (!activeBar) return;

      const scrollY = window.scrollY + 120;
      let current = null;
      for (const s of sections) {
        const top = s.getBoundingClientRect().top + window.scrollY;
        if (top <= scrollY) current = s;
        else break;
      }

      activeBar.querySelectorAll(".cat-btn").forEach((b) => b.classList.remove("active"));

      if (current) {
        const tab = activeBar.querySelector(\`.cat-btn[data-cat="\${current.dataset.cat}"]\`);
        if (tab) {
          tab.classList.add("active");
          // Center the active tab
          const parent = activeBar.querySelector(".cat-scroll");
          if (parent) {
            parent.scrollTo({
              left: tab.offsetLeft - parent.clientWidth / 2 + tab.clientWidth / 2,
              behavior: "smooth",
            });
          }
        }
      } else {
        activeBar.querySelector(".cat-btn")?.classList.add("active");
      }
    }

    window.addEventListener("scroll", updateScrollspy, { passive: true });

    // ============================================================
    // INIT
    // ============================================================
    if (currentLoc) showLocation(currentLoc);
    updateScrollspy();
  </script>
</body>
</html>`)
})

// ============================================================
// BOOT
// ============================================================
app.listen(PORT, () => {
  console.log(`\n[zing-menu-mcp] listening on http://localhost:${PORT}`)
  console.log(`[zing-menu-mcp] MCP:     http://localhost:${PORT}/mcp`)
  console.log(`[zing-menu-mcp] Menu:    http://localhost:${PORT}/menu`)
  console.log(`[zing-menu-mcp] Health:  http://localhost:${PORT}/health`)
  const { items, scrapedAt } = loadMenu()
  console.log(`[zing-menu-mcp] ${items.length} items loaded (scraped ${scrapedAt})\n`)
})
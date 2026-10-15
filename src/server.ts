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
// MENU PAGE BUILDER
// ============================================================
const LOCATION_LABELS: Record<string, string> = {
  fremont: "Fremont",
  palo_alto: "Palo Alto",
}

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
    perLoc[loc] = { cats, byCat }
  }

  return { locationKeys, perLoc }
}

function buildLocationSwitcher(locationKeys: string[]): string {
  return `
    <nav class="location-nav" id="location-nav">
      ${locationKeys
        .map(
          (loc, i) =>
            `<a href="#" data-loc="${loc}" class="${i === 0 ? "active" : ""}">${LOCATION_LABELS[loc] || loc}</a>`
        )
        .join("")}
    </nav>
  `
}

function buildCategoryNavs(locationKeys: string[], perLoc: Record<string, LocationGroup>): string {
  return locationKeys
    .map((loc, i) => {
      const { cats } = perLoc[loc]
      const tabs = [
        `<a href="#" data-loc="${loc}" data-cat="all" class="active">All</a>`,
        ...cats.map((c) => `<a href="#" data-loc="${loc}" data-cat="${slug(c)}">${c}</a>`),
      ].join("")
      return `
        <div class="category-nav-wrap${i === 0 ? " active" : ""}" data-loc="${loc}">
          <nav class="category-nav" data-loc="${loc}">${tabs}</nav>
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
              <h2>${escapeHtml(cat)}</h2>
              <div class="grid">
                ${byCat[cat]
                  .map(
                    (it) => `
                  <div class="card">
                    ${
                      it.image
                        ? `<img src="${it.image}" alt="${escapeHtml(it.name)}" loading="lazy" />`
                        : `<div class="noimg">no image</div>`
                    }
                    <div class="body">
                      <h3>${escapeHtml(it.name)}</h3>
                      <div class="price">$${it.price.toFixed(2)}</div>
                      ${it.description ? `<p class="desc">${escapeHtml(it.description)}</p>` : ""}
                      ${
                        it.url
                          ? `<a class="order-btn" href="${it.url}" target="_blank" rel="noopener">Order →</a>`
                          : `<span class="order-btn disabled">Not orderable</span>`
                      }
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

      return `<div class="location-content${i === 0 ? " active" : ""}" data-loc="${loc}">${sections}</div>`
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
<title>Zingster Menu</title>
<style>
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #0b0b0d;
    color: #eee;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
  }

  /* Page header */
  .page-header {
    padding: 24px 24px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }
  h1 { margin: 0; font-size: 28px; letter-spacing: -0.02em; }
  .meta { color: #888; font-size: 13px; margin-top: 4px; }
  .refresh {
    color: #2563eb; text-decoration: none; font-weight: 500;
    padding: 8px 16px; border: 1px solid #2563eb; border-radius: 8px;
    font-size: 14px; transition: all 0.15s;
  }
  .refresh:hover { background: #2563eb; color: white; }

  /* Location switcher */
  .location-nav {
    display: flex;
    gap: 8px;
    padding: 8px 24px 20px;
    border-bottom: 1px solid #2a2a2e;
  }
  .location-nav a {
    padding: 12px 24px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 15px;
    text-decoration: none;
    color: #888;
    background: #17171a;
    border: 1px solid #2a2a2e;
    transition: all 0.15s;
    cursor: pointer;
  }
  .location-nav a:hover { color: #ccc; border-color: #3a3a3e; }
  .location-nav a.active {
    background: #e11d48;
    color: white;
    border-color: #e11d48;
  }

  /* Category tabs */
  .category-nav-wrap {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #0b0b0d;
    border-bottom: 1px solid #2a2a2e;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: none;
  }
  .category-nav-wrap.active { display: block; }
  .category-nav {
    display: flex;
    gap: 4px;
    padding: 0 16px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .category-nav::-webkit-scrollbar { display: none; }
  .category-nav a {
    color: #999;
    text-decoration: none;
    font-weight: 600;
    font-size: 15px;
    padding: 16px 14px;
    white-space: nowrap;
    border-bottom: 3px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    flex-shrink: 0;
    cursor: pointer;
  }
  .category-nav a:hover { color: #e11d48; }
  .category-nav a.active {
    color: #e11d48;
    border-bottom-color: #e11d48;
  }

  /* Location content switching */
  .location-content { display: none; }
  .location-content.active { display: block; }

  /* Sections */
  main { padding: 8px 24px 40px; }
  section {
    scroll-margin-top: 80px;
    padding: 32px 0 16px;
  }
  section h2 {
    font-size: 22px;
    margin: 0 0 20px 0;
    padding-left: 14px;
    border-left: 4px solid #e11d48;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  /* Grid */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 20px;
  }

  /* Cards */
  .card {
    background: #17171a;
    border: 1px solid #2a2a2e;
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  .card:hover {
    transform: translateY(-2px);
    border-color: #3a3a3e;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .card img {
    width: 100%; height: 180px; object-fit: cover; background: #222; display: block;
  }
  .noimg {
    width: 100%; height: 180px; background: #1d1d20;
    display: flex; align-items: center; justify-content: center;
    color: #555; font-size: 12px;
  }
  .body { padding: 16px; display: flex; flex-direction: column; flex: 1; }
  .body h3 { margin: 0 0 6px 0; font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
  .price { color: #22c55e; font-weight: 700; font-size: 16px; margin-bottom: 8px; }
  .desc { margin: 0 0 12px 0; color: #999; font-size: 13px; line-height: 1.5; flex: 1; }
  .order-btn {
    display: inline-block; padding: 10px 16px;
    background: #22c55e; color: #0a0a0a; font-weight: 700;
    text-decoration: none; border-radius: 8px; font-size: 13px;
    text-align: center; transition: background 0.15s, transform 0.1s;
  }
  .order-btn:hover { background: #16a34a; color: white; }
  .order-btn:active { transform: scale(0.98); }
  .order-btn.disabled { background: #2a2a2e; color: #555; cursor: not-allowed; }

  /* Mobile */
  @media (max-width: 640px) {
    .page-header { padding: 20px 16px 8px; }
    h1 { font-size: 22px; }
    .location-nav { padding: 4px 16px 16px; gap: 6px; }
    .location-nav a { padding: 10px 16px; font-size: 14px; flex: 1; text-align: center; }
    .grid { grid-template-columns: 1fr; gap: 16px; }
    main { padding: 4px 16px 40px; }
    section h2 { font-size: 18px; }
    .category-nav a { padding: 14px 12px; font-size: 14px; }
  }
</style>
</head>
<body>

  <div class="page-header">
    <div>
      <h1>Zingster Menu</h1>
      <div class="meta">${items.length} items · scraped ${scrapedAt}</div>
    </div>
    <a class="refresh" href="/menu">🔄 Refresh</a>
  </div>

  ${locationSwitcher}
  ${categoryNavs}

  <main>
    ${locationContents}
  </main>

  <script>
    // ============================================================
    // State
    // ============================================================
    const locationLinks = Array.from(document.querySelectorAll("#location-nav a"));
    const locationContents = Array.from(document.querySelectorAll(".location-content"));
    const catNavWraps = Array.from(document.querySelectorAll(".category-nav-wrap"));

    let currentLocation = locationLinks[0]?.dataset.loc || "";

    // ============================================================
    // 1. Location switching
    // ============================================================
    function showLocation(loc) {
      currentLocation = loc;
      locationLinks.forEach((l) => l.classList.toggle("active", l.dataset.loc === loc));
      locationContents.forEach((c) => c.classList.toggle("active", c.dataset.loc === loc));
      catNavWraps.forEach((w) => w.classList.toggle("active", w.dataset.loc === loc));

      const nav = document.querySelector(\`.category-nav-wrap[data-loc="\${loc}"] .category-nav\`);
      if (nav) {
        const links = nav.querySelectorAll("a");
        links.forEach((a, i) => a.classList.toggle("active", i === 0));
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    locationLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        showLocation(link.dataset.loc);
      });
    });

    // ============================================================
    // 2. Category tab click
    // ============================================================
    document.querySelectorAll(".category-nav a").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const loc = link.dataset.loc;
        const cat = link.dataset.cat;

        if (cat === "all") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          const target = document.getElementById(\`\${loc}-cat-\${cat}\`);
          if (target) {
            const top = target.getBoundingClientRect().top + window.scrollY - 70;
            window.scrollTo({ top, behavior: "smooth" });
          }
        }

        const nav = link.closest(".category-nav");
        nav.querySelectorAll("a").forEach((a) => a.classList.remove("active"));
        link.classList.add("active");
      });
    });

    // ============================================================
    // 3. Scrollspy
    // ============================================================
    function updateScrollspy() {
      const sections = Array.from(
        document.querySelectorAll(\`.location-content[data-loc="\${currentLocation}"] section[data-cat]\`)
      );
      const nav = document.querySelector(\`.category-nav-wrap[data-loc="\${currentLocation}"] .category-nav\`);
      if (!sections.length || !nav) return;

      const scrollY = window.scrollY + 100;
      let current = null;
      for (const s of sections) {
        const top = s.getBoundingClientRect().top + window.scrollY;
        if (top <= scrollY) current = s;
        else break;
      }

      const links = nav.querySelectorAll("a");
      links.forEach((a) => a.classList.remove("active"));

      if (current) {
        const tab = nav.querySelector(\`a[data-cat="\${current.dataset.cat}"]\`);
        if (tab) {
          tab.classList.add("active");
          nav.scrollTo({
            left: tab.offsetLeft - nav.clientWidth / 2 + tab.clientWidth / 2,
            behavior: "smooth",
          });
        }
      } else {
        links[0]?.classList.add("active");
      }
    }

    window.addEventListener("scroll", updateScrollSpy, { passive: true });

    // ============================================================
    // 4. Init
    // ============================================================
    if (currentLocation) showLocation(currentLocation);
    updateScrollSpy();
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
const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = 4000;
const MENU_FILE = path.join(__dirname, "data", "toast-menu.json");

function hashMenu(data) {
  const items = data.locations?.fremont?.items || [];
  const str = items.map((i) => `${i.name}|${i.price}`).sort().join(";");
  return crypto.createHash("sha256").update(str).digest("hex");
}

app.post("/trigger-scrape", async (req, res) => {
  console.log("[webhook] Triggered at", new Date().toISOString());

  let oldHash = null;
  if (fs.existsSync(MENU_FILE)) {
    try {
      const oldData = JSON.parse(fs.readFileSync(MENU_FILE, "utf-8"));
      oldHash = hashMenu(oldData);
    } catch {}
  }

  exec("python scrape_toast.py", { cwd: __dirname, timeout: 120000 }, (error, stdout, stderr) => {
    if (error) {
      console.error("[webhook] Scrape error:", error.message);
      return res.status(500).json({ updated: false, message: "Scraper failed: " + error.message });
    }

    let newData;
    try {
      newData = JSON.parse(fs.readFileSync(MENU_FILE, "utf-8"));
    } catch (e) {
      return res.status(500).json({ updated: false, message: "Could not read menu file." });
    }

    const newHash = hashMenu(newData);
    const updated = oldHash !== newHash;

    console.log(`[webhook] old=${oldHash?.slice(0,8) || "none"} new=${newHash.slice(0,8)} updated=${updated}`);

    res.json({
      updated,
      message: updated
        ? "Menu updated with new items or prices."
        : "Menu is already up-to-date. No changes on Toast.",
      scrapedAt: newData.scrapedAt,
    });
  });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[webhook] Listening on http://localhost:${PORT}`);
});

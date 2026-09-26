import fs from "node:fs";
import { Readable } from "node:stream";
import http from "node:http";
import pg from "pg";
import { handleRestaurantOwnerFeature, migrateRestaurantOwnerFeatures } from "./restaurant-owner-features.js";

// Protect the current 399 EUR download-license decision from an obsolete
// initialization statement that would otherwise reset it to 299 EUR.
const originalPoolQuery = pg.Pool.prototype.query;
pg.Pool.prototype.query = function patchedPoolQuery(text, ...args) {
  if (typeof text === "string" && text.includes("UPDATE billing_plans SET amount_cents=29900,currency='EUR' WHERE code='download_license' AND amount_cents=39900;")) {
    text = text.replace("UPDATE billing_plans SET amount_cents=29900,currency='EUR' WHERE code='download_license' AND amount_cents=39900;", "");
  }
  return originalPoolQuery.call(this, text, ...args);
};

// Add modular API routes without destabilising the large legacy server file.
const originalCreateServer = http.createServer.bind(http);
http.createServer = function patchedCreateServer(listener) {
  return originalCreateServer(async (req,res) => {
    try {
      if (await handleRestaurantOwnerFeature(req,res)) return;
    } catch (error) {
      console.error("Restaurant-owner feature error:", error);
      if (!res.headersSent) {
        res.writeHead(500, {"content-type":"application/json","cache-control":"no-store"});
        return res.end(JSON.stringify({error:"Serverfehler"}));
      }
      return res.end();
    }
    return listener(req,res);
  });
};

const originalCreateReadStream = fs.createReadStream.bind(fs);
fs.createReadStream = function patchedCreateReadStream(filePath, options) {
  const normalized = String(filePath).replaceAll("\\", "/");
  if (normalized.includes("/apps/web/public/") && normalized.endsWith(".html")) {
    try {
      let html = fs.readFileSync(filePath, "utf8");
      if (!html.includes('/brand-logo.js')) html = html.replace("</body>", '<script src="/brand-logo.js"></script></body>');
      if (normalized.endsWith("/apps/web/public/pos/index.html")) {
        // The former full-screen alphabet keyboard is intentionally no longer
        // injected into the cash register. POS input stays touch-first and
        // compact; a dedicated numeric order keypad can live inside the order
        // panel without covering the register workspace.
        if (!html.includes('/pos/tax-export.js')) html = html.replace("</body>", '<script src="/pos/tax-export.js"></script></body>');
        if (!html.includes('/pos/availability.js')) html = html.replace("</body>", '<script src="/pos/availability.js"></script></body>');
        if (!html.includes('/pos/restaurant-owner.js')) html = html.replace("</body>", '<script src="/pos/restaurant-owner.js"></script></body>');
      }
      if (normalized.endsWith("/apps/web/public/tisch/index.html")) {
        if (!html.includes('/tisch/guest-enhancements.js')) html = html.replace("</body>", '<script src="/tisch/guest-enhancements.js"></script></body>');
      }
      if (normalized.endsWith("/apps/web/public/service/index.html")) {
        if (!html.includes('/service/presence.js')) html = html.replace("</body>", '<script src="/service/presence.js"></script></body>');
      }
      if (normalized.endsWith("/apps/web/public/admin/index.html")) {
        if (!html.includes('/admin/control-center.js')) html = html.replace("</body>", '<script src="/admin/control-center.js"></script></body>');
      }
      return Readable.from([Buffer.from(html, "utf8")]);
    } catch (error) {
      console.error("Could not inject web helper modules:", error);
    }
  }
  return originalCreateReadStream(filePath, options);
};

await import("./index.js");

async function migrateWithRetry(){
  for(let attempt=1;attempt<=12;attempt++){
    try{await migrateRestaurantOwnerFeatures();console.log("Restaurant-owner feature schema ready.");return}
    catch(error){
      if(attempt===12){console.error("Restaurant-owner feature migration failed:",error);return}
      await new Promise(r=>setTimeout(r,1000));
    }
  }
}
migrateWithRetry();

const availabilityPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

function berlinClock() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date()).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, monthDay: `${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function ruleActive(rule) {
  if (!rule?.enabled) return null;
  const now = berlinClock();
  let timeOk = true, seasonOk = true;
  if (rule.startTime && rule.endTime) timeOk = rule.startTime <= rule.endTime ? (now.time >= rule.startTime && now.time <= rule.endTime) : (now.time >= rule.startTime || now.time <= rule.endTime);
  else if (rule.startTime) timeOk = now.time >= rule.startTime;
  else if (rule.endTime) timeOk = now.time <= rule.endTime;
  const start = String(rule.startDate || "").slice(5), end = String(rule.endDate || "").slice(5);
  if (start && end) seasonOk = start <= end ? (now.monthDay >= start && now.monthDay <= end) : (now.monthDay >= start || now.monthDay <= end);
  else if (start) seasonOk = now.monthDay >= start;
  else if (end) seasonOk = now.monthDay <= end;
  return timeOk && seasonOk;
}

async function applyAvailabilityRules() {
  try {
    const q = await availabilityPool.query("SELECT p.id,pt.allergens FROM products p JOIN product_translations pt ON pt.product_id=p.id WHERE pt.language_code='avl' AND pt.allergens IS NOT NULL");
    for (const row of q.rows) {
      let rule; try { rule = JSON.parse(row.allergens); } catch { continue; }
      const active = ruleActive(rule); if (active === null) continue;
      await availabilityPool.query("UPDATE products SET active=$2 WHERE id=$1 AND active IS DISTINCT FROM $2", [row.id, active]);
    }
  } catch (error) {
    console.error("Availability scheduler failed:", error.message);
  }
}
setTimeout(applyAvailabilityRules, 3000);
setInterval(applyAvailabilityRules, 60000).unref();

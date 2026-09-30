import fs from "node:fs";
import {handleAiPlatform,migrateAiPlatform} from "./ai-platform.js";
import { Readable } from "node:stream";
import http from "node:http";
import pg from "pg";
import { handleRestaurantOwnerFeature, migrateRestaurantOwnerFeatures } from "./restaurant-owner-features.js";
import { handlePaymentCheckout } from "./payment-checkout.js";
import { handlePaymentReceipt } from "./payment-receipt.js";
import { handlePublicReceipt, migratePublicReceipts } from "./public-receipt.js";
import { handleTseRoutes, migrateTseIntegration } from "./tse-integration.js";
import { handleBillingAccess, migrateBillingAccess } from "./billing-access.js";
import { handleBillingStatus } from "./billing-status.js";
import { handleDeviceLicense, migrateDeviceLicense } from "./device-license.js";
import { handlePlatformControl } from "./platform-control.js";
import { handleAdminPasswordReset, requireAdminPasswordChange } from "./admin-password-reset.js";
import { handleSupport, migrateSupport } from "./support-center.js";
import { handleAdminTeam } from "./admin-team.js";
import { handleStaffInvitations, migrateStaffInvitations } from "./staff-invitations.js";
import { handleAdminAuditExport } from "./admin-audit-export.js";
import { handleBillingTerms, migrateBillingTerms } from "./billing-terms.js";

// Protect the current 399 EUR download-license decision from obsolete legacy SQL.
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
      if (await handleAiPlatform(req,res)) return;
      if (await requireAdminPasswordChange(req,res)) return;
      if (await handleSupport(req,res)) return;
      if (await handleDeviceLicense(req,res)) return;
      if (await handleAdminPasswordReset(req,res)) return;
      if (await handleAdminTeam(req,res)) return;
      if (await handleStaffInvitations(req,res)) return;
      if (await handleAdminAuditExport(req,res)) return;
      if (await handleBillingTerms(req,res)) return;
      if (await handlePlatformControl(req,res)) return;
      if (await handleBillingAccess(req,res)) return;
      if (await handleBillingStatus(req,res)) return;
      if (await handleTseRoutes(req,res)) return;
      if (await handlePaymentCheckout(req,res)) return;
      if (await handlePaymentReceipt(req,res)) return;
      if (await handlePublicReceipt(req,res)) return;
      if (await handleRestaurantOwnerFeature(req,res)) return;
    } catch (error) {
      console.error("Modular feature error:", error);
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
      if (!normalized.includes('/ai') && !html.includes('/brand-logo.js')) html = html.replace("</head>", '<script src="/brand-logo.js"></script></head>');
      if (normalized.endsWith("/apps/web/public/pos/index.html")) {
        if (!html.includes('/pos/numpad.js')) html = html.replace("</body>", '<script src="/pos/numpad.js"></script></body>');
        if (!html.includes('/pos/payment-flow.js')) html = html.replace("</body>", '<script src="/pos/payment-flow.js"></script></body>');
        if (!html.includes('/pos/tax-export.js')) html = html.replace("</body>", '<script src="/pos/tax-export.js"></script></body>');
        if (!html.includes('/pos/availability.js')) html = html.replace("</body>", '<script src="/pos/availability.js"></script></body>');
        if (!html.includes('/pos/restaurant-owner.js')) html = html.replace("</body>", '<script src="/pos/restaurant-owner.js"></script></body>');
        if (!html.includes('/pos/desktop-profile.js')) html = html.replace("</body>", '<script src="/pos/desktop-profile.js"></script></body>');
      }
      if (normalized.endsWith("/apps/web/public/tisch/index.html")) {
        if (!html.includes('/tisch/guest-enhancements.js')) html = html.replace("</body>", '<script src="/tisch/guest-enhancements.js"></script></body>');
      }
      if (normalized.endsWith("/apps/web/public/service/index.html")) {
        if (!html.includes('/service/presence.js')) html = html.replace("</body>", '<script src="/service/presence.js"></script></body>');
      }
      if (normalized.endsWith("/apps/web/public/admin/index.html")) {
        if (!html.includes('/admin/support-center.js')) html = html.replace("</body>", '<script src="/admin/support-center.js"></script></body>');
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
    try{
      await migrateRestaurantOwnerFeatures();
      await migratePublicReceipts();
      await migrateTseIntegration();
      await migrateBillingAccess();
      await migrateDeviceLicense();
      await migrateBillingTerms();
      await migrateStaffInvitations();
      await migrateSupport();
      await migrateAiPlatform();
      const pricingPool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      });
      try {
        await pricingPool.query("UPDATE billing_plans SET amount_cents=39900,currency='EUR' WHERE code='download_license'");
      } finally {
        await pricingPool.end();
      }
      console.log("Restaurant-owner, TSE, billing access, device-license schema and download pricing ready.");
      return;
    }
    catch(error){
      if(attempt===12){console.error("Startup feature migration failed:",error);return}
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

import fs from "node:fs";
import { Readable } from "node:stream";

const originalCreateReadStream = fs.createReadStream.bind(fs);
fs.createReadStream = function patchedCreateReadStream(filePath, options) {
  const normalized = String(filePath).replaceAll("\\", "/");
  if (normalized.endsWith("/apps/web/public/pos/index.html")) {
    try {
      let html = fs.readFileSync(filePath, "utf8");
      if (!html.includes('/pos/keyboard.js')) {
        html = html.replace("</body>", '<script src="/pos/keyboard.js"></script></body>');
      }
      if (!html.includes('/pos/tax-export.js')) {
        html = html.replace("</body>", '<script src="/pos/tax-export.js"></script></body>');
      }
      return Readable.from([Buffer.from(html, "utf8")]);
    } catch (error) {
      console.error("Could not inject POS helper modules:", error);
    }
  }
  return originalCreateReadStream(filePath, options);
};

await import("./index.js");

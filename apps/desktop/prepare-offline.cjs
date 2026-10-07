const fs=require('node:fs'),path=require('node:path');fs.copyFileSync(path.join(__dirname,'../../server/offline-sale-core.js'),path.join(__dirname,'offline-sale-core.mjs'));

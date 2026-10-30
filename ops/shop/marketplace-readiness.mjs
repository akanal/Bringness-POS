import {marketplaceReadinessReport} from '../../server/shop-mollie-marketplace-readiness.js';

// Protected JSON arrives over stdin; never pass credentials as CLI arguments.
const fail = code => ({schemaVersion: 1, status: 'invalid_input', errorCode: code,
  productionReady: false, canPay: false, canFulfil: false});
let report;
try {
  if (process.argv.length !== 2) report = fail('ARGUMENTS_NOT_ALLOWED');
  else {
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 16384) { report = fail('INPUT_TOO_LARGE'); break; }
      chunks.push(chunk);
    }
    if (!report) {
      // Fatal decoding avoids silently changing invalid UTF-8 credentials.
      const json = new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks));
      let input;
      try { input = JSON.parse(json); }
      catch { report = fail('INPUT_JSON'); }
      if (!report) report = marketplaceReadinessReport(input);
    }
  }
} catch { report = fail('INPUT_READ'); }
process.stdout.on('error', () => { process.exitCode = 1; });
process.stdout.write(JSON.stringify(report) + '\n');
// Zero proves local checks only. It NEVER signals production acceptance.
process.exitCode = report.status === 'local_checks_passed' ? 0 : report.status === 'local_checks_failed' ? 2 : 1;

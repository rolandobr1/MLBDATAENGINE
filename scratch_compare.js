const fs = require('fs');

const code = fs.readFileSync('c:/Users/Rolando Valdez/Desktop/MLBDATAENGINE/src/utils.ts', 'utf8');

const m = code.match(/export function generateMLDatasetCSV[\s\S]*?const headers = \[([\s\S]*?)\];[\s\S]*?const row = \[([\s\S]*?)\];/);
if (!m) {
    console.log("Match not found");
    process.exit(1);
}

const headers_str = m[1];
const rows_str = m[2];

let headers = headers_str.split(',').map(x => x.trim());
headers = headers.filter(x => x && x.startsWith('"'));

// For rows, splitting by comma is dangerous because of function calls with commas!
// Wait! Yes! `g.advanced_offense?.home?.kPctVsPitchHand ?? ""` might have a comma if there's a function call.
// But mostly there are no commas in the expressions. Let's see:
let rows = rows_str.split(/,\s*\n/).map(x => x.trim());
rows = rows.filter(x => x && !x.startsWith('//') && !x.startsWith('/*'));

console.log(`Headers: ${headers.length}`);
console.log(`Rows: ${rows.length}`);

let out = "";
for (let i = 0; i < Math.max(headers.length, rows.length); i++) {
    const h = i < headers.length ? headers[i] : "MISSING HEADER";
    const r = i < rows.length ? rows[i].substring(0, 80).replace(/\n/g, ' ') : "MISSING ROW";
    out += `${i.toString().padStart(3, ' ')}: ${h.padEnd(35, ' ')} | ${r}\n`;
}

fs.writeFileSync('c:/Users/Rolando Valdez/Desktop/MLBDATAENGINE/scratch_compare.txt', out);
console.log("Done");

/**
 * Verifica que los logotipos oficiales existan en assets/logos/.
 * Uso (desde la raíz del proyecto): node scripts/copy-logos.js
 *
 * No copia archivos: solo comprueba presencia de los PNG esperados por index.html.
 */
const fs = require("fs");
const path = require("path");

const dstDir = path.join(__dirname, "..", "assets", "logos");
const expected = [
  "INEGI Logotipo_5.png",
  "INEGI Logotipo_8.png",
  "snieg.png",
];

fs.mkdirSync(dstDir, { recursive: true });
const found = fs.readdirSync(dstDir);
let ok = true;
for (const name of expected) {
  if (!found.includes(name)) {
    console.warn("FALTA:", name);
    ok = false;
  } else {
    console.log("OK:", name);
  }
}
if (!ok) {
  console.log("\nColoca los PNG en:", dstDir);
  process.exit(1);
}
console.log("\nLogos listos en assets/logos");

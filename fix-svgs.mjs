import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust this path if needed
const ICONS_DIR = path.join(__dirname, "src", "assets", "icons");

function cleanSvgContent(svg) {
  return (
    svg
      // remove fixed width/height
      .replace(/(width|height)="[^"]*"/g, "")
      // remove fill="none" and opacity="0"
      .replace(/fill="none"/g, "")
      .replace(/opacity="0(\.\d+)?"/g, "")
      // remove attributes without values (e.g. stroke-width)
      .replace(/\s[a-zA-Z-]+(?=\s|>)/g, "")
      // ensure viewBox exists
      .replace(/<svg([^>]*)(?<!viewBox="[^"]*")>/, '<svg$1 viewBox="0 0 24 24">')
      // remove XML headers
      .replace(/<\?xml[^>]*\?>/g, "")
      // remove multiple spaces
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

function cleanAllSvgs(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".svg"));
  for (const file of files) {
    const filePath = path.join(dir, file);
    const original = fs.readFileSync(filePath, "utf8");
    const cleaned = cleanSvgContent(original);
    fs.writeFileSync(filePath, cleaned, "utf8");
    console.log(`✅ Cleaned ${file}`);
  }
}

cleanAllSvgs(ICONS_DIR);
console.log("✨ All SVGs cleaned successfully!");

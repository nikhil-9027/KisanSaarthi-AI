import fs from "fs";
import path from "path";

const dir = ".";

function searchDir(currentPath) {
  const files = fs.readdirSync(currentPath);
  for (const file of files) {
    const fullPath = path.join(currentPath, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== "node_modules" && file !== ".git") {
        searchDir(fullPath);
      }
    } else if (file.endsWith(".html") || file.endsWith(".js") || file.endsWith(".css")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (content.toLowerCase().includes("agmarknet") || content.toLowerCase().includes("data.gov.in")) {
        console.log(`Found match in: ${fullPath}`);
        // print matching lines
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes("agmarknet") || line.toLowerCase().includes("data.gov.in")) {
            console.log(`  Line ${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

searchDir(dir);

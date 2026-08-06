import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

if (!version || version === "--help" || version === "-h") {
  console.log("Usage: npm run release:version -- <major.minor.patch>");
  process.exit(version ? 0 : 1);
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Version invalide: ${version}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content);
}

const tauriConfigPath = "apps/desktop/src-tauri/tauri.conf.json";
const tauriConfig = JSON.parse(read(tauriConfigPath));
tauriConfig.version = version;
write(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoPath = "apps/desktop/src-tauri/Cargo.toml";
const cargo = read(cargoPath).replace(
  /^version = "[^"]+"/m,
  `version = "${version}"`,
);
write(cargoPath, cargo);

const desktopPackagePath = "apps/desktop/package.json";
const desktopPackage = JSON.parse(read(desktopPackagePath));
desktopPackage.version = version;
write(desktopPackagePath, `${JSON.stringify(desktopPackage, null, 2)}\n`);

const lockPath = "package-lock.json";
const lock = JSON.parse(read(lockPath));
if (!lock.packages?.["apps/desktop"]) {
  throw new Error("Entrée apps/desktop absente de package-lock.json");
}
lock.packages["apps/desktop"].version = version;
write(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

const appPath = "apps/desktop/src/App.tsx";
const app = read(appPath).replace(
  /version: "[^"]+"/,
  `version: "${version}"`,
);
write(appPath, app);

console.log(`Version desktop mise à jour: ${version}`);
console.log(`Tag GitHub à utiliser: v${version}`);

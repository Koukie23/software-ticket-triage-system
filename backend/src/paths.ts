import fs from "fs";
import path from "path";

export function findProjectRoot(): string {
  let dir = path.resolve(__dirname, "..");
  for (let i = 0; i < 5; i += 1) {
    if (fs.existsSync(path.join(dir, "shared", "domain.json"))) return dir;
    dir = path.resolve(dir, "..");
  }
  throw new Error("找不到项目根目录（shared/domain.json）");
}

export const projectRoot = findProjectRoot();

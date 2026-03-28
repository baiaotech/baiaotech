import process from "node:process";

import { runCommand } from "./playwright-support.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

async function main() {
  const env = {
    ...process.env,
    PATH_PREFIX: "/",
    SITE_URL: "http://127.0.0.1:4173"
  };

  console.log("E2E build context:");
  console.log(`- SITE_URL=${env.SITE_URL}`);
  console.log(`- PATH_PREFIX=${env.PATH_PREFIX}`);

  await runCommand(npmCommand, ["run", "build"], { env });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

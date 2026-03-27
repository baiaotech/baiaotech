import { getPlaywrightRuntimeEnv, runCommand } from "./playwright-support.mjs";

async function main() {
  const args = process.argv.slice(2);
  const env = await getPlaywrightRuntimeEnv();
  await runCommand("npx", ["playwright", ...args], { env });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

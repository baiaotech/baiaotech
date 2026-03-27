import { ensureLocalLinuxLibraries, runCommand } from "./playwright-support.mjs";

async function install() {
  try {
    await runCommand("npx", ["playwright", "install", "--with-deps", "chromium"]);
  } catch (error) {
    if (process.platform !== "linux") {
      throw error;
    }

    console.warn(
      "Falha ao instalar dependencias nativas com sudo; seguindo com instalacao do browser e bootstrap local das libs Linux."
    );
    await runCommand("npx", ["playwright", "install", "chromium"]);
    const localLibDir = await ensureLocalLinuxLibraries();

    if (localLibDir) {
      console.warn(`Bibliotecas locais preparadas em ${localLibDir}.`);
    }
  }
}

install().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

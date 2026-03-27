import { spawn } from "node:child_process";
import { access, mkdir, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

const CACHE_ROOT = path.join(process.cwd(), ".cache", "playwright-linux-libs");
const DEB_DIR = path.join(CACHE_ROOT, "debs");
const EXTRACT_DIR = path.join(CACHE_ROOT, "rootfs");
const LIB_DIR = path.join(EXTRACT_DIR, "usr", "lib", "x86_64-linux-gnu");
const REQUIRED_LIBS = ["libnspr4.so", "libnss3.so", "libnssutil3.so", "libasound.so.2"];
const DEB_PACKAGES = ["libnspr4", "libnss3", "libasound2t64"];

export async function runCommand(command, args, options = {}) {
  const { env = process.env, capture = false, cwd = process.cwd() } = options;

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit"
    });

    let stdout = "";
    let stderr = "";

    if (capture) {
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(`${command} ${args.join(" ")} exited with code ${code}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function systemHasRequiredLinuxLibraries() {
  try {
    const { stdout } = await runCommand("ldconfig", ["-p"], { capture: true });
    return REQUIRED_LIBS.every((lib) => stdout.includes(lib));
  } catch {
    return false;
  }
}

async function localLibsReady() {
  return (
    await Promise.all(REQUIRED_LIBS.map((lib) => fileExists(path.join(LIB_DIR, lib))))
  ).every(Boolean);
}

async function ensureDownloadedDebs() {
  await mkdir(DEB_DIR, { recursive: true });

  const existingDebs = (await readdir(DEB_DIR)).filter((entry) => entry.endsWith(".deb"));
  if (existingDebs.length >= DEB_PACKAGES.length) {
    return;
  }

  await runCommand("apt", ["download", ...DEB_PACKAGES], { cwd: DEB_DIR });
}

async function extractDownloadedDebs() {
  await mkdir(EXTRACT_DIR, { recursive: true });
  const debFiles = (await readdir(DEB_DIR))
    .filter((entry) => entry.endsWith(".deb"))
    .sort();

  for (const debFile of debFiles) {
    await runCommand("dpkg-deb", ["-x", path.join(DEB_DIR, debFile), EXTRACT_DIR]);
  }
}

export async function ensureLocalLinuxLibraries() {
  if (process.platform !== "linux") {
    return null;
  }

  if (await systemHasRequiredLinuxLibraries()) {
    return null;
  }

  if (!(await localLibsReady())) {
    await ensureDownloadedDebs();
    await extractDownloadedDebs();
  }

  if (!(await localLibsReady())) {
    throw new Error("Nao foi possivel preparar as bibliotecas locais do Playwright em Linux.");
  }

  return LIB_DIR;
}

export async function getPlaywrightRuntimeEnv() {
  const env = { ...process.env };

  if (process.platform !== "linux") {
    return env;
  }

  const localLibDir = await ensureLocalLinuxLibraries();

  if (!localLibDir) {
    return env;
  }

  env.LD_LIBRARY_PATH = [localLibDir, env.LD_LIBRARY_PATH].filter(Boolean).join(":");
  return env;
}

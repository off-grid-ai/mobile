#!/usr/bin/env node
/**
 * Phase 3 — Vulkan backend patch for llama.rn
 *
 * Enables GGML_VULKAN=ON in the llama.rn Android native build so that
 * llama.cpp can offload matrix operations to the Adreno 740 GPU via Vulkan.
 *
 * Run automatically after npm install via package.json postinstall.
 * Safe to re-run: all patches are idempotent.
 *
 * Targets:
 *   node_modules/llama.rn/android/CMakeLists.txt
 *     — sets GGML_VULKAN option to ON
 *   node_modules/llama.rn/android/build.gradle  (if present)
 *     — injects -DGGML_VULKAN=ON into cmake arguments block
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LLAMA_RN_ANDROID = path.join(ROOT, 'node_modules', 'llama.rn', 'android');

function log(msg) {
  console.log(`[patch-llama-vulkan] ${msg}`);
}

function warn(msg) {
  console.warn(`[patch-llama-vulkan] WARN: ${msg}`);
}

// ── Patch 1: CMakeLists.txt ───────────────────────────────────────────────────

function patchCMakeLists() {
  const cmakePath = path.join(LLAMA_RN_ANDROID, 'CMakeLists.txt');

  if (!fs.existsSync(cmakePath)) {
    // llama.rn may nest its CMakeLists deeper — search one level down
    const subdirs = fs.existsSync(LLAMA_RN_ANDROID)
      ? fs.readdirSync(LLAMA_RN_ANDROID, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => path.join(LLAMA_RN_ANDROID, d.name, 'CMakeLists.txt'))
      : [];
    const found = subdirs.find(p => fs.existsSync(p));
    if (found) {
      patchCMakeFile(found);
      return;
    }
    warn('CMakeLists.txt not found in node_modules/llama.rn/android — skipping cmake patch');
    warn('Run this script again after npm install completes.');
    return;
  }

  patchCMakeFile(cmakePath);
}

function patchCMakeFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Already patched
    if (content.includes('GGML_VULKAN ON')) {
      log(`CMakeLists already patched: ${filePath}`);
      return;
    }

    // Pattern 1: option(GGML_VULKAN "..." OFF)
    if (content.includes('option(GGML_VULKAN')) {
      content = content.replace(
        /option\s*\(\s*GGML_VULKAN\s+"[^"]*"\s+OFF\s*\)/g,
        'option(GGML_VULKAN "llama: use Vulkan" ON)',
      );
      log(`Patched option(GGML_VULKAN) in ${filePath}`);
    } else if (content.includes('set(GGML_VULKAN')) {
      // Pattern 2: set(GGML_VULKAN OFF ...)
      content = content.replace(
        /set\s*\(\s*GGML_VULKAN\s+OFF([^)]*)\)/g,
        'set(GGML_VULKAN ON$1)',
      );
      log(`Patched set(GGML_VULKAN) in ${filePath}`);
    } else {
      // Pattern 3: no existing GGML_VULKAN option — inject before project() or at top
      const injectLine = 'set(GGML_VULKAN ON CACHE BOOL "Enable Vulkan backend (Adreno 740)" FORCE)\n';
      const projectIdx = content.search(/project\s*\(/);
      if (projectIdx >= 0) {
        content = content.slice(0, projectIdx) + injectLine + content.slice(projectIdx);
      } else {
        content = injectLine + content;
      }
      log(`Injected GGML_VULKAN=ON into ${filePath}`);
    }

    fs.writeFileSync(filePath, content, 'utf8');
  } catch (err) {
    warn(`Failed to patch CMakeLists at ${filePath}: ${err.message}`);
  }
}

// ── Patch 2: build.gradle cmake arguments ────────────────────────────────────

function patchBuildGradle() {
  const gradlePath = path.join(LLAMA_RN_ANDROID, 'build.gradle');

  if (!fs.existsSync(gradlePath)) {
    warn('build.gradle not found in node_modules/llama.rn/android — skipping gradle patch');
    return;
  }

  try {
    let content = fs.readFileSync(gradlePath, 'utf8');

    if (content.includes('-DGGML_VULKAN=ON')) {
      log('build.gradle already has -DGGML_VULKAN=ON');
      return;
    }

    // Inject inside an existing cmake { arguments ... } block
    const cmakeArgsRegex = /(cmake\s*\{[^}]*arguments\s+")([^"]*?)(")/s;
    if (cmakeArgsRegex.test(content)) {
      content = content.replace(cmakeArgsRegex, (_, pre, args, post) => {
        const newArgs = args.includes('-DGGML_VULKAN') ? args : `${args} -DGGML_VULKAN=ON`;
        return `${pre}${newArgs}${post}`;
      });
      log('Appended -DGGML_VULKAN=ON to existing cmake arguments in build.gradle');
    } else if (/externalNativeBuild\s*\{/.test(content)) {
      // Inject new arguments line inside the cmake {} block within externalNativeBuild
      content = content.replace(
        /(externalNativeBuild\s*\{[\s\S]*?cmake\s*\{)([\s\S]*?)(\})/,
        (match, open, body, close) => {
          if (body.includes('arguments')) return match;
          return `${open}${body}            arguments "-DGGML_VULKAN=ON"\n        ${close}`;
        },
      );
      log('Injected cmake arguments -DGGML_VULKAN=ON into build.gradle externalNativeBuild block');
    } else {
      warn(
        'Could not find cmake arguments hook in llama.rn build.gradle.\n' +
        `Manual patch needed: add arguments "-DGGML_VULKAN=ON" inside cmake{} in ${gradlePath}`,
      );
    }

    fs.writeFileSync(gradlePath, content, 'utf8');
  } catch (err) {
    warn(`Failed to patch build.gradle at ${gradlePath}: ${err.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!fs.existsSync(LLAMA_RN_ANDROID)) {
  warn(
    'node_modules/llama.rn/android not found. ' +
    'Vulkan patch will be applied automatically on next npm install.',
  );
  process.exit(0);
}

log('Applying Vulkan backend patch to llama.rn...');
patchCMakeLists();
patchBuildGradle();
log('Done.');

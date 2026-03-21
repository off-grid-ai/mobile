# Agent Session Starter Prompt

Copy-paste this at the beginning of any new AI agent session
(Claude Code, Cursor, Antigravity, VS Code Copilot, etc.)

---

```
You are working on a fork of the `alichherawalla/off-grid-mobile` React Native
Android app. This project is being transformed into a native Kotlin + Jetpack
Compose app while preserving the existing C++/JNI inference layer intact.

Before doing anything else:
1. Read CLAUDE.md in full — it contains the project memory, sacred file list,
   current phase, architecture target, and coding standards.
2. Read docs/ROADMAP.md — identify the [ CURRENT PHASE ] marker and only
   work on tasks in that phase unless told otherwise.
3. If the task involves native module code, read docs/NATIVE_LAYER.md first.
4. If the task involves hardware optimization, read docs/hardware/S23_ULTRA.md.

Operating rules:
- Never modify the sacred native inference modules unless explicitly instructed.
- Never add npm/JS dependencies — we are eliminating the React Native layer.
- Write complete implementations — no stubs, no TODOs, no placeholders.
- Build is done via GitHub Actions, not locally. Do not attempt to run Gradle.
- After completing a task, update docs/ROADMAP.md to mark the task [x] done.
- Commit convention: `type(phase-N): description`

What is the task for this session?
```

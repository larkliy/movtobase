---
number: 22
title: "Кросс-компиляция и CI"
lesson: "22-kross-kompilyatsiya-i-ci"
part: 3
difficulty: 3
tags: ["cross-compilation", "ci"]
description: "Настрой кросс-сборку и CI: 1. Собери простой проект под x86 64-linux-gnu, aarch64-linux-musl, x86 64-windows-gnu. 2. Добавь в build.zig standardTargetOptions и…"
---

Настрой кросс-сборку и CI:

1. Собери простой проект под `x86_64-linux-gnu`, `aarch64-linux-musl`, `x86_64-windows-gnu`.
2. Добавь в `build.zig` `standardTargetOptions` и `standardOptimizeOption`.
3. Напиши GitHub Actions workflow:
   - матрица `ubuntu-latest`, `windows-latest`, `macos-latest`;
   - установка Zig 0.17.0;
   - `zig build test`;
   - `zig build -Doptimize=ReleaseFast`.
4. Добавь шаг кросс-сборки под Linux/macOS/Windows на Ubuntu.
5. Объясни, почему тесты запускаются только на нативной платформе.
6. Дополнительно: добавь кэш `~/.cache/zig` и `zig-cache`.

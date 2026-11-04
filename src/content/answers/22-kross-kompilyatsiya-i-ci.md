---
number: 22
title: "Кросс-компиляция и CI"
lesson: "22-kross-kompilyatsiya-i-ci"
part: 3
difficulty: 3
tags: ["cross-compilation", "ci"]
description: "pub fn build(b: std.Build) void { const target = b.standardTargetOptions(.{}); const optimize = b.standardOptimizeOption(.{});"
---

## `build.zig`

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "app",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    b.installArtifact(exe);
}
```

## Кросс-сборка

```bash
zig build -Dtarget=x86_64-linux-gnu -Doptimize=ReleaseFast
zig build -Dtarget=aarch64-linux-musl -Doptimize=ReleaseFast
zig build -Dtarget=x86_64-windows-gnu -Doptimize=ReleaseFast
```

Артефакты появятся в `zig-out/bin`. Для Linux/macOS можно проверить формат:

```bash
file zig-out/bin/app
```

## GitHub Actions

```yaml
name: build

on:
  push:
  pull_request:

jobs:
  native:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: mlugg/setup-zig@v2
        with:
          version: 0.17.0
      - run: zig build test
      - run: zig build -Doptimize=ReleaseFast

  cross:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mlugg/setup-zig@v2
        with:
          version: 0.17.0
      - run: zig build -Dtarget=x86_64-linux-gnu -Doptimize=ReleaseFast
      - run: zig build -Dtarget=aarch64-linux-musl -Doptimize=ReleaseFast
      - run: zig build -Dtarget=x86_64-windows-gnu -Doptimize=ReleaseFast
```

## Почему тесты только на нативной платформе

`zig build test -Dtarget=...` собирает тестовый бинарник под target, но не может запустить его на другом OS. Для кросс-сборки проверяется только компиляция и линковка. Тесты нужно запускать на нативной ОС (или в эмуляторе/контейнере).

## Кэш

```yaml
      - uses: actions/cache@v4
        with:
          path: |
            ~/.cache/zig
            zig-cache
          key: zig-${{ runner.os }}-${{ hashFiles('build.zig.zon') }}
```

Кэш ускоряет повторные сборки, но иногда маскирует проблемы. Периодически запускайте без кэша.

## Что важно

- `mlugg/setup-zig` - сторонний action; если он недоступен, скачайте Zig вручную.
- Версия Zig фиксируется. `master` нестабилен.
- Для C-зависимостей кросс-сборка требует target-specific библиотеки.
- macOS-бинарники для распространения нужно подписывать.

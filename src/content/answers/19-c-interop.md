---
number: 19
title: "C interop"
lesson: "19-c-interop"
part: 3
difficulty: 3
tags: ["c interop", "ffi"]
description: "int add(int a, int b); int mul(int a, int b);"
---

## Файлы

`include/demo.h`:

```c
#ifndef DEMO_H
#define DEMO_H

int add(int a, int b);
int mul(int a, int b);

#endif
```

`src/demo.c`:

```c
#include "demo.h"

int add(int a, int b) { return a + b; }
int mul(int a, int b) { return a * b; }
```

`src/main.zig`:

```zig
const std = @import("std");
const c = @import("c");

export fn zig_sub(a: i32, b: i32) i32 {
    return a - b;
}

pub fn main() void {
    std.debug.print("add={d} mul={d} sub={d}\n", .{
        c.add(2, 3),
        c.mul(4, 5),
        zig_sub(10, 4),
    });
}
```

`build.zig`:

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const translate = b.addTranslateC(.{
        .root_source_file = b.path("include/demo.h"),
        .target = target,
        .optimize = optimize,
    });
    translate.addIncludePath(b.path("include"));
    const c_module = translate.createModule();

    const exe = b.addExecutable(.{
        .name = "cdemo",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "c", .module = c_module },
            },
        }),
    });
    exe.root_module.addCSourceFile(.{
        .file = b.path("src/demo.c"),
        .flags = &.{"-Iinclude"},
    });
    exe.root_module.link_libc = true;
    b.installArtifact(exe);
}
```

## Почему не `@cImport`

В Zig 0.17 `@cImport` удален. Если попробовать:

```zig
const c = @cImport({ @cInclude("demo.h"); });
```

компилятор скажет `invalid builtin function: '@cImport'`. Замена - `zig translate-c` или build-step `b.addTranslateC`, который генерирует обычный Zig-модуль. Это даже удобнее: сгенерированный код можно читать, кэшировать и отлаживать.

## Статическая библиотека

```bash
zig build-lib src/main.zig -O ReleaseFast
```

На Windows получится `.lib`/`.dll` в зависимости от флагов, на Linux - `.a`/`.so`. Для экспорта функций используйте `export`.

## Что важно

- `translate.addIncludePath` нужен, если заголовок включает другие заголовки из `include/`.
- `addCSourceFile` с `-Iinclude` нужен, чтобы C-компилятор нашел `demo.h`.
- `link_libc = true` обязателен для `printf`/`malloc` и других функций libc.
- Target и `-cflags` при генерации и сборке должны совпадать, иначе ABI разъедется.

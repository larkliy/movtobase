---
number: 12
title: "Сборка проекта и модули"
lesson: "12-sborka-proekta-i-moduli"
part: 2
difficulty: 2
tags: ["build.zig", "modules"]
description: "pub fn cube(x: i32) i32 { return x x x; }"
---

## Структура

```text
proj/
├── build.zig
├── build.zig.zon
└── src/
    ├── main.zig
    └── mathx.zig
```

## `src/mathx.zig`

```zig
pub fn square(x: i32) i32 {
    return x * x;
}

pub fn cube(x: i32) i32 {
    return x * x * x;
}

test "square and cube" {
    const std = @import("std");
    try std.testing.expectEqual(@as(i32, 144), square(12));
    try std.testing.expectEqual(@as(i32, 27), cube(3));
}
```

## `src/main.zig`

```zig
const std = @import("std");
const mathx = @import("mathx");

pub fn main(init: std.process.Init) !void {
    var buffer: [1024]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    try out.interface.print("square(12)={d}\n", .{mathx.square(12)});
    try out.interface.print("cube(3)={d}\n", .{mathx.cube(3)});
    try out.flush();
}
```

## `build.zig`

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const mathx = b.addModule("mathx", .{
        .root_source_file = b.path("src/mathx.zig"),
        .target = target,
        .optimize = optimize,
    });

    const exe = b.addExecutable(.{
        .name = "proj",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "mathx", .module = mathx },
            },
        }),
    });
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    run_cmd.addPassthruArgs();
    const run_step = b.step("run", "Run the app");
    run_step.dependOn(&run_cmd.step);

    const tests = b.addTest(.{ .root_module = mathx });
    const run_tests = b.addRunArtifact(tests);
    const test_step = b.step("test", "Run tests");
    test_step.dependOn(&run_tests.step);
}
```

## `build.zig.zon`

Создайте через `zig init` или добавьте:

```zig
.{
    .name = .proj,
    .version = "0.1.0",
    .minimum_zig_version = "0.17.0",
    .paths = .{""},
    .fingerprint = 0x520c3c9019b7dcad,
}
```

`fingerprint` лучше взять из `zig init` или из подсказки компилятора: он зависит от пакета.

## Команды

```bash
zig build
zig build run
zig build test
zig build -Doptimize=ReleaseFast
zig build -Dtarget=x86_64-linux-gnu
```

## Что важно

- `b.addRunArtifact(exe)` создает шаг запуска, но не запускает его сам. `b.step("run", ...)` делает его доступным.
- `addPassthruArgs()` передает аргументы после `--` в приложение. Старое `b.args` в 0.17 удалено.
- Тесты `mathx` запускаются через `addTest` с корневым модулем `mathx`. Тесты `main` сюда не входят.

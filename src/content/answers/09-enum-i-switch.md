---
number: 9
title: "Enum и switch"
lesson: "09-enum-i-switch"
part: 2
difficulty: 2
tags: ["enums", "switch"]
description: "const Command = enum { run, stop, status, help, };"
---

## Решение

```zig
const std = @import("std");

const Command = enum {
    run,
    stop,
    status,
    help,
};

const ExitCode = enum(u8) {
    ok = 0,
    failure = 1,
    usage = 2,
};

fn parse(s: []const u8) ?Command {
    return std.meta.stringToEnum(Command, s);
}

fn describe(cmd: Command) []const u8 {
    return switch (cmd) {
        .run => "start the service",
        .stop => "stop the service",
        .status => "show current status",
        .help => "print this help",
    };
}

fn usage(out: anytype) !void {
    try out.print("commands: run, stop, status, help\n", .{});
}

pub fn main(init: std.process.Init) !u8 {
    var buffer: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    var args = try std.process.Args.Iterator.initAllocator(init.minimal.args, init.gpa);
    defer args.deinit();
    _ = args.next();

    const raw = args.next() orelse {
        try usage(&out.interface);
        try out.flush();
        return @intFromEnum(ExitCode.usage);
    };

    const cmd = parse(raw) orelse {
        try out.interface.print("unknown command: {s}\n", .{raw});
        try usage(&out.interface);
        try out.flush();
        return @intFromEnum(ExitCode.usage);
    };

    try out.interface.print("{s}: {s}\n", .{ @tagName(cmd), describe(cmd) });
    try out.flush();
    return @intFromEnum(ExitCode.ok);
}
```

## Что важно

- `std.meta.stringToEnum` возвращает `?Command`, поэтому неизвестная строка - это `null`, а не ошибка. Вызывающий сам решает, что делать.
- `describe` без `else`: если добавить `.restart` в `Command`, компилятор потребует новую ветку.
- `@intFromEnum` превращает `ExitCode` в `u8` для `main`.
- `usage` принимает `anytype`, чтобы работать с `Io.Writer` и не зависеть от конкретного writer'а.

## Проверка

```bash
zig run main.zig -- status   # status: show current status
zig run main.zig             # usage, код 2
zig run main.zig -- nope     # unknown command, код 2
```

На Windows код выхода: `$LASTEXITCODE`, в bash: `echo $?`.

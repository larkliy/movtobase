---
number: 4
title: "Ошибки и их обработка"
lesson: "04-oshibki"
part: 1
difficulty: 1
tags: ["errors", "try/catch"]
description: "fn divide(a: u32, b: u32) error{DivideByZero}!u32 { if (b == 0) return error.DivideByZero; return a / b; }"
---

## Набросок

```zig
const std = @import("std");

fn divide(a: u32, b: u32) error{DivideByZero}!u32 {
    if (b == 0) return error.DivideByZero;
    return a / b;
}

fn findDigit(s: []const u8, target: u8) !usize {
    return std.mem.indexOfScalar(u8, s, target) orelse error.NotFound;
}

pub fn main(init: std.process.Init) !void {
    var buffer: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    const ok = try divide(10, 2);
    try out.interface.print("10/2 = {d}\n", .{ok});

    const div = divide(10, 0) catch |err| blk: {
        try out.interface.print("divide failed: {s}\n", .{@errorName(err)});
        break :blk 0;
    };
    try out.interface.print("fallback div = {d}\n", .{div});

    const idx = findDigit("hello 42", '4') catch |err| blk: {
        try out.interface.print("find failed: {s}\n", .{@errorName(err)});
        break :blk 0;
    };
    try out.interface.print("digit at index {d}\n", .{idx});

    try out.flush();
}
```

Совет: обрати внимание на `orelse error.NotFound` во втором пункте - `indexOfScalar` возвращает `?usize` (опциональный индекс), и через `orelse` мы превращаем "не найдено" в ошибку. Попробуй переписать `divide` так, чтобы деление происходило через `std.math.divTrunc` или `@divTrunc`, и сравни поведение при `b == 0`.

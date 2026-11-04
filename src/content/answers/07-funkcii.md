---
number: 7
title: "Функции"
lesson: "07-funkcii"
part: 1
difficulty: 1
tags: ["functions", "scope"]
description: "fn max2(comptime T: type, a: T, b: T) T { return if (a b) a else b; }"
---

## Набросок

```zig
const std = @import("std");

fn max2(comptime T: type, a: T, b: T) T {
    return if (a > b) a else b;
}

fn apply(f: *const fn (i32) i32, x: i32) i32 {
    return f(x);
}

fn square(x: i32) i32 {
    return x * x;
}

fn triple(value: anytype) @TypeOf(value) {
    return value * 3;
}

pub fn main(init: std.process.Init) !void {
    var buffer: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    try out.interface.print("max2 u8: {d}\n", .{max2(u8, 3, 9)});
    try out.interface.print("max2 i32: {d}\n", .{max2(i32, -5, 2)});

    try out.interface.print("apply square: {d}\n", .{apply(&square, 7)});

    try out.interface.print("triple u8: {d}\n", .{triple(@as(u8, 5))});
    try out.interface.print("triple f32: {d}\n", .{triple(@as(f32, 2.5))});

    try out.flush();
}
```

Совет: попробуй заменить `if (a > b) a else b` внутри `max2` на `@max(a, b)` из стандартной библиотеки и сравни. А для `triple` попробуй передать строку - сломалось на этапе компиляции? Как думаешь, почему и что говорит ошибка?

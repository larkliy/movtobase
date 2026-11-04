---
number: 6
title: "Циклы while и for"
lesson: "06-cikly"
part: 1
difficulty: 1
tags: ["loops", "while/for"]
description: "pub fn main(init: std.process.Init) !void { var buffer: [4096]u8 = undefined; var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);"
---

## Набросок

```zig
const std = @import("std");

pub fn main(init: std.process.Init) !void {
    var buffer: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    // 1. степени двойки
    var pow: u32 = 1;
    while (pow < 100) : (pow *= 2) {
        try out.interface.print("{d} ", .{pow});
    }
    try out.interface.print("\n", .{});

    // 2. индекс максимума
    const nums = [_]i32{ 3, 7, 2, 9, 4 };
    var max_i: usize = 0;
    for (nums, 0..) |item, i| {
        if (item > nums[max_i]) max_i = i;
    }
    try out.interface.print("max at index {d}\n", .{max_i});

    // 3. скалярное произведение
    const a = [_]i32{ 1, 2, 3 };
    const b = [_]i32{ 4, 5, 6 };
    var dot: i32 = 0;
    for (a, b) |x, y| {
        dot += x * y;
    }
    try out.interface.print("dot = {d}\n", .{dot});

    // 4. поиск кратного 7 с меткой
    const rows = [_][3]i32{
        .{ 1, 2, 3 },
        .{ 4, 5, 6 },
        .{ 7, 8, 9 },
    };
    outer: for (rows, 0..) |row, r| {
        for (row, 0..) |val, c| {
            if (@rem(val, 7) == 0) {
                try out.interface.print("found {d} at row {d} col {d}\n", .{ val, r, c });
                break :outer;
            }
        }
    }

    try out.flush();
}
```

Совет: перепиши пункт 2 без переменной `max_i`, используя `std.mem.indexOfMax` из стандартной библиотеки, и сравни. А в пункте 4 замени помеченный `break` на обход без метки и посмотри, почему без метки выйти сразу из обоих циклов не получится.

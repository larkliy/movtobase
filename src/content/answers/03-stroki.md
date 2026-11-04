---
number: 3
title: "Строки"
lesson: "03-stroki"
part: 1
difficulty: 1
tags: ["strings", "memory"]
description: "pub fn main(init: std.process.Init) !void { var buffer: [4096]u8 = undefined; var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);"
---

## Набросок

```zig
const std = @import("std");

pub fn main(init: std.process.Init) !void {
    var buffer: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    // 1. trim + split
    const line = std.mem.trim(u8, "  banana, apple, cherry  ", " ");
    var parts = std.mem.splitScalar(u8, line, ',');
    while (parts.next()) |part| {
        const clean = std.mem.trim(u8, part, " ");
        try out.interface.print("fruit: [{s}]\n", .{clean});
    }

    // 2. подсчет подстроки
    var count: usize = 0;
    var start: usize = 0;
    while (std.mem.indexOf(u8, "banana"[start..], "na")) |found| {
        count += 1;
        start += found + 1;
    }
    try out.interface.print("'na' in 'banana': {d}\n", .{count});

    // 3. форматирование в буфер
    var small: [64]u8 = undefined;
    const summary = try std.mem.print(&small, "found {d} 'na'", .{count});
    try out.interface.print("summary: {s}\n", .{summary});

    try out.flush();
}
```

Совет про второй пункт: тут удобнее не `indexOf` по кускам, а один линейный проход `std.mem.indexOfPos` со стартовой позицией. Попробуй переписать через него и сравни, что выйдет короче.

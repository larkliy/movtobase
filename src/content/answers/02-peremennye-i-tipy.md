---
number: 2
title: "Переменные и их типы"
lesson: "02-peremennye-i-tipy"
part: 1
difficulty: 1
tags: ["types", "integers"]
description: "pub fn main(init: std.process.Init) !void { var buffer: [4096]u8 = undefined; var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);"
---

## Набросок

```zig
const std = @import("std");

pub fn main(init: std.process.Init) !void {
    var buffer: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    try out.interface.print("u8:  size={d} max={d}\n", .{ @sizeOf(u8), std.math.maxInt(u8) });
    try out.interface.print("u16: size={d} max={d}\n", .{ @sizeOf(u16), std.math.maxInt(u16) });
    try out.interface.print("u32: size={d} max={d}\n", .{ @sizeOf(u32), std.math.maxInt(u32) });
    try out.interface.print("u64: size={d} max={d}\n", .{ @sizeOf(u64), std.math.maxInt(u64) });

    const n: u16 = 300;
    const truncated: u8 = @truncate(n);
    try out.interface.print("300 -> u8 truncate = {d}\n", .{truncated});

    // const checked: u8 = @intCast(n); // раскомментируй и посмотри панику

    try out.flush();
}
```

Подсказка про `@intCast`: он не даст тебе вывести 300 как u8 - программа упадет с паникой "integer does not fit in destination type". Это и есть тот самый явный контроль, которого не хватает в C.

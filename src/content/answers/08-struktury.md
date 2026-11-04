---
number: 8
title: "Структуры"
lesson: "08-struktury"
part: 1
difficulty: 1
tags: ["structs", "methods"]
description: "const Rectangle = struct { width: u32, height: u32,"
---

## Набросок

```zig
const std = @import("std");

const Rectangle = struct {
    width: u32,
    height: u32,

    fn area(self: Rectangle) u32 {
        return self.width * self.height;
    }
};

const Config = struct {
    port: u16 = 8080,
    host: []const u8 = "localhost",
};

const Normal = struct { x: u8, y: u32, z: u8 };
const External = extern struct { x: u8, y: u32, z: u8 };

pub fn main(init: std.process.Init) !void {
    var buffer: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    const r = Rectangle{ .width = 3, .height = 4 };
    try out.interface.print("area = {d}\n", .{r.area()});

    const default_cfg = Config{};
    const custom_cfg = Config{ .port = 9000 };
    try out.interface.print("default: {s}:{d}\n", .{ default_cfg.host, default_cfg.port });
    try out.interface.print("custom:  {s}:{d}\n", .{ custom_cfg.host, custom_cfg.port });

    try out.interface.print("normal size = {d}, extern size = {d}\n", .{ @sizeOf(Normal), @sizeOf(External) });

    try out.flush();
}
```

Совет: добавь в `Rectangle` метод `scale(self: *Rectangle, factor: u32) void`, который умножает ширину и высоту, и вызови его на `var`-экземпляре. Потом попробуй вызвать на `const`-экземпляре и посмотри на ошибку.

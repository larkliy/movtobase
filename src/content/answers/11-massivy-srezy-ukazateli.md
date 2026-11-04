---
number: 11
title: "Массивы, срезы и указатели"
lesson: "11-massivy-srezy-ukazateli"
part: 2
difficulty: 2
tags: ["slices", "pointers"]
description: "const Header = extern struct { magic: u16, len: u32, };"
---

## Решение

```zig
const std = @import("std");

const Header = extern struct {
    magic: u16,
    len: u32,
};

pub fn main(init: std.process.Init) !void {
    var buffer: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    var packet = [_]u8{ 0x4d, 0x5a, 0x02, 0x00, 0x10, 0x00, 0x00, 0x00 };

    const magic = std.mem.readInt(u16, packet[0..2], .little);
    const len = std.mem.readInt(u32, packet[2..6], .little);
    const payload = packet[6..];

    const many: [*]const u8 = @ptrCast(&packet);
    const third = many[2];

    try out.interface.print("magic=0x{x} len={d} payload_len={d} third={d}\n", .{
        magic,
        len,
        payload.len,
        third,
    });

    try out.interface.print("size={d} align_u32={d} offset_len={d}\n", .{
        @sizeOf(@TypeOf(packet)),
        @alignOf(u32),
        @offsetOf(Header, "len"),
    });

    try out.flush();
}
```

## Разбор

- `std.mem.readInt` читает целое из байтов с явным endian. Это безопаснее, чем `@ptrCast`, потому что не требует выравнивания.
- `packet[2..6]` - срез из четырех байт. Правая граница не включается.
- `@ptrCast(&packet)` превращает `*[8]u8` в `[*]const u8`. Длина теряется, поэтому `many[2]` не проверяется.
- `@offsetOf(Header, "len")` для `extern struct` обычно 4: `u16` + 2 байта padding, затем `u32`.
- `@sizeOf(Header)` обычно 8 из-за выравнивания `u32`.

## Про `@alignCast`

Если бы мы захотели `*u32` на `&packet[0]`, адрес массива не гарантирует кратность 4:

```zig
// const p: *u32 = @ptrCast(&packet[0]); // может не собраться
const p: *align(1) u32 = @ptrCast(&packet[0]); // явно говорим: выравнивание 1
```

Для настоящего `*u32` нужен `@alignCast`, но только если ты гарантируешь выравнивание (например, `var packet: [8]u8 align(4)`). В этой задаче безопаснее `readInt`.

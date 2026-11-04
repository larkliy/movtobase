---
number: 14
title: "Аллокаторы и владение памятью"
lesson: "14-allokatory-i-vladenie-pamyatyu"
part: 2
difficulty: 2
tags: ["allocators", "memory"]
description: "fn join(allocator: std.mem.Allocator, parts: []const []const u8, sep: []const u8) ![]u8 { var list: std.ArrayList(u8) = .empty; errdefer list.deinit(allocator);"
---

## Решение

```zig
const std = @import("std");

fn join(allocator: std.mem.Allocator, parts: []const []const u8, sep: []const u8) ![]u8 {
    var list: std.ArrayList(u8) = .empty;
    errdefer list.deinit(allocator);

    for (parts, 0..) |part, i| {
        if (i != 0) try list.appendSlice(allocator, sep);
        try list.appendSlice(allocator, part);
    }

    return list.toOwnedSlice(allocator);
}

fn joinFixed(buffer: []u8, parts: []const []const u8, sep: []const u8) ![]u8 {
    var fba = std.heap.FixedBufferAllocator.init(buffer);
    return join(fba.allocator(), parts, sep);
}

pub fn main(init: std.process.Init) !void {
    var out_buf: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &out_buf);
    const gpa = init.gpa;

    const parts = [_][]const u8{ "one", "two", "three" };

    const joined = try join(gpa, &parts, ", ");
    defer gpa.free(joined);
    try out.interface.print("gpa: {s}\n", .{joined});

    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const arena_joined = try join(arena.allocator(), &parts, " | ");
    try out.interface.print("arena: {s}\n", .{arena_joined});

    var fixed_buf: [256]u8 = undefined;
    const fixed = try joinFixed(&fixed_buf, &parts, "-");
    try out.interface.print("fixed: {s}\n", .{fixed});

    try out.flush();
}
```

## Разбор

- `errdefer list.deinit(allocator)` освобождает буфер, если `appendSlice` вернул ошибку. При успехе `toOwnedSlice` передает владение вызывающему.
- `join` не знает, какой аллокатор ему передали. Один и тот же код работает с GPA, ареной и `FixedBufferAllocator`.
- Арена освобождает все выделения через `deinit`. Отдельный `free` для `arena_joined` не нужен и не должен вызываться.
- `joinFixed` использует `FixedBufferAllocator`, который не обращается к куче. Если 64 байта не хватит, вернется `error.OutOfMemory`.
- В `main` для `gpa` стоит `defer gpa.free(joined)`, для арены - `defer arena.deinit()`, для fixed - ничего, потому что память на стеке.

## Проверка утечек

Запустите под `DebugAllocator`:

```bash
zig run main.zig
```

Если забыть `defer gpa.free(joined)`, в конце программа сообщит об утечке. Для тестов используйте `std.testing.allocator`.

## Дополнительно

Если `toOwnedSlice` вернул ошибку, список остается валидным и `errdefer` освободит его. Это важное свойство: не вызывайте `deinit` вручную после ошибки, иначе будет double free.

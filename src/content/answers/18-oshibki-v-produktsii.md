---
number: 18
title: "Ошибки в продакшене"
lesson: "18-oshibki-v-produktsii"
part: 3
difficulty: 3
tags: ["errors", "production"]
description: "fn loadOnce(io: std.Io, gpa: std.mem.Allocator, path: []const u8) ![]u8 { const file = try std.Io.Dir.cwd().openFile(io, path, .{}); defer file.close(io);"
---

## Решение

```zig
const std = @import("std");

fn loadOnce(io: std.Io, gpa: std.mem.Allocator, path: []const u8) ![]u8 {
    const file = try std.Io.Dir.cwd().openFile(io, path, .{});
    defer file.close(io);

    var buf: [4096]u8 = undefined;
    var reader = file.readerStreaming(io, &buf);
    return reader.interface.allocRemaining(gpa, .limited(1 << 20));
}

fn loadWithRetry(io: std.Io, gpa: std.mem.Allocator, path: []const u8, attempts: usize) ![]u8 {
    var last_err: anyerror = error.TooManyAttempts;

    var i: usize = 0;
    while (i < attempts) : (i += 1) {
        const data = loadOnce(io, gpa, path) catch |err| switch (err) {
            error.FileNotFound => return error.NotFound,
            else => {
                last_err = err;
                continue;
            },
        };
        return data;
    }
    return last_err;
}

fn slow(io: std.Io) std.Io.Cancelable!void {
    try std.Io.sleep(io, std.Io.Duration.fromSeconds(10), .awake);
}

pub fn main(init: std.process.Init) !u8 {
    var out_buf: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &out_buf);
    const gpa = init.gpa;

    var args = try std.process.Args.Iterator.initAllocator(init.minimal.args, gpa);
    defer args.deinit();
    _ = args.next();
    const path = args.next() orelse "input.txt";

    const data = loadWithRetry(init.io, gpa, path, 3) catch |err| {
        try out.interface.print("load failed: {s}\n", .{@errorName(err)});
        try out.flush();
        return 1;
    };
    defer gpa.free(data);

    try out.interface.print("loaded {d} bytes\n", .{data.len});
    try out.flush();

    var future = try std.Io.concurrent(init.io, slow, .{init.io});
    try std.Io.sleep(init.io, std.Io.Duration.fromMilliseconds(20), .awake);
    const canceled = future.cancel(init.io);
    if (canceled == error.Canceled) {
        try out.interface.print("operation canceled\n", .{});
        try out.flush();
        return 2;
    }

    return 0;
}
```

## Разбор

- `loadOnce` возвращает ошибку открытия или чтения. Ресурсы освобождаются через `defer`/`errdefer` внутри `allocRemaining` (он сам освобождает буфер при ошибке).
- `loadWithRetry` различает `FileNotFound` (сразу наверх) и остальные ошибки (повторяет попытку). Конкретный набор временных ошибок зависит от платформы, поэтому здесь используется `anyerror` для сохранения последней причины.
- После `attempts` возвращается последняя ошибка или `TooManyAttempts`, если попыток не было.
- `slow` возвращает `Cancelable!void`. `Io.concurrent` запускает ее, `Future.cancel` запрашивает отмену и ждет.
- `error.Canceled` обрабатывается явно и дает код выхода `2`.

## Почему `catch unreachable` неуместен

`unreachable` - это обещание, что ошибки не будет. В загрузчике файл может исчезнуть, диск может вернуть `WouldBlock`, а операция может быть отменена. Если обещание нарушится, в safe-режиме будет паника, а в release - UB. Для внешних операций всегда обрабатывайте ошибки.

## Проверка

```bash
zig run main.zig -- no-such-file.txt   # load failed: NotFound, код 1
zig run main.zig -- main.zig           # loaded N bytes, затем canceled, код 2
```

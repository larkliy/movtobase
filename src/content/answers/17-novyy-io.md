---
number: 17
title: "Новый I/O в Zig 0.17"
lesson: "17-novyy-io"
part: 3
difficulty: 3
tags: ["io", "std.Io"]
description: "const Counts = struct { lines: usize = 0, words: usize = 0, bytes: usize = 0, };"
---

## Решение

```zig
const std = @import("std");

const Counts = struct {
    lines: usize = 0,
    words: usize = 0,
    bytes: usize = 0,
};

fn countReader(reader: *std.Io.Reader) !Counts {
    var counts: Counts = .{};
    var in_word = false;

    while (true) {
        const byte = reader.takeByte() catch |err| switch (err) {
            error.EndOfStream => break,
            else => return err,
        };
        counts.bytes += 1;
        if (byte == '\n') counts.lines += 1;

        const is_space = byte == ' ' or byte == '\t' or byte == '\r' or byte == '\n';
        if (!is_space and !in_word) {
            counts.words += 1;
            in_word = true;
        } else if (is_space) {
            in_word = false;
        }
    }
    return counts;
}

pub fn main(init: std.process.Init) !u8 {
    var out_buf: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &out_buf);
    const gpa = init.gpa;

    var args = try std.process.Args.Iterator.initAllocator(init.minimal.args, gpa);
    defer args.deinit();
    _ = args.next();

    var file_buf: [8192]u8 = undefined;
    var counts: Counts = undefined;

    if (args.next()) |path| {
        const file = std.Io.Dir.cwd().openFile(init.io, path, .{}) catch |err| {
            try out.interface.print("open failed: {s}\n", .{@errorName(err)});
            try out.flush();
            return 1;
        };
        defer file.close(init.io);

        var reader = file.readerStreaming(init.io, &file_buf);
        counts = countReader(&reader.interface) catch |err| {
            try out.interface.print("read failed: {s}\n", .{@errorName(err)});
            try out.flush();
            return 1;
        };
    } else {
        var reader = std.Io.File.stdin().readerStreaming(init.io, &file_buf);
        counts = countReader(&reader.interface) catch |err| {
            try out.interface.print("stdin failed: {s}\n", .{@errorName(err)});
            try out.flush();
            return 1;
        };
    }

    try out.interface.print("{d} {d} {d}\n", .{ counts.lines, counts.words, counts.bytes });
    try out.flush();
    return 0;
}
```

## Разбор

- `takeByte` возвращает `error.EndOfStream` в конце. Это нормальное завершение, а не ошибка.
- `in_word` позволяет считать слова без `split`: слово начинается на первом непробельном байте.
- Файл и stdin используют один и тот же `countReader`, потому что оба дают `Io.Reader`.
- `file.close(init.io)` обязателен. `defer` сработает при любом выходе.
- Код выхода: `0` - успех, `1` - ошибка.

## Проверка

```bash
echo "hello world" > test.txt
zig run wc.zig -- test.txt
printf "a b\nc" | zig run wc.zig
```

## Дополнительно: флаги

Для `-l`, `-w`, `-c` разберите аргументы до файла:

```zig
var show_lines = false;
var show_words = false;
var show_bytes = false;

while (args.next()) |arg| {
    if (std.mem.eql(u8, arg, "-l")) show_lines = true
    else if (std.mem.eql(u8, arg, "-w")) show_words = true
    else if (std.mem.eql(u8, arg, "-c")) show_bytes = true
    else break;
}
```

Если ни один флаг не задан, печатайте все три.

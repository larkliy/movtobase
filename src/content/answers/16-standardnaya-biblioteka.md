---
number: 16
title: "Стандартная библиотека на практике"
lesson: "16-standardnaya-biblioteka"
part: 2
difficulty: 2
tags: ["std", "json"]
description: "const WordCount = struct { word: []const u8, count: usize, };"
---

## Решение

```zig
const std = @import("std");

const WordCount = struct {
    word: []const u8,
    count: usize,
};

fn lessThan(_: void, a: WordCount, b: WordCount) bool {
    if (a.count != b.count) return a.count > b.count;
    return std.mem.lessThan(u8, a.word, b.word);
}

fn isWordChar(b: u8) bool {
    return std.ascii.isAlphanumeric(b) or b >= 0x80;
}

pub fn main(init: std.process.Init) !void {
    var out_buf: [8192]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &out_buf);
    const gpa = init.gpa;

    var args = try std.process.Args.Iterator.initAllocator(init.minimal.args, gpa);
    defer args.deinit();
    _ = args.next();
    const path = args.next() orelse "input.txt";

    const start = std.Io.Clock.Timestamp.now(init.io, .awake);

    const data = std.Io.Dir.cwd().readFileAlloc(init.io, path, gpa, .limited(1 << 20)) catch |err| {
        try out.interface.print("read failed: {s}\n", .{@errorName(err)});
        try out.flush();
        return;
    };
    defer gpa.free(data);

    var counts = std.StringHashMap(usize).init(gpa);
    defer {
        var keys = counts.keyIterator();
        while (keys.next()) |key| gpa.free(key.*);
        counts.deinit();
    }

    var i: usize = 0;
    while (i < data.len) {
        while (i < data.len and !isWordChar(data[i])) i += 1;
        const start_word = i;
        while (i < data.len and isWordChar(data[i])) i += 1;
        if (start_word == i) continue;

        const raw = data[start_word..i];
        const key = try gpa.dupe(u8, raw);
        const gop = try counts.getOrPut(key);
        if (gop.found_existing) {
            gpa.free(key);
        } else {
            gop.value_ptr.* = 0;
        }
        gop.value_ptr.* += 1;
    }

    var list: std.ArrayList(WordCount) = .empty;
    defer list.deinit(gpa);
    var it = counts.iterator();
    while (it.next()) |kv| {
        try list.append(gpa, .{ .word = kv.key_ptr.*, .count = kv.value_ptr.* });
    }
    std.mem.sort(WordCount, list.items, {}, lessThan);

    const elapsed = start.untilNow(init.io);
    try out.interface.print("words={d} elapsed_ms={d}\n", .{
        counts.count(),
        @divTrunc(elapsed.raw.nanoseconds, std.time.ns_per_ms),
    });

    const top = @min(list.items.len, 10);
    for (list.items[0..top]) |item| {
        try out.interface.print("{s}: {d}\n", .{ item.word, item.count });
    }
    try out.flush();
}
```

## Разбор

- `readFileAlloc` принимает лимит `1 << 20` (1 МиБ). Это защита от случайного гигантского файла.
- `isWordChar` считает байты `>= 0x80` частью слова. Это грубая эвристика для UTF-8: кириллица состоит из байтов `>= 0x80`, поэтому слово не разрывается. Но `std.mem` не понимает Unicode-границы; для полноценной работы нужен `std.unicode`.
- Ключи `dupe` и освобождаются в `defer`. Без этого таблица ссылалась бы на `data`, а после `free(data)` это была бы висячая память.
- `std.mem.sort` сортирует по убыванию частоты, при равенстве - по алфавиту.
- Время измеряется через `std.Io.Clock.Timestamp`, потому что `std.time.Timer` в 0.17 удален.

## JSON-вывод

Если нужен JSON, соберите структуру:

```zig
const Report = struct {
    words: usize,
    elapsed_ms: i64,
    top: []const WordCount,
};

const report = Report{
    .words = counts.count(),
    .elapsed_ms = @divTrunc(elapsed.raw.nanoseconds, std.time.ns_per_ms),
    .top = list.items[0..top],
};

try out.interface.print("{f}\n", .{std.json.fmt(report, .{})});
```

`WordCount` сериализуется как объект с полями `word` и `count`.

## Проверка

```bash
zig run main.zig -- somefile.txt
```

Попробуйте файл с кириллицей и объясните, почему `len` в байтах больше, чем количество символов.

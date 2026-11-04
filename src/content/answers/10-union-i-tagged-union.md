---
number: 10
title: "Union и tagged union"
lesson: "10-union-i-tagged-union"
part: 2
difficulty: 2
tags: ["unions", "tagged union"]
description: "const Result = union(enum) { ok: []const u8, err: []const u8, empty, };"
---

## Решение

```zig
const std = @import("std");

const Result = union(enum) {
    ok: []const u8,
    err: []const u8,
    empty,
};

fn parse(raw: []const u8) Result {
    if (std.mem.startsWith(u8, raw, "ok:")) return .{ .ok = raw[3..] };
    if (std.mem.startsWith(u8, raw, "err:")) return .{ .err = raw[4..] };
    return .empty;
}

fn printResult(result: Result, writer: *std.Io.Writer) !void {
    try writer.print("tag={s} ", .{@tagName(std.meta.activeTag(result))});
    switch (result) {
        .ok => |text| try writer.print("OK: {s}\n", .{text}),
        .err => |text| try writer.print("ERROR: {s}\n", .{text}),
        .empty => try writer.print("EMPTY\n", .{}),
    }
}

pub fn main(init: std.process.Init) !void {
    var buffer: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    const inputs = [_][]const u8{
        "ok:all good",
        "err:something failed",
        "unknown",
    };

    for (inputs) |raw| try printResult(parse(raw), &out.interface);
    try out.flush();
}
```

## Почему не bare union

`union` без тега не хранит, какой вариант активен. В `parse` мы возвращаем разные варианты, и вызывающий должен знать, что именно пришло. Без тега пришлось бы отдельно возвращать enum-тег и синхронизировать его с payload вручную. `union(enum)` делает это за нас и проверяет доступ.

`std.meta.activeTag(result)` возвращает тег, не разворачивая payload. `@tagName` превращает его в строку.

## Проверка

```bash
zig run main.zig
```

Ожидаемый вывод:

```text
tag=ok OK: all good
tag=err ERROR: something failed
tag=empty EMPTY
```

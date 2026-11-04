---
number: 15
title: "Comptime и рефлексия"
lesson: "15-comptime-i-refleksiya"
part: 2
difficulty: 2
tags: ["comptime", "reflection"]
description: "fn maxOf(comptime T: type, a: T, b: T) T { return if (a b) a else b; }"
---

## Решение

```zig
const std = @import("std");

fn maxOf(comptime T: type, a: T, b: T) T {
    return if (a > b) a else b;
}

fn Vec(comptime T: type) type {
    return struct {
        x: T,
        y: T,

        const Self = @This();

        fn add(a: Self, b: Self) Self {
            return .{ .x = a.x + b.x, .y = a.y + b.y };
        }
    };
}

fn requireInt(comptime T: type) void {
    switch (@typeInfo(T)) {
        .int => {},
        else => @compileError("expected an integer type, found " ++ @typeName(T)),
    }
}

fn dump(comptime T: type, value: T) void {
    inline for (@typeInfo(T).@"struct".field_names) |name| {
        std.debug.print("{s}={any}\n", .{ name, @field(value, name) });
    }
}

const Point = struct { x: i32, y: i32 };

pub fn main() void {
    std.debug.print("max={d}\n", .{maxOf(u8, 3, 7)});

    const V = Vec(i32);
    const v = V.add(.{ .x = 1, .y = 2 }, .{ .x = 3, .y = 4 });
    std.debug.print("v=({d},{d})\n", .{ v.x, v.y });

    const p = Point{ .x = 10, .y = 20 };
    dump(Point, p);

    requireInt(u8);
    std.debug.print("has x: {}\n", .{@hasField(Point, "x")});
    std.debug.print("type: {s}\n", .{@typeName(Point)});
}
```

## Разбор

- `maxOf` компилируется отдельно для `u8`, `i32`, `f32` и т.д. Сравнение `>` должно быть допустимо для типа.
- `Vec(T)` возвращает новый тип. `const Self = @This()` ссылается на сгенерированную структуру.
- `requireInt` использует `@compileError` с сообщением и `@typeName(T)`. Ошибка возникает при инстанцировании, а не в runtime.
- `dump` проходит по `field_names` через `inline for`. `@field(value, name)` требует comptime-имя, но `name` из `field_names` как раз comptime.
- `@hasField` и `@typeName` - примеры рефлексии, доступной без runtime-затрат (если результат используется в comptime).

## Почему `requireInt(f32)` не собирается

```zig
requireInt(f32);
```

Компилятор инстанцирует `requireInt` с `T = f32`, видит `@typeInfo(f32)` вариант `.float`, выполняет `@compileError`. Это происходит до запуска программы, поэтому ошибка видна сразу.

## Дополнительно

Попробуйте `dump` с вложенной структурой:

```zig
const Line = struct { a: Point, b: Point };
```

`@field` вернет `Point`, а `{any}` напечатает его через встроенный форматтер. Для красивого вывода можно рекурсивно вызывать `dump`, но не забудьте про защиту от циклов.

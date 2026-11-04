---
number: 13
title: "Тесты и отладка"
lesson: "13-testy-i-otladka"
part: 2
difficulty: 2
tags: ["testing", "debugging"]
description: "fn countChar(s: []const u8, ch: u8) usize { var count: usize = 0; for (s) b if (b == ch) { count += 1; }; return count; }"
---

## Решение

```zig
const std = @import("std");
const testing = std.testing;

fn countChar(s: []const u8, ch: u8) usize {
    var count: usize = 0;
    for (s) |b| if (b == ch) {
        count += 1;
    };
    return count;
}

fn trimAlloc(allocator: std.mem.Allocator, s: []const u8) ![]u8 {
    return allocator.dupe(u8, std.mem.trim(u8, s, " \t\r\n"));
}

fn parsePositive(s: []const u8) !u32 {
    const value = std.fmt.parseInt(u32, s, 10) catch |err| switch (err) {
        error.InvalidCharacter => return error.Invalid,
        error.Overflow => return error.Overflow,
    };
    return value;
}

test "countChar" {
    try testing.expectEqual(@as(usize, 0), countChar("", 'a'));
    try testing.expectEqual(@as(usize, 1), countChar("a", 'a'));
    try testing.expectEqual(@as(usize, 3), countChar("banana", 'a'));
    try testing.expectEqual(@as(usize, 0), countChar("banana", 'z'));
}

test "trimAlloc no leaks" {
    const result = try trimAlloc(testing.allocator, "  hello \t\r\n");
    defer testing.allocator.free(result);
    try testing.expectEqualStrings("hello", result);
}

test "parsePositive" {
    try testing.expectEqual(@as(u32, 42), try parsePositive("42"));
    try testing.expectError(error.Invalid, parsePositive("4x"));
    try testing.expectError(error.Overflow, parsePositive("999999999999999999999"));
}

test "debug output goes to stderr" {
    std.debug.print("this goes to stderr\n", .{});
    try testing.expect(true);
}
```

## Разбор

- `countChar` использует `for` по байтам. Синтаксис `if (...) { ... };` с точкой с запятой корректен, но для читаемости лучше обычный блок.
- `trimAlloc` возвращает новую строку. Вызывающий владеет ею и обязан освободить.
- `parsePositive` переводит ошибки `parseInt` в собственные `error.Invalid`/`error.Overflow`. Это делает контракт функции явным.
- `testing.allocator` в `trimAlloc` проверяет, что `free` вызван. Если убрать `defer`, тест упадет с отчетом об утечке.
- `std.debug.print` пишет в stderr, поэтому его вывод не смешивается с обычным stdout и виден в тестах.

## Запуск

```bash
zig test main.zig
zig test main.zig --test-filter trim
zig build test
```

## Дополнительно

`std.testing.checkAllAllocationFailures` можно применить к функции, которая принимает аллокатор:

```zig
test "allocation failures" {
    try testing.checkAllAllocationFailures(testing.allocator, testFn, .{});
}

fn testFn(allocator: std.mem.Allocator) !void {
    const s = try trimAlloc(allocator, "  hello  ");
    allocator.free(s);
}
```

Он проверяет, что при отказе на любом шаге код не течет.

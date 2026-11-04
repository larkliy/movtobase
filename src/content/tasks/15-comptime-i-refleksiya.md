---
number: 15
title: "Comptime и рефлексия"
lesson: "15-comptime-i-refleksiya"
part: 2
difficulty: 2
tags: ["comptime", "reflection"]
description: "Напиши compile-time утилиты: 1. fn maxOf(comptime T: type, a: T, b: T) T - возвращает большее. 2. fn Vec(comptime T: type) type - структура с x: T, y: T и методом add…"
---

Напиши compile-time утилиты:

1. `fn maxOf(comptime T: type, a: T, b: T) T` - возвращает большее.
2. `fn Vec(comptime T: type) type` - структура с `x: T`, `y: T` и методом `add`.
3. `fn dump(comptime T: type, value: T) void` - через `inline for` и `@field` печатает все поля структуры.
4. `fn requireInt(comptime T: type) void` - `@compileError`, если `T` не целое.
5. Используй `@typeName`, `@hasField`, `@typeInfo`.
6. Проверь `Vec(i32)`, `Vec(f64)`, `dump(Point, ...)` и `requireInt(u8)`.
7. Попробуй `requireInt(f32)` и объясни, почему ошибка появляется на этапе компиляции.

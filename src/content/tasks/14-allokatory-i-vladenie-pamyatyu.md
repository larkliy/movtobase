---
number: 14
title: "Аллокаторы и владение памятью"
lesson: "14-allokatory-i-vladenie-pamyatyu"
part: 2
difficulty: 2
tags: ["allocators", "memory"]
description: "Напиши динамический строковый буфер: 1. Функция join(allocator, parts: []const []const u8, sep: []const u8) ![]u8 склеивает части через разделитель. 2. Используй…"
---

Напиши динамический строковый буфер:

1. Функция `join(allocator, parts: []const []const u8, sep: []const u8) ![]u8` склеивает части через разделитель.
2. Используй `std.ArrayList(u8)`, `appendSlice`, `toOwnedSlice`.
3. В `main`:
   - вызови `join` с `init.gpa`, освободи результат через `defer`;
   - вызови `join` с ареной, не освобождай отдельные части;
   - покажи разницу через `DebugAllocator`.
4. Добавь `errdefer`, чтобы при ошибке выделения список корректно освобождался.
5. Запусти под `DebugAllocator` и убедись, что утечек нет.
6. Дополнительно: реализуй `joinFixed(buffer: []u8, parts, sep) ![]u8` через `FixedBufferAllocator` и верни `error.NoSpaceLeft` при переполнении.

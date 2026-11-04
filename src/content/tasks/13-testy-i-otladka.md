---
number: 13
title: "Тесты и отладка"
lesson: "13-testy-i-otladka"
part: 2
difficulty: 2
tags: ["testing", "debugging"]
description: "Покрой тестами утилиты для строк: 1. fn countChar(s: []const u8, ch: u8) usize - считает вхождения байта. 2. fn trimAlloc(allocator, s) ![]u8 - убирает пробелы по краям…"
---

Покрой тестами утилиты для строк:

1. `fn countChar(s: []const u8, ch: u8) usize` - считает вхождения байта.
2. `fn trimAlloc(allocator, s) ![]u8` - убирает пробелы по краям через `std.mem.trim` и `dupe`.
3. `fn parsePositive(s: []const u8) !u32` - парсит число, возвращает `error.Invalid` на мусоре и `error.Overflow` на переполнении.
4. Напиши тесты:
   - `countChar` на пустой строке, одном символе и повторениях;
   - `trimAlloc` на строке с пробелами и проверку отсутствия утечек через `testing.allocator`;
   - `parsePositive` на валидном числе, мусоре и переполнении через `expectError`.
5. Запусти `zig test` и `zig build test`.
6. Добавь `std.debug.print` в один тест и объясни, куда идет вывод.

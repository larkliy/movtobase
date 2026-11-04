---
number: 9
title: "Enum и switch"
lesson: "09-enum-i-switch"
part: 2
difficulty: 2
tags: ["enums", "switch"]
description: "Напиши парсер команд для маленькой утилиты:"
---

Напиши парсер команд для маленькой утилиты:

1. Объяви `enum Command { run, stop, status, help }`.
2. Функция `parse(s: []const u8) ?Command` принимает строку и возвращает вариант через `std.meta.stringToEnum`.
3. Функция `describe(cmd: Command) []const u8` возвращает описание через `switch`, без `else`.
4. Для неизвестной команды выведи список доступных команд и верни код выхода `2`.
5. Добавь `enum(u8)` `ExitCode { ok = 0, usage = 2, failure = 1 }` и верни его из `main` через `@intFromEnum`.

Проверь, что при добавлении нового варианта в `Command` компилятор требует обновить `describe`.

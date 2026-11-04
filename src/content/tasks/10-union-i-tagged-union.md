---
number: 10
title: "Union и tagged union"
lesson: "10-union-i-tagged-union"
part: 2
difficulty: 2
tags: ["unions", "tagged union"]
description: "Напиши мини-парсер ответа: 1. Объяви union(enum) Result { ok: []const u8, err: []const u8, empty }. 2. Функция parse(raw: []const u8) Result: если строка начинается с…"
---

Напиши мини-парсер ответа:

1. Объяви `union(enum) Result { ok: []const u8, err: []const u8, empty }`.
2. Функция `parse(raw: []const u8) Result`: если строка начинается с `"ok:"` - верни `ok` с остатком, если с `"err:"` - `err`, иначе `empty`.
3. Функция `printResult(Result, writer)` разворачивает вариант через `switch` и печатает:
   - `OK: <text>`
   - `ERROR: <text>`
   - `EMPTY`
4. Добавь `std.meta.activeTag` и распечатай имя тега.
5. Объясни, почему здесь нельзя использовать `union` без тега.

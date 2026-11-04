---
number: 4
title: "Ошибки и их обработка"
lesson: "04-oshibki"
part: 1
difficulty: 1
tags: ["errors", "try/catch"]
description: "Напиши программу с тремя уровнями обработки ошибок:"
---

Напиши программу с тремя уровнями обработки ошибок:

1. Функция `divide(a: u32, b: u32) error{DivideByZero}!u32` - возвращает ошибку при делении на ноль.
2. Функция `findDigit(s: []const u8, target: u8) error{NotFound}!usize` - ищет байт в строке через `std.mem.indexOfScalar`, возвращает индекс или `error.NotFound`. Тип ошибки пусть будет inferred (просто `!usize`).
3. В `main` вызови обе через `try`/`catch`, распечатай имя ошибки через `@errorName`, и добавь `errdefer` где-нибудь, где видно, что он срабатывает только при ошибке.

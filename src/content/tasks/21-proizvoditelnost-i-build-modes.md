---
number: 21
title: "Производительность и build modes"
lesson: "21-proizvoditelnost-i-build-modes"
part: 3
difficulty: 3
tags: ["performance", "build modes"]
description: "Сравни режимы сборки: 1. Напиши sumSlice([]const u64) u64 с +% и doNotOptimizeAway. 2. Сгенерируй массив на 10 млн элементов (можно через std.Random). 3. Замерь время в…"
---

Сравни режимы сборки:

1. Напиши `sumSlice([]const u64) u64` с `+%` и `doNotOptimizeAway`.
2. Сгенерируй массив на 10 млн элементов (можно через `std.Random`).
3. Замерь время в `Debug`, `ReleaseSafe`, `ReleaseFast`, `ReleaseSmall`.
4. Выведи медиану из 5 запусков.
5. Добавь SIMD-версию суммы через `@Vector(4, u64)` и сравни.
6. Проверь `@setRuntimeSafety(false)` в горячем цикле и объясни риск.
7. Дополнительно: собери с `-femit-asm` и найди векторные инструкции.

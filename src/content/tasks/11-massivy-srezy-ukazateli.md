---
number: 11
title: "Массивы, срезы и указатели"
lesson: "11-massivy-srezy-ukazateli"
part: 2
difficulty: 2
tags: ["slices", "pointers"]
description: "Напиши разбор простого бинарного заголовка:"
---

Напиши разбор простого бинарного заголовка:

1. Дан массив `var packet = [_]u8{ 0x4d, 0x5a, 0x02, 0x00, 0x10, 0x00, 0x00, 0x00 };`.
2. Считай первые два байта как `u16` little-endian через `std.mem.readInt`.
3. Считай следующие четыре байта как `u32` little-endian.
4. Сделай срез payload с 6-го байта до конца и выведи его длину.
5. Получи `[*]const u8` из начала массива и выведи третий байт.
6. Выведи `@sizeOf(@TypeOf(packet))`, `@alignOf(u32)` и `@offsetOf` для структуры `extern struct { magic: u16, len: u32 }`.
7. Проверь, что `@ptrCast` к `*u32` из `&packet[0]` требует выравнивания; используй `@alignCast` только если уверен.

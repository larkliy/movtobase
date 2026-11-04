---
number: 19
title: "C interop"
lesson: "19-c-interop"
part: 3
difficulty: 3
tags: ["c interop", "ffi"]
description: "Сделай Zig-обертку над C-функцией: 1. Создай include/demo.h с int add(int a, int b); и int mul(int a, int b);. 2. Создай src/demo.c с реализацией. 3. Настрой build.zig…"
---

Сделай Zig-обертку над C-функцией:

1. Создай `include/demo.h` с `int add(int a, int b);` и `int mul(int a, int b);`.
2. Создай `src/demo.c` с реализацией.
3. Настрой `build.zig` через `b.addTranslateC` и `addCSourceFile`.
4. В `src/main.zig` импортируй сгенерированный модуль как `c` и вызови `c.add(2, 3)`, `c.mul(4, 5)`.
5. Экспортируй из Zig функцию `export fn zig_sub(a: i32, b: i32) i32`.
6. Собери и запусти. Затем проверь, что `@cImport` в 0.17 не работает, и объясни, чем его заменили.
7. Дополнительно: собери статическую библиотеку `zig build-lib` с `export`-функцией.

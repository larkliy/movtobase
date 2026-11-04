---
number: 12
title: "Сборка проекта и модули"
lesson: "12-sborka-proekta-i-moduli"
part: 2
difficulty: 2
tags: ["build.zig", "modules"]
description: "Собери проект из двух модулей: 1. src/mathx.zig экспортирует square(i32) i32, cube(i32) i32 и тесты к ним. 2. src/main.zig импортирует mathx через @import(\"mathx\") и…"
---

Собери проект из двух модулей:

1. `src/mathx.zig` экспортирует `square(i32) i32`, `cube(i32) i32` и тесты к ним.
2. `src/main.zig` импортирует `mathx` через `@import("mathx")` и печатает `square(12)` и `cube(3)`.
3. `build.zig` должен:
   - создавать модуль `mathx`;
   - собирать исполняемый файл `proj`;
   - добавлять шаг `run`;
   - добавлять шаг `test`, который запускает тесты `mathx`.
4. `build.zig.zon` создай через `zig init` или добавь корректный `fingerprint`.
5. Проверь `zig build`, `zig build run`, `zig build test`.
6. Дополнительно: собери `ReleaseFast` и `-Dtarget=x86_64-linux-gnu` (если target доступен).

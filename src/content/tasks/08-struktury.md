---
number: 8
title: "Структуры"
lesson: "08-struktury"
part: 1
difficulty: 1
tags: ["structs", "methods"]
description: "Напиши программу с тремя структурами: 1. Rectangle с полями width: u32 и height: u32 и методом area() u32. 2. Config с полем port: u16 = 8080 и host: []const u8 =…"
---

Напиши программу с тремя структурами:

1. `Rectangle` с полями `width: u32` и `height: u32` и методом `area() u32`.
2. `Config` с полем `port: u16 = 8080` и `host: []const u8 = "localhost"` - проверь, что значения по умолчанию подхватываются, а переопределяются при задании.
3. Структуру `{ x: u8, y: u32, z: u8 }` в двух режимах - обычном и `extern` - и выведи их `@sizeOf`, чтобы увидеть, как `auto` убирает padding.

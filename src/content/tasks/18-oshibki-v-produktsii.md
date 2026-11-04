---
number: 18
title: "Ошибки в продакшене"
lesson: "18-oshibki-v-produktsii"
part: 3
difficulty: 3
tags: ["errors", "production"]
description: "Напиши устойчивый загрузчик файла: 1. fn loadWithRetry(io, gpa, path, attempts: usize) ![]u8: - пытается прочитать файл; - при error.FileNotFound возвращает ошибку…"
---

Напиши устойчивый загрузчик файла:

1. `fn loadWithRetry(io, gpa, path, attempts: usize) ![]u8`:
   - пытается прочитать файл;
   - при `error.FileNotFound` возвращает ошибку сразу;
   - при временной ошибке (`error.WouldBlock`, `error.Interrupted`) повторяет;
   - после `attempts` возвращает последнюю ошибку.
2. Используй `errdefer` для очистки буфера.
3. Добавь `fn slow(io) Cancelable!void`, запусти через `std.Io.concurrent` и отмени через `Future.cancel`.
4. Обработай `error.Canceled` явно: выведи сообщение и заверши работу.
5. Верни из `main` код выхода: `0` - успех, `1` - ошибка загрузки, `2` - отмена.
6. Объясни, почему `catch unreachable` здесь неуместен.

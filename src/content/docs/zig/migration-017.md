---
title: "Zig 0.17.0: что изменилось"
description: "Карта отличий Zig 0.17.0 от старых версий: std.Io, DebugAllocator, ArrayList, время, файлы и build.zig."
course: zig
duration: 5
tags: ["zig 0.17", "migration"]
---

Курс написан под 0.17.0. Примеры из статей для 0.11-0.14 часто не собираются. Ниже отличия, которые ломают код.

## I/O

**Было:** `std.io.getStdOut()`, `std.io.getStdIn()`, `std.io.bufferedWriter`.

**Стало:** `std.Io.File.stdout()`, `std.Io.File.stdin()`, `writerStreaming(init.io, &buffer)`.

```zig
var buffer: [4096]u8 = undefined;
var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);
try out.interface.print("hello\n", .{});
try out.flush();
```

`main` принимает `std.process.Init`.

```zig
pub fn main(init: std.process.Init) !void { ... }
```

В `init` лежат `io`, `gpa`, `arena`, `minimal.args`, `environ_map` и `preopens`.

## @cImport

**Было:**

```zig
const c = @cImport({ @cInclude("stdio.h"); });
```

**Стало:** `zig translate-c` или `b.addTranslateC`. Подробнее в уроке 19.

## Аллокаторы

**Было:** `std.heap.GeneralPurposeAllocator(.{})`.

**Стало:** `std.heap.DebugAllocator(.{})`.

`ArrayList` больше не хранит аллокатор.

```zig
var list: std.ArrayList(u8) = .empty;
defer list.deinit(gpa);
try list.append(gpa, 'x');
```

Вместо `ArrayList.init(gpa)` используется `.empty`. Вместо `list.append(x)` вызывается `list.append(gpa, x)`.

## Время

**Было:** `std.time.Timer.start()`, `std.time.sleep(ns)`.

**Стало:** `std.Io.Clock.Timestamp.now(init.io, .awake)`, `std.Io.sleep(init.io, duration, .awake)`.

```zig
const start = std.Io.Clock.Timestamp.now(init.io, .awake);
try std.Io.sleep(init.io, std.Io.Duration.fromMilliseconds(10), .awake);
const elapsed = start.untilNow(init.io);
```

`std.time` оставил константы `ns_per_ms`, `ns_per_s` и `epoch`.

## Синхронизация

**Было:** `std.Thread.Mutex`.

**Стало:** `std.Io.Mutex`, `lock(io)` и `unlock(io)`.

```zig
var mutex: std.Io.Mutex = .init;
mutex.lock(init.io) catch return;
defer mutex.unlock(init.io);
```

`RwLock`, `Condition` и `Semaphore` тоже переехали в `std.Io`.

## Файлы

**Было:** `std.fs.cwd().readFileAlloc(...)`.

**Стало:** `std.Io.Dir.cwd().readFileAlloc(init.io, ...)`.

```zig
const data = try std.Io.Dir.cwd().readFileAlloc(init.io, "file.txt", gpa, .limited(1 << 20));
```

`std.fs` остается для совместимости. Новые программы пишут на `std.Io.Dir`.

## Форматирование

`std.fmt.bufPrint` и `std.fmt.allocPrint` помечены deprecated.

- `std.mem.print(&buf, fmt, args)` пишет в готовый буфер.
- `Allocator.print(fmt, args)` выделяет память.

`std.mem.indexOf` теперь алиас `std.mem.find`.

## Build system

- В `build.zig.zon` обязателен `fingerprint`. `zig init` подставляет его.
- `b.args` удален. Для аргументов запуска используется `run_cmd.addPassthruArgs()`.
- `@cImport` заменен на `b.addTranslateC`.
- `root_module` создается через `b.createModule`, импорты задаются в `.imports`.

## Рефлексия

**Было:** `std.builtin.Type`.

**Стало:** `std.lang.Type` в `lib/std/lang.zig`. Варианты называются `@"struct"`, `@"union"` и `@"fn"`.

```zig
const info = @typeInfo(T);
switch (info) {
    .@"struct" => |s| s.field_names,
    else => @compileError("expected struct"),
}
```

## Что делать со старыми примерами

1. Проверь `zig version`.
2. Замени `std.io` на `std.Io`.
3. Замени `GeneralPurposeAllocator` на `DebugAllocator`.
4. Замени `std.time.Timer` на `Io.Clock`.
5. Убери `@cImport` и используй `translate-c`.
6. Обнови `ArrayList` на `.empty` и передавай аллокатор в методы.
7. Обнови `build.zig` под `root_module` и `addPassthruArgs`.

Если пример не собирается, читай ошибку целиком. Компилятор обычно называет поле или функцию.

---
number: 20
title: "Потоки и атомики"
lesson: "20-potoki-i-atomiki"
part: 3
difficulty: 3
tags: ["threads", "atomics"]
description: "var mutex: std.Io.Mutex = .init; var mutex counter: u64 = 0; var atomic counter = std.atomic.Value(u64).init(0);"
---

## Решение

```zig
const std = @import("std");

var mutex: std.Io.Mutex = .init;
var mutex_counter: u64 = 0;
var atomic_counter = std.atomic.Value(u64).init(0);

fn mutexWorker(io: std.Io, n: usize) void {
    for (0..n) |_| {
        mutex.lock(io) catch return;
        defer mutex.unlock(io);
        mutex_counter += 1;
    }
}

fn atomicWorker(n: usize) void {
    for (0..n) |_| {
        _ = atomic_counter.fetchAdd(1, .monotonic);
    }
}

pub fn main(init: std.process.Init) !void {
    const n = 100_000;
    const start = std.Io.Clock.Timestamp.now(init.io, .awake);

    const t1 = try std.Thread.spawn(.{}, mutexWorker, .{ init.io, n });
    const t2 = try std.Thread.spawn(.{}, mutexWorker, .{ init.io, n });
    const t3 = try std.Thread.spawn(.{}, mutexWorker, .{ init.io, n });
    const t4 = try std.Thread.spawn(.{}, mutexWorker, .{ init.io, n });
    t1.join();
    t2.join();
    t3.join();
    t4.join();

    const a1 = try std.Thread.spawn(.{}, atomicWorker, .{n});
    const a2 = try std.Thread.spawn(.{}, atomicWorker, .{n});
    const a3 = try std.Thread.spawn(.{}, atomicWorker, .{n});
    const a4 = try std.Thread.spawn(.{}, atomicWorker, .{n});
    a1.join();
    a2.join();
    a3.join();
    a4.join();

    const elapsed = start.untilNow(init.io);
    std.debug.print("mutex={d} atomic={d} elapsed_ms={d}\n", .{
        mutex_counter,
        atomic_counter.load(.monotonic),
        @divTrunc(elapsed.raw.nanoseconds, std.time.ns_per_ms),
    });
}
```

## Разбор

- `std.Io.Mutex` в 0.17 требует `io` в `lock` и `unlock`. Это позволяет блокировке быть отменяемой.
- `defer mutex.unlock(io)` стоит сразу после `lock`: если `catch return` сработал, мьютекс не был захвачен, и `defer` не выполнится, потому что мы вышли до его объявления.
- Атомарный счетчик не требует блокировки для одного поля. `fetchAdd` возвращает старое значение, поэтому результат игнорируется через `_ =`.
- `.monotonic` достаточно для счетчика: важна атомарность, а не порядок с другими данными.

## Почему `counter += 1` без защиты - гонка

`counter += 1` читает значение, прибавляет единицу и записывает обратно. Два потока могут прочитать одно и то же значение и потерять один инкремент. На x86 это может «работать» годами, а потом дать неверный результат. Формально это data race и UB.

## RwLock

```zig
var rw: std.Io.RwLock = .init;
var shared: u64 = 0;

fn reader(io: std.Io) void {
    rw.lockShared(io) catch return;
    defer rw.unlockShared(io);
    _ = shared;
}

fn writer(io: std.Io) void {
    rw.lock(io) catch return;
    defer rw.unlock(io);
    shared += 1;
}
```

Имена методов могут отличаться в зависимости от версии; проверьте `lib/std/Io.zig`. Идея: много читателей одновременно, писатель - эксклюзивно.

## ThreadSanitizer

```bash
zig build-exe main.zig -fsanitize-thread
```

На Linux/macOS это поможет найти гонки. На Windows поддержка может отсутствовать. Если sanitizer недоступен, используйте стресс-тесты и логирование.

---
number: 21
title: "Производительность и build modes"
lesson: "21-proizvoditelnost-i-build-modes"
part: 3
difficulty: 3
tags: ["performance", "build modes"]
description: "fn sumScalar(xs: []const u64) u64 { var total: u64 = 0; for (xs) x total +%= x; return total; }"
---

## Решение

```zig
const std = @import("std");

fn sumScalar(xs: []const u64) u64 {
    var total: u64 = 0;
    for (xs) |x| total +%= x;
    return total;
}

fn sumSimd(xs: []const u64) u64 {
    const V = @Vector(4, u64);
    var acc: V = @splat(0);
    var i: usize = 0;
    while (i + 4 <= xs.len) : (i += 4) {
        const v: V = xs[i..][0..4].*;
        acc +%= v;
    }
    var total: u64 = @reduce(.Add, acc);
    while (i < xs.len) : (i += 1) total +%= xs[i];
    return total;
}

fn median(values: []u64) u64 {
    std.mem.sort(u64, values, {}, std.sort.asc(u64));
    return values[values.len / 2];
}

pub fn main(init: std.process.Init) !void {
    var out_buf: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &out_buf);
    const gpa = init.gpa;

    const n = 10_000_000;
    const data = try gpa.alloc(u64, n);
    defer gpa.free(data);

    var prng: std.Random.DefaultPrng = .init(42);
    const random = prng.random();
    for (data) |*x| x.* = random.int(u64);

    var scalar_times: [5]u64 = undefined;
    var simd_times: [5]u64 = undefined;

    for (0..5) |i| {
        const t0 = std.Io.Clock.Timestamp.now(init.io, .awake);
        const s = sumScalar(data);
        const t1 = std.Io.Clock.Timestamp.now(init.io, .awake);
        scalar_times[i] = @intCast(t1.raw.nanoseconds - t0.raw.nanoseconds);

        const t2 = std.Io.Clock.Timestamp.now(init.io, .awake);
        const v = sumSimd(data);
        const t3 = std.Io.Clock.Timestamp.now(init.io, .awake);
        simd_times[i] = @intCast(t3.raw.nanoseconds - t2.raw.nanoseconds);

        std.debug.assert(s == v);
    }

    try out.interface.print("scalar_median_ns={d}\n", .{median(&scalar_times)});
    try out.interface.print("simd_median_ns={d}\n", .{median(&simd_times)});
    try out.flush();
}
```

## Разбор

- `+%=` - сложение с заворотом. В Debug оно не паникует при переполнении, но и не проверяет его. Для суммы случайных `u64` это осознанный выбор.
- `@Vector(4, u64)` может быть медленнее скалярной версии на некоторых CPU: 256-битные целочисленные умножения/сложения поддерживаются не везде. Измеряйте.
- `@reduce(.Add, acc)` сворачивает вектор. Хвост обрабатывается отдельно.
- `median` сортирует копию массива времен. Для пяти значений это нормально.
- `std.mem.sort(u64, ...)` с `std.sort.asc(u64)` - удобный компаратор для примитивов.

## Запуск

```bash
zig run bench.zig -O Debug
zig run bench.zig -O ReleaseSafe
zig run bench.zig -O ReleaseFast
zig run bench.zig -O ReleaseSmall
```

Ожидайте, что Debug будет в разы медленнее. ReleaseFast может быть быстрее ReleaseSafe, но не всегда: проверки безопасности иногда помогают предсказанию ветвлений.

## `@setRuntimeSafety`

```zig
fn hotSum(xs: []const u64) u64 {
    @setRuntimeSafety(false);
    var total: u64 = 0;
    for (xs) |x| total +%= x;
    return total;
}
```

Это отключает проверки в функции. В ReleaseFast они и так отключены, а в ReleaseSafe это может ускорить горячий цикл. Риск: если есть выход за границы или переполнение, поведение станет UB.

## Ассемблер

```bash
zig build-exe bench.zig -O ReleaseFast -femit-asm=bench.s
```

Ищите в `bench.s` инструкции `vpaddq`, `vpmullq`, `zmm`/`ymm`/`xmm`. Если их нет, компилятор не векторизовал цикл; проверьте выравнивание и зависимости.

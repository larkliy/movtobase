---
number: 24
title: "Продвинутый Zig: SIMD и свои аллокаторы"
lesson: "24-prodvinutyy-zig"
part: 3
difficulty: 3
tags: ["simd", "allocators"]
description: "fn dotScalar(a: []const f32, b: []const f32) f32 { var total: f32 = 0; for (a, b) x, y total += x y; return total; }"
---

## SIMD

```zig
const std = @import("std");

fn dotScalar(a: []const f32, b: []const f32) f32 {
    var total: f32 = 0;
    for (a, b) |x, y| total += x * y;
    return total;
}

fn dotSimd(a: []const f32, b: []const f32) f32 {
    const V = @Vector(4, f32);
    var acc: V = @splat(0);
    var i: usize = 0;

    while (i + 4 <= a.len) : (i += 4) {
        const va: V = a[i..][0..4].*;
        const vb: V = b[i..][0..4].*;
        acc += va * vb;
    }

    var total: f32 = @reduce(.Add, acc);
    while (i < a.len) : (i += 1) total += a[i] * b[i];
    return total;
}

test "dot" {
    const a = [_]f32{ 1, 2, 3, 4, 5 };
    const b = [_]f32{ 2, 2, 2, 2, 2 };
    try std.testing.expectApproxEqAbs(@as(f32, 30), dotScalar(&a, &b), 0.001);
    try std.testing.expectApproxEqAbs(@as(f32, 30), dotSimd(&a, &b), 0.001);
}

test "dot empty" {
    try std.testing.expectEqual(@as(f32, 0), dotSimd(&.{}, &.{}));
}

pub fn main() void {
    const a = [_]f32{ 1, 2, 3, 4, 5 };
    const b = [_]f32{ 2, 2, 2, 2, 2 };
    std.debug.print("scalar={d} simd={d}\n", .{ dotScalar(&a, &b), dotSimd(&a, &b) });
}
```

## Свой аллокатор

```zig
const std = @import("std");

const CountingAllocator = struct {
    child: std.mem.Allocator,
    allocated: usize = 0,
    freed: usize = 0,
    max_allocated: usize = 0,

    fn allocator(self: *CountingAllocator) std.mem.Allocator {
        return .{ .ptr = self, .vtable = &vtable };
    }

    const vtable: std.mem.Allocator.VTable = .{
        .alloc = alloc,
        .resize = resize,
        .remap = remap,
        .free = free,
    };

    fn alloc(ctx: *anyopaque, len: usize, alignment: std.mem.Alignment, ret_addr: usize) ?[*]u8 {
        const self: *CountingAllocator = @ptrCast(@alignCast(ctx));
        const ptr = self.child.rawAlloc(len, alignment, ret_addr) orelse return null;
        self.allocated += len;
        self.max_allocated = @max(self.max_allocated, self.allocated);
        return ptr;
    }

    fn resize(ctx: *anyopaque, memory: []u8, alignment: std.mem.Alignment, new_len: usize, ret_addr: usize) bool {
        const self: *CountingAllocator = @ptrCast(@alignCast(ctx));
        if (self.child.rawResize(memory, alignment, new_len, ret_addr)) {
            self.allocated = self.allocated - memory.len + new_len;
            self.max_allocated = @max(self.max_allocated, self.allocated);
            return true;
        }
        return false;
    }

    fn remap(ctx: *anyopaque, memory: []u8, alignment: std.mem.Alignment, new_len: usize, ret_addr: usize) ?[*]u8 {
        const self: *CountingAllocator = @ptrCast(@alignCast(ctx));
        const ptr = self.child.rawRemap(memory, alignment, new_len, ret_addr) orelse return null;
        self.allocated = self.allocated - memory.len + new_len;
        self.max_allocated = @max(self.max_allocated, self.allocated);
        return ptr;
    }

    fn free(ctx: *anyopaque, memory: []u8, alignment: std.mem.Alignment, ret_addr: usize) void {
        const self: *CountingAllocator = @ptrCast(@alignCast(ctx));
        self.child.rawFree(memory, alignment, ret_addr);
        self.freed += memory.len;
    }
};

test "counting allocator" {
    var counting: CountingAllocator = .{ .child = std.testing.allocator };
    const a = counting.allocator();

    {
        var list: std.ArrayList(u8) = .empty;
        defer list.deinit(a);
        try list.appendSlice(a, "hello");
        try list.append(a, '!');
        try std.testing.expectEqualStrings("hello!", list.items);
    }

    try std.testing.expectEqual(counting.allocated, counting.freed);
}

pub fn main(init: std.process.Init) !void {
    var counting: CountingAllocator = .{ .child = init.gpa };
    const a = counting.allocator();

    var list: std.ArrayList(u8) = .empty;
    defer list.deinit(a);
    try list.appendSlice(a, "hello, counting allocator");

    std.debug.print("items={s}\nallocated={d} freed={d} max={d}\n", .{
        list.items,
        counting.allocated,
        counting.freed,
        counting.max_allocated,
    });
}
```

## Разбор

- `dotSimd` обрабатывает хвост скалярно, поэтому корректно работает для длины 0, 3, 4, 5, 1000.
- `@Vector(4, f32)` на x86 обычно использует SSE, на AVX - 256-битные регистры, если включены features. Проверяйте ассемблер.
- `CountingAllocator` реализует весь vtable: `alloc`, `resize`, `remap`, `free`. Если не реализовать `resize`/`remap`, контейнеры могут копировать данные чаще, но работать будут.
- В тесте блок ограничивает жизнь `list`. После `deinit` `allocated == freed`, иначе тест упадет.
- `max_allocated` обновляется при каждом изменении, чтобы видеть пик.
- В `main` `freed` будет 0 до выхода из функции, потому что `defer` выполняется после печати. Для проверки освобождения используйте блок, как в тесте.

## Почему SIMD не всегда быстрее

- Накладные расходы на загрузку/сохранение векторов.
- Невыровненные данные.
- Маленькие массивы: скалярный цикл короче.
- Зависимости по данным: `acc +=` создает цепочку, которую нельзя распараллелить.

## Почему аллокатор-обертка может быть вредна

- Дополнительный вызов на каждое выделение.
- Потеря информации о выравнивании, если реализация неверна.
- `resize`/`remap` могут не поддержать нужный сценарий, и контейнер будет чаще копировать.
- Счетчики нужно защищать при многопоточном использовании (или делать аллокатор потокобезопасным).

Используйте такие обертки для отладки, профилирования и обучения, а не в горячем пути без измерений.

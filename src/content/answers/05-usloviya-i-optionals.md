---
number: 5
title: "Условия if-else и optionals"
lesson: "05-usloviya-i-optionals"
part: 1
difficulty: 1
tags: ["optionals", "control flow"]
description: "fn maybeSqrt(n: i32) ?i32 { if (n < 0) return null; var i: i32 = 0; while (i i <= n) : (i += 1) { if (i i == n) return i; } return null; }"
---

## Набросок

```zig
const std = @import("std");

fn maybeSqrt(n: i32) ?i32 {
    if (n < 0) return null;
    var i: i32 = 0;
    while (i * i <= n) : (i += 1) {
        if (i * i == n) return i;
    }
    return null;
}

pub fn main(init: std.process.Init) !void {
    var buffer: [4096]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    const nums = [_]i32{ 16, 10, 49, -4 };

    for (nums) |n| {
        if (maybeSqrt(n)) |root| {
            try out.interface.print("sqrt({d}) = {d}\n", .{ n, root });
        } else {
            try out.interface.print("sqrt({d}) = not a square\n", .{n});
        }
    }

    const fallback = maybeSqrt(10) orelse -1;
    try out.interface.print("sqrt(10) orelse = {d}\n", .{fallback});

    var c: ?i32 = 5;
    while (c) |v| {
        try out.interface.print("{d} ", .{v});
        c = if (v > 1) v - 1 else null;
    }
    try out.interface.print("\n", .{});

    try out.flush();
}
```

Совет: перепиши первый цикл через `std.math.isqrt` (целочисленный корень с округлением вниз) и сравни, как изменится проверка на точный квадрат. А в обратном отсчете попробуй заменить `while` с optional-захватом на обычный `while (c != 0)` - почувствуешь, где захват читается чище.

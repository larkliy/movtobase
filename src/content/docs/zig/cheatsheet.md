---
title: "Шпаргалка по Zig 0.17.0"
description: "Короткая карта синтаксиса Zig 0.17.0: типы, управление, ошибки, память, I/O и сборка."
course: zig
duration: 5
tags: ["cheatsheet", "syntax"]
---

## Переменные и типы

```zig
const x: u8 = 255;
var y: i32 = -10;
const s: []const u8 = "hello";
const maybe: ?u8 = null;
const inferred = 42; // comptime_int
```

`const` создает неизменяемую переменную, `var` изменяемую. Целые бывают `u8`...`u128`, `i8`...`i128`, `usize` и `isize`. Дроби бывают `f16`, `f32`, `f64`, `f80` и `f128`. Отдельно есть `bool`, `void` и `noreturn`. Массив записывается как `[N]T`, срез как `[]T`, указатель как `*T`, `[*]T` или `[*:0]T`.

## Управление

```zig
if (cond) { } else { }

const v = if (cond) 1 else 2;

switch (value) {
    .a => {},
    .b, .c => {},
    else => {},
}

for (items, 0..) |item, i| { }
while (cond) : (step) { }
```

`if` и `switch` это выражения. `switch` должен быть исчерпывающим. В `if` слово `else` стоит на той же строке, что и закрывающая `}`.

## Функции

```zig
fn add(a: i32, b: i32) i32 {
    return a + b;
}

fn generic(comptime T: type, value: T) T {
    return value;
}

fn any(value: anytype) @TypeOf(value) {
    return value;
}
```

## Ошибки

```zig
const MyError = error{ NotFound, Invalid };

fn f() MyError!u8 {
    return error.NotFound;
}

const x = f() catch 0;
const y = f() catch |err| switch (err) {
    error.NotFound => 0,
    else => return err,
};
try f();
defer cleanup();
errdefer rollback();
```

## Optionals

```zig
var x: ?u8 = null;
if (x) |v| { }
const v = x orelse 0;
const forced = x.?;
```

## Память

```zig
const buf = try gpa.alloc(u8, 1024);
defer gpa.free(buf);

var list: std.ArrayList(u8) = .empty;
defer list.deinit(gpa);
try list.append(gpa, 'x');

var arena = std.heap.ArenaAllocator.init(gpa);
defer arena.deinit();
```

Аллокатор передается явно. `defer` выполняет код всегда, `errdefer` только при ошибке. `DebugAllocator` ловит утечки, `GeneralPurposeAllocator` это старое имя.

## Структуры, enum, union

```zig
const Point = struct {
    x: i32,
    y: i32,

    fn sum(self: Point) i32 {
        return self.x + self.y;
    }
};

const Cmd = enum { run, stop };

const Shape = union(enum) {
    circle: f64,
    rect: struct { w: f64, h: f64 },
    point,
};
```

## Comptime

```zig
fn Vec(comptime T: type) type {
    return struct { x: T, y: T };
}

inline for (fields) |field| { }
@typeInfo(T);
@typeName(T);
@hasField(T, "x");
@field(value, "x");
@compileError("message");
```

## I/O

```zig
var buf: [4096]u8 = undefined;
var out = std.Io.File.stdout().writerStreaming(init.io, &buf);
try out.interface.print("{s}\n", .{"hello"});
try out.flush();

var in_buf: [4096]u8 = undefined;
var in = std.Io.File.stdin().readerStreaming(init.io, &in_buf);
const line = try in.interface.takeDelimiterExclusive('\n');
```

## Файлы

```zig
const cwd = std.Io.Dir.cwd();
const data = try cwd.readFileAlloc(init.io, "file.txt", gpa, .limited(1 << 20));
defer gpa.free(data);

try cwd.writeFile(init.io, .{ .sub_path = "out.txt", .data = "hello" });
```

## Потоки

```zig
var mutex: std.Io.Mutex = .init;
mutex.lock(init.io) catch return;
defer mutex.unlock(init.io);

const t = try std.Thread.spawn(.{}, worker, .{arg});
t.join();

var counter = std.atomic.Value(u64).init(0);
_ = counter.fetchAdd(1, .monotonic);
```

## Тесты

```zig
fn fail() error{X}!void {
    return error.X;
}

test "name" {
    const std = @import("std");
    const testing = std.testing;
    try testing.expect(true);
    try testing.expectEqual(@as(i32, 1), 1);
    try testing.expectEqualStrings("a", "a");
    try testing.expectError(error.X, fail());
}
```

## Сборка

```bash
zig build
zig build run
zig build test
zig build -Doptimize=ReleaseFast
zig build -Dtarget=x86_64-linux-gnu
```

```zig
pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const exe = b.addExecutable(.{ .name = "app", .root_module = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    }) });
    b.installArtifact(exe);
}
```

## Полезные builtins

```zig
@sizeOf(T)
@alignOf(T)
@offsetOf(T, "field")
@intFromEnum(e)
@enumFromInt(n)
@tagName(e)
@intFromPtr(p)
@ptrFromInt(n)
@ptrCast(p)
@alignCast(p)
@bitCast(x)
@intCast(x)
@truncate(x)
@max(a, b)
@min(a, b)
@reduce(.Add, vec)
@Vector(4, f32)
```

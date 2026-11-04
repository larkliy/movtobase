---
number: 23
title: "Capstone: файловый индексатор"
lesson: "23-capstone-faylovyy-indeksator"
part: 3
difficulty: 3
tags: ["capstone", "cli"]
description: "src/indexer.zig - рекурсивный обход, статистика, тесты:"
---

## Полное решение

`src/indexer.zig` - рекурсивный обход, статистика, тесты:

```zig
const std = @import("std");

pub const ExtCount = struct {
    ext: []const u8,
    files: usize,
    bytes: usize,
};

pub const Stats = struct {
    files: usize = 0,
    bytes: usize = 0,
    by_ext: std.StringHashMap(ExtCount),

    pub fn init(gpa: std.mem.Allocator) Stats {
        return .{ .by_ext = std.StringHashMap(ExtCount).init(gpa) };
    }

    pub fn deinit(self: *Stats, gpa: std.mem.Allocator) void {
        var keys = self.by_ext.keyIterator();
        while (keys.next()) |key| gpa.free(key.*);
        self.by_ext.deinit();
    }
};

fn shouldSkip(name: []const u8) bool {
    return std.mem.eql(u8, name, ".zig-cache") or
        std.mem.eql(u8, name, "zig-out") or
        std.mem.eql(u8, name, ".git");
}

pub fn extension(name: []const u8) []const u8 {
    const ext = std.fs.path.extension(name);
    return if (ext.len == 0) "<none>" else ext;
}

pub fn scan(io: std.Io, gpa: std.mem.Allocator, root: []const u8) !Stats {
    var stats = Stats.init(gpa);
    errdefer stats.deinit(gpa);

    var dir = try std.Io.Dir.cwd().openDir(io, root, .{ .iterate = true });
    defer dir.close(io);

    var walker = try dir.walk(gpa);
    defer walker.deinit();

    while (try walker.next(io)) |entry| {
        if (entry.kind == .directory) {
            if (shouldSkip(entry.basename)) walker.leave(io);
            continue;
        }
        if (entry.kind != .file) continue;

        const stat = try entry.dir.statFile(io, entry.basename, .{});
        const ext = extension(entry.basename);

        const key = try gpa.dupe(u8, ext);
        const gop = try stats.by_ext.getOrPut(key);
        if (gop.found_existing) {
            gpa.free(key);
        } else {
            gop.value_ptr.* = .{ .ext = key, .files = 0, .bytes = 0 };
        }
        gop.value_ptr.files += 1;
        gop.value_ptr.bytes += stat.size;

        stats.files += 1;
        stats.bytes += stat.size;
    }

    return stats;
}

pub fn lessThan(_: void, a: ExtCount, b: ExtCount) bool {
    if (a.bytes != b.bytes) return a.bytes > b.bytes;
    return std.mem.lessThan(u8, a.ext, b.ext);
}

test "extension" {
    try std.testing.expectEqualStrings(".zig", extension("main.zig"));
    try std.testing.expectEqualStrings("<none>", extension("Makefile"));
}

test "sorting" {
    var items = [_]ExtCount{
        .{ .ext = ".c", .files = 1, .bytes = 50 },
        .{ .ext = ".zig", .files = 2, .bytes = 100 },
    };
    std.mem.sort(ExtCount, &items, {}, lessThan);
    try std.testing.expectEqualStrings(".zig", items[0].ext);
}
```

`src/main.zig` - CLI-обертка с `--json` и `--top N`:

```zig
const std = @import("std");
const indexer = @import("indexer");

const Report = struct {
    files: usize,
    bytes: usize,
    by_ext: []const indexer.ExtCount,
};

pub fn main(init: std.process.Init) !u8 {
    var out_buf: [8192]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &out_buf);
    const gpa = init.gpa;

    var args = try std.process.Args.Iterator.initAllocator(init.minimal.args, gpa);
    defer args.deinit();
    _ = args.next();

    var json = false;
    var top: usize = 0;
    var root: ?[]const u8 = null;

    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--json")) {
            json = true;
        } else if (std.mem.eql(u8, arg, "--top")) {
            const raw = args.next() orelse return 2;
            top = std.fmt.parseInt(usize, raw, 10) catch return 2;
        } else {
            root = arg;
        }
    }

    const path = root orelse {
        try out.interface.print("usage: indexer [--json] [--top N] <dir>\n", .{});
        try out.flush();
        return 2;
    };

    var stats = indexer.scan(init.io, gpa, path) catch |err| {
        try out.interface.print("scan failed: {s}\n", .{@errorName(err)});
        try out.flush();
        return 1;
    };
    defer stats.deinit(gpa);

    var list: std.ArrayList(indexer.ExtCount) = .empty;
    defer list.deinit(gpa);
    var it = stats.by_ext.iterator();
    while (it.next()) |kv| try list.append(gpa, kv.value_ptr.*);
    std.mem.sort(indexer.ExtCount, list.items, {}, indexer.lessThan);

    const limit = if (top == 0) list.items.len else @min(top, list.items.len);
    const slice = list.items[0..limit];

    if (json) {
        const report = Report{ .files = stats.files, .bytes = stats.bytes, .by_ext = slice };
        try out.interface.print("{f}\n", .{std.json.fmt(report, .{})});
    } else {
        try out.interface.print("files: {d}, bytes: {d}\n", .{ stats.files, stats.bytes });
        for (slice) |item| {
            try out.interface.print("{s}: files={d} bytes={d}\n", .{ item.ext, item.files, item.bytes });
        }
    }
    try out.flush();
    return 0;
}
```

`build.zig`:

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const indexer_module = b.addModule("indexer", .{
        .root_source_file = b.path("src/indexer.zig"),
        .target = target,
        .optimize = optimize,
    });

    const exe = b.addExecutable(.{
        .name = "indexer",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "indexer", .module = indexer_module },
            },
        }),
    });
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    run_cmd.addPassthruArgs();
    const run_step = b.step("run", "Run the indexer");
    run_step.dependOn(&run_cmd.step);

    const tests = b.addTest(.{ .root_module = indexer_module });
    const run_tests = b.addRunArtifact(tests);
    const test_step = b.step("test", "Run tests");
    test_step.dependOn(&run_tests.step);
}
```

## Проверка

```bash
zig build test
zig build run -- .
zig build run -- --json --top 5 .
zig build -Doptimize=ReleaseFast
```

## Что важно

- `walker.next` уже заходит в каталог; `walker.leave(io)` пропускает его. Это работает, потому что `next` вернул directory entry и внутренний стек указывает на этот каталог.
- `entry.dir` действителен до следующего `next`, поэтому `statFile` делается сразу.
- `dupe` ключа обязателен: `entry.basename` живет в буфере walker.
- `--json` использует `std.json.fmt` и `Report` с полем `by_ext`. Для сериализации `ExtCount` достаточно `pub` полей.
- `@min(top, list.items.len)` защищает от выхода за границы.
- Ошибки отдельных файлов в этой версии возвращаются наверх; в продакшене их можно логировать и продолжать.

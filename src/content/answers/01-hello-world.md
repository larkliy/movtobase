---
number: 1
title: "Первый hello world"
lesson: "01-hello-world"
part: 1
difficulty: 1
tags: ["hello world", "stdio"]
description: "pub fn main(init: std.process.Init) !u8 { var buffer: [1024]u8 = undefined; var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);"
---

## Подсказка

```zig
const std = @import("std");

pub fn main(init: std.process.Init) !u8 {
    var buffer: [1024]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);

    try out.interface.print("I'm {s}, answer is {d}\n", .{"Heller", 42});
    try out.flush();

    return 7;
}
```

Проверь код выхода: на Windows/PowerShell это `$LASTEXITCODE`, в bash - `echo $?`.

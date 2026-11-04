---
title: "Установка и настройка"
description: "Что установить для курса, как проверить версию 0.17.0 и собрать первую программу."
course: zig
duration: 5
tags: ["setup", "install"]
---

## Что понадобится

- Zig 0.17.0;
- VS Code или другой редактор;
- расширение Zig и ZLS для автодополнения;
- терминал: PowerShell, bash или zsh.

Курс написан под 0.17.0. В этой версии другой `std.Io`, другая работа с файлами и другой `ArrayList`. Примеры из старых туториалов могут не собираться. Проверь версию до начала.

## Установка Zig

### Windows

1. Скачай `zig-x86_64-windows-0.17.0.zip` с [ziglang.org/download](https://ziglang.org/download/).
2. Распакуй архив, например в `C:\zig`.
3. Добавь `C:\zig` в `PATH`.
4. Проверь версию.

```powershell
zig version
```

Команда должна напечатать `0.17.0`.

### macOS и Linux

Скачай архив под свою платформу или поставь пакет, если пакетный менеджер уже обновлен до 0.17.0. Проверка та же.

```bash
zig version
```

### Через VS Code

Расширение `ziglang.vscode-zig` умеет скачивать Zig и ZLS. В настройках расширения укажи версию `0.17.0` и путь к ZLS. Если ZLS собран из master и показывает `0.17.0-dev`, это нормально. Компилятор должен быть стабильным 0.17.0.

## VS Code

1. Установи расширение **Zig** (`ziglang.vscode-zig`).
2. Установи **CodeLLDB** для отладки или используй gdb и lldb.
3. Проверь настройки.

```json
{
  "zig.zls.enabled": "on",
  "zig.zls.path": "C:\\path\\to\\zls.exe",
  "[zig]": {
    "editor.formatOnSave": false
  }
}
```

`formatOnSave` лучше выключить. `zig fmt` переписывает файл при сохранении, и это мешает экспериментировать.

4. Создай проект.

```bash
zig init
```

Появятся `build.zig`, `build.zig.zon` и `src/main.zig`. `zig init` подставит корректный `fingerprint`, который обязателен в 0.17.

## Первая программа

`src/main.zig`:

```zig
const std = @import("std");

pub fn main(init: std.process.Init) !void {
    var buffer: [1024]u8 = undefined;
    var out = std.Io.File.stdout().writerStreaming(init.io, &buffer);
    try out.interface.print("Zig {s}\n", .{"0.17.0"});
    try out.flush();
}
```

Запуск.

```bash
zig build run
```

Если в терминале появилось `Zig 0.17.0`, окружение готово.

## Полезные команды

```bash
zig version
zig env
zig build
zig build run
zig build test
zig build -Doptimize=ReleaseFast
zig fmt src/main.zig
zig test src/main.zig
zig targets
```

## Если что-то не собирается

- Проверь `zig version`. Если версия не 0.17.0, обнови компилятор.
- Проверь, что `PATH` указывает на нужный `zig.exe` или `zig`.
- Удали `.zig-cache` и `zig-out`, затем собери проект заново.
- В VS Code перезапусти ZLS командой `Zig: Restart ZLS`.
- Читай ошибку целиком. Компилятор называет точное поле или функцию.

## Куда идти дальше

Начни с [обзора курса](index.md) и урока 1. Задачи и ответы лежат в отдельных разделах. Открывай ответ после того, как попробуешь решить задачу сам.

---
title: "System.IO.Pipelines: разбор протокола поверх TCP без копирований"
description: "Pipe, SequenceReader, backpressure и потоковая обработка TCP."
course: csharp
article: 6
duration: 13
tags: ["Pipelines", "I/O", "backpressure"]
---

В предыдущем разборе мы создали TCP-сервер, который не аллоцирует ни одного байта на приём данных из сокета. Но как только мы переходим от сырых байтов к прикладному протоколу (HTTP, Redis RESP, бинарный RPC), мы упираемся в фундаментальную природу протокола TCP: **TCP — это непрерывный поток байтов, а не поток дискретных сообщений**.

То, что клиент отправил одним вызовом `Send`, может прийти на сервер в виде двух или трёх разрозненных пакетов (фрагментация). И наоборот: три коротких запроса могут склеиться в один сетевой фрейм (coalescing).

Если писать разбор протокола на традиционных массивах вручную:
- Приходится постоянно сдвигать непрочитанные байты в начало массива (`Array.Copy`), освобождая место под следующий пакет.
- Если сообщение не помещается в текущий буфер, приходится выделять новый массив большего размера и копировать всё заново.
- Если производитель (клиент) шлёт данные быстрее, чем парсер успевает их разбирать, буферы растут до тех пор, пока сервер не упадёт с `OutOfMemoryException`.

Именно для элегантного решения этих трёх проблем команда .NET создала библиотеку **System.IO.Pipelines** — архитектурную основу веб-сервера Kestrel.

---

## Архитектура Pipe: один буфер, две стороны

Ядро библиотеки — класс `Pipe`, представляющий собой высокопроизводительную очередь между двумя акторами:
- **`PipeWriter` (производитель):** читает байты из сетевого сокета и складывает их в пайп.
- **`PipeReader` (потребитель):** забирает накопленные байты, парсит протокол и освобождает память.

Внутреннее устройство пайпа представляет собой односвязный список сегментов фиксированного размера:

![Внутренности System.IO.Pipelines: Цепочка BufferSegment](/movtobase/images/csharp/pipelines-buffer-chain.svg)

Заглянем в исходники `src/libraries/System.IO.Pipelines/src/System/IO/Pipelines/BufferSegment.cs`:

![BufferSegment в Pipelines](/movtobase/images/csharp/code-pipe-buffersegment.svg)

Каждый `BufferSegment` наследуется от `ReadOnlySequenceSegment<byte>` и инкапсулирует блок памяти (обычно 4096 байт), взятый из пула `MemoryPool<byte>.Shared`.

А в файле `src/libraries/System.IO.Pipelines/src/System/IO/Pipelines/Pipe.cs` описано управление указателями:

![Указатели голов и хвостов в Pipe](/movtobase/images/csharp/code-pipe-unconsumed.svg)

Пайп отслеживает:
- `_readHead` — сегмент, с которого начинает чтение `PipeReader`.
- `_writingHead` — сегмент, в который в текущий момент пишет `PipeWriter`.
- `_unconsumedBytes` — суммарное количество байтов, которые уже закоммичены писателем, но ещё не потреблены читателем.

Когда читатель полностью заканчивает разбор сегмента, этот сегмент **не удаляется сборщиком мусора, а немедленно возвращается в пул памяти**. Никаких сдвигов памяти через `Array.Copy` не происходит: писатель просто присоединяет новые сегменты в хвост списка, а читатель отстёгивает обработанные сегменты с головы.

---

## ReadOnlySequence<T>: срез через разорванные сегменты

Что происходит, если бинарное сообщение оказалось длиннее одного сегмента (например, 8 КБ) и разорвалось между двумя блоками памяти?

В наивной реализации пришлось бы выделить массив на 8 КБ и скопировать туда обе половины. 

`System.IO.Pipelines` возвращает читателю структуру `ReadOnlySequence<byte>`. Это виртуальная последовательность, которая логически непрерывна, но физически может состоять из цепочки независимых сегментов памяти:

```csharp
ReadResult result = await reader.ReadAsync();
ReadOnlySequence<byte> buffer = result.Buffer;

// Быстрый путь: если все сообщение уместилось в одном блоке
if (buffer.IsSingleSegment)
{
    ReadOnlySpan<byte> span = buffer.FirstSpan;
    ProcessFast(span);
}
else
{
    // Медленный путь: разбор через сегменты
    ProcessMultiSegment(buffer);
}
```

---

## SequenceReader<T>: навигация и поиск без копирования

Для комфортной работы с `ReadOnlySequence<byte>` рантайм предоставляет высокооптимизированную структуру `SequenceReader<byte>`:

```csharp
var reader = new SequenceReader<byte>(buffer);

// Читаем 4-байтовое число длины в формате Big-Endian (сетевой порядок байтов)
if (reader.TryReadBigEndian(out int messageLength))
{
    // Проверяем, накопилось ли в пайпе всё тело сообщения
    if (reader.Remaining >= messageLength)
    {
        ReadOnlySequence<byte> payload = reader.Sequence.Slice(reader.Position, messageLength);
        ProcessMessage(payload);
        
        // Сдвигаем курсор на длину сообщения
        reader.Advance(messageLength);
    }
}
```

`SequenceReader` полностью прячет от разработчика стыки между сегментами памяти. Векторные операции поиска (например, поиск разделителя `\r\n` через `reader.TryReadTo(out ReadOnlySpan<byte> line, delimiter)`) используют SIMD-инструкции внутри сегментов, обеспечивая максимальную скорость разбора.

---

## AdvanceTo(consumed, examined): защита от 100% CPU Spinlock

Самая ответственная часть взаимодействия с `PipeReader` — вызов метода `AdvanceTo`:

```csharp
reader.AdvanceTo(consumed: buffer.Start, examined: buffer.End);
```

У метода два аргумента:
1. **`consumed` (потреблено):** указывает, до какой позиции данные полностью обработаны. Пайп освобождает все сегменты левее этой точки и возвращает их в пул.
2. **`examined` (осмотрено):** указывает, до какой позиции ридер исследовал буфер в поисках границы сообщения.

> **Опаснейшая ошибка новичков:** 
> Если сообщение пришло не полностью (например, пришло 3 байта заголовка из 4), парсер не может его разобрать. Если в этой ситуации вызвать:
> ```csharp
> reader.AdvanceTo(consumed: buffer.Start, examined: buffer.Start); // ОШИБКА!
> ```
> Вы скажете пайпу: «я ничего не потребил и ничего не исследовал». Следующий вызов `await reader.ReadAsync()` завершится **мгновенно**, вернув те же самые 3 байта! Сервер войдёт в бесконечный цикл со 100% загрузкой ядра процессора.
> 
> *Правило:* Всегда передавайте `examined: buffer.End`, если вам не хватило данных для полного сообщения. Тогда пайп поймёт, что всё доступное уже проверено, и приостановит `ReadAsync` до тех пор, пока сетевой сокет не доставит новую порцию байтов!

---

## Механизм Backpressure (обратное давление)

Что делать, если быстрый клиент отправляет гигабайты данных, а ваш сервис парсит их медленно (например, упирается в базу данных или диск)?

В обычном коде сервер будет читать сокет до тех пор, пока память процесса не кончится.

В `System.IO.Pipelines` встроен механизм **обратного давления (Backpressure)**, настраиваемый через пороги `PipeOptions`:

```csharp
var options = new PipeOptions(
    pauseWriterThreshold: 64 * 1024,  // 64 КБ: пауза писателя
    resumeWriterThreshold: 32 * 1024  // 32 КБ: возобновление писателя
);
var pipe = new Pipe(options);
```

Как это работает:
1. Писатель складывает байты из сокета в пайп и вызывает `await writer.FlushAsync()`.
2. Если `_unconsumedBytes` превышает `pauseWriterThreshold` (64 КБ), задача `FlushAsync()` **не завершается**. Поток вычитки из сокета засыпает.
3. Сокет перестаёт вычитывать данные из TCP-окна ОС. Внутренний буфер TCP на стороне ядра заполняется, и стек TCP отправляет отправителю сигнал нулевого окна (Zero Window Probe).
4. Клиент физически перестаёт слать пакеты на аппаратном уровне сети!
5. Как только читатель разгребёт данные и объём невычитанного упадёт ниже `resumeWriterThreshold` (32 КБ), `FlushAsync()` просыпается, и сокет продолжает чтение.

Сервер физически защищён от нехватки памяти при любых перегрузках.

---

## Полный рабочий пример: сокет + Pipe

Соберём всё воедино: конвейер чтения из сокета и разбора бинарных фреймов:

```csharp
public async Task RunClientAsync(Socket socket)
{
    var pipe = new Pipe();

    // Запускаем две независимые задачи: запись из сокета и разбор фреймов
    Task writingTask = FillPipeAsync(socket, pipe.Writer);
    Task readingTask = ReadPipeAsync(pipe.Reader);

    await Task.WhenAll(writingTask, readingTask);
}

// Поток писателя: вычитывает сокет в пайп
private async Task FillPipeAsync(Socket socket, PipeWriter writer)
{
    const int minimumBufferSize = 512;

    while (true)
    {
        // Запрашиваем кусок памяти из пайпа
        Memory<byte> memory = writer.GetMemory(minimumBufferSize);
        
        // Читаем прямо в память пайпа без промежуточных буферов!
        int bytesRead = await socket.ReceiveAsync(memory, SocketFlags.None);
        if (bytesRead == 0) break;

        // Сообщаем пайпу, сколько байт реально записано
        writer.Advance(bytesRead);

        // Коммитим и будим читателя (с учетом backpressure)
        FlushResult result = await writer.FlushAsync();
        if (result.IsCompleted) break;
    }

    await writer.CompleteAsync();
}

// Поток читателя: парсит сообщения длины 4 байта
private async Task ReadPipeAsync(PipeReader reader)
{
    while (true)
    {
        ReadResult result = await reader.ReadAsync();
        ReadOnlySequence<byte> buffer = result.Buffer;

        while (TryParseMessage(ref buffer, out ReadOnlySequence<byte> message))
        {
            ProcessMessage(message);
        }

        // Сообщаем пайпу, сколько потреблено и сколько осмотрено
        reader.AdvanceTo(buffer.Start, buffer.End);

        if (result.IsCompleted) break;
    }

    await reader.CompleteAsync();
}

private bool TryParseMessage(ref ReadOnlySequence<byte> buffer, out ReadOnlySequence<byte> message)
{
    var seqReader = new SequenceReader<byte>(buffer);

    // Читаем 4-байтовую длину пакета
    if (seqReader.TryReadBigEndian(out int length))
    {
        if (seqReader.Remaining >= length)
        {
            message = buffer.Slice(seqReader.Position, length);
            buffer = buffer.Slice(message.End); // сдвигаем остаток буфера
            return true;
        }
    }

    message = default;
    return false;
}
```

---

## Архитектурное резюме серии

На протяжении шести разборов мы прошли путь от самых глубин ядра CoreCLR до промышленной архитектуры серверных систем:

1. **GC:** Аллокации быстры благодаря bump-pointer и per-thread контекстам, но расплата наступает в фазе паузы.
2. **Span<T> и Memory<T>:** Локальные срезы памяти без заголовков кучи и без единого байта мусора.
3. **Unsafe и MemoryMarshal:** Прямой доступ к памяти, JIT-интринсики и переинтерпретация байтов со скоростью ассемблера.
4. **NativeAOT:** Компиляция Closed-World, полная девиртуализация, микросекундный старт и нулевая зависимость от внешнего рантайма.
5. **Безаллокационный TCP:** Переиспользование `SocketAsyncEventArgs` и буферов POH, уничтожающее скачки p99 latency.
6. **System.IO.Pipelines:** Потоковый разбор протоколов без копирования данных с автоматическим контролем памяти через Backpressure.

Применяя эти знания вместе, вы создаёте код на C#, который не уступает по производительности C++ и Rust, сохраняя при этом безопасность и выразительность современной платформы .NET.

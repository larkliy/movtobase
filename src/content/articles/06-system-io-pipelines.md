---
title: "System.IO.Pipelines: разбор протокола поверх TCP без копирований"
description: "Pipe, SequenceReader, backpressure и потоковая обработка TCP."
course: csharp
article: 6
duration: 13
tags: ["Pipelines", "I/O", "backpressure"]
---

В прошлом уроке мы довели TCP-сервер до нуля аллокаций на операцию ввода-вывода. Но если вы попробуете прикрутить к нему реальный протокол, вы почти сразу уткнетесь в проблему, которую сокет не решает и решить не может. TCP - это поток байтов, а не поток сообщений. То, что вы отправили одним `Send`, придет не обязательно одним `Receive`. Два сообщения могут слипнуться в один буфер, а одно сообщение может быть разорвано между двумя чтениями. И вот тут начинается копирование, склейки через `MemoryStream` и аллокации, от которых мы только что убежали.

`System.IO.Pipelines` - это слой, который берет на себя всю возню с накоплением и нарезкой байтов, не копируя их. Kestrel работает именно так: `Socket` снизу, `Pipe` сверху.

## На пальцах: поток против сообщений

Чтобы понять, зачем все это, нужно усвоить одну вещь: TCP не сохраняет границы сообщений.

Когда вы вызываете `Send` с массивом из 100 байт, это не значит, что получатель получит ровно 100 байт одним `Receive`. TCP - это поток байтов, как вода из крана. Вы налили стакан, но тот, кто на другом конце, может зачерпнуть его двумя ковшами, или наоборот зачерпнуть два ваших стакана одним ковшом. Гарантируется только порядок байтов, а не границы.

А приложению нужны сообщения. Ему нужен не поток байтов, а "вот это одно сообщение целиком". Значит, кто-то должен:
- копить байты, пока не наберется целое сообщение;
- уметь ждать, если пришла только половина;
- отдать следующее сообщение, если пришло полтора.

Писать это руками на массивах - боль. Вот как это выглядит без `Pipe`:

```csharp
byte[] buffer = new byte[4096];
int offset = 0;

while (true)
{
    int read = socket.Receive(buffer, offset, buffer.Length - offset, SocketFlags.None);
    offset += read;

    // а если сообщение больше буфера? доращивать?
    // а если в буфере два сообщения? сдвигать остаток?
    // а если пришла половина заголовка? ждать?
    // ...
}
```

Каждый вопрос - это ветвление, копирование и потенциальная аллокация. `Pipe` берет эту возню на себя. Вы говорите ему "вот байты", он их копит и отдает вам тогда, когда вы попросите, в виде `ReadOnlySequence<byte>`. И делает это без копирования.

## Словарь терминов

**TCP** - протокол передачи данных, который дает надежный упорядоченный поток байтов, но не сохраняет границы сообщений.

**Поток против сообщений** - фундаментальное различие: TCP работает с байтами, приложение хочет сообщения. Мост между ними и есть задача `Pipe`.

**Сегмент** - кусок памяти фиксированного размера, из которого собирается буфер `Pipe`. Сегменты связаны в односвязный список.

**Pipe** - буфер-очередь между писателем и читателем. Сам по себе не делает ввод-вывод, только хранит байты.

**PipeWriter / PipeReader** - две "руки" пайпа: одна складывает байты, другая забирает.

**ReadOnlySequence&lt;T>** - структура, представляющая логическую последовательность, которая физически может лежать в нескольких несвязанных буферах. Именно так `Pipe` отдает данные.

**SequenceReader&lt;T>** - удобный курсор поверх `ReadOnlySequence<T>`. Прячет разрывы между сегментами.

**Backpressure (обратное давление)** - механизм, который не дает быстрому производителю завалить медленного потребителя и съесть всю память.

**PauseWriterThreshold / ResumeWriterThreshold** - пороги в байтах, при которых писатель тормозит и снова разблокируется.

**GetMemory / GetSpan** - просьба к пайпу выдать участок для записи.

**Advance** - сообщить пайпу, сколько байтов из выданного участка реально занято.

**FlushAsync** - закоммитить записанное и разбудить читателя.

**AdvanceTo(consumed, examined)** - сообщить пайпу, до какого места данные потреблены и до какого осмотрены. От этого зависит возврат сегментов в пул и backpressure.

**IValueTaskSource** - интерфейс для ручной реализации `ValueTask` без создания `Task` на каждый вызов.

**ValueTask** - облегченная замена `Task` для случая, когда операция часто завершается синхронно.

**MemoryPool / ArrayPool** - пулы памяти, откуда берутся и куда возвращаются буферы.

**NoDelay** - опция сокета, отключающая алгоритм Нейгла. Полезно для протоколов, где важна задержка, а не экономия пакетов.

**async-метод (корутина)** - метод, который компилятор превращает в state machine и который может приостанавливаться на `await`.

## Проблема, которую сокет не решает

Представьте, что клиент шлет сообщения в формате "4 байта длины, потом сама длина". Вы читаете 4096 байт и получаете что-то такое:

- первый `Receive` вернул половину заголовка, потому что пакет разорвался;
- второй `Receive` вернул хвост первого сообщения и начало второго;
- третье сообщение вообще уместилось целиком плюс начало четвертого.

Если писать это руками на массивах, вы быстро скатываетесь в буфер, который надо сдвигать, доращивать, а на границах копировать. Каждый такой сдвиг - это `Array.Copy` и, скорее всего, новая аллокация.

Хочется другого: пусть байты копятся сами, а я просто спрошу "дай мне следующее полное сообщение". Ровно это и делает `Pipe` вместе с `ReadOnlySequence<byte>`.

## Один буфер, две руки

`Pipe` - это очередь сегментов между двумя сторонами. С одной стороны писатель складывает байты, с другой читатель их забирает. Сегменты - это маленькие куски памяти, связанные в список. Писатель двигает хвост, читатель двигает голову, а сегменты, которые читатель целиком проглотил, возвращаются в пул и идут под следующую запись.

Ключевое поле в `Pipe.cs` - `_unconsumedBytes` (`Pipe.cs:60`), количество закоммиченных, но еще не прочитанных байтов. Вокруг него крутится вся механика. Голова и хвост описаны так:

```csharp
// Pipe.cs:76-89
private BufferSegment? _readHead;      // начало прочитанного
private int _readHeadIndex;
private BufferSegment? _readTail;      // конец доступного читателю
private int _readTailIndex;
private BufferSegment? _writingHead;   // конец записанного писателем
private Memory<byte> _writingHeadMemory;
```

Сами сегменты - это `BufferSegment` (`BufferSegment.cs:10`):

```csharp
internal sealed class BufferSegment : ReadOnlySequenceSegment<byte>
{
    private IMemoryOwner<byte>? _memoryOwner;
    private byte[]? _array;
    private BufferSegment? _next;
    private int _end;
}
```

Один сегмент держит либо `IMemoryOwner<byte>` (из `MemoryPool`), либо `byte[]` (из `ArrayPool`). Смотрите `ResetMemory` (`BufferSegment.cs:73`), который возвращает буфер владельцу:

```csharp
IArrayPoolBuffer? ...
if (memoryOwner != null)
{
    _memoryOwner = null;
    memoryOwner.Dispose();
}
else
{
    Debug.Assert(_array != null);
    ArrayPool<byte>.Shared.Return(_array);
    _array = null;
}
```

То есть память под данные берется из тех же пулов, что мы разбирали, и возвращается туда же.

Вот как выглядит пайп с данными схематично. Читатель уже проглотил начало, писатель дописал в конец:

```text
_readHead                  _readTail              _writingHead
   |                          |                       |
   v                          v                       v
 [seg A][seg B][seg C][seg D] . . . . . . . . . . [seg E]
   ^     ^      ^      ^                          ^       ^
 прочит.  читаемые данные (от _readHead до _readTail)   записанное
                                              (_readTail до _writingHead)
```

- `_readHead` - самый старый сегмент, который читатель еще не освободил.
- `_readTail` - докуда читателю разрешено читать (все закоммичено через `FlushAsync`).
- `_writingHead` - докуда писатель уже записал, но, возможно, еще не закоммитил.

Когда читатель вызывает `AdvanceTo` и говорит, что потребил данные из сегмента `A`, пайп может вернуть `A` в пул и переиспользовать под новую запись. Это и есть источник нулевых аллокаций: список сегментов циклически переиспользуется.

Важная деталь: сегменты никогда не сдвигаются в памяти. Они связаны указателями `_next`, и "продвижение" читателя - это просто переход к следующему узлу списка. Никаких `Array.Copy`.

## Где здесь аллокации, а где их нет

Первое, что бросается в глаза: сам `Pipe` - это объект. Плюс он создает `DefaultPipeReader` и `DefaultPipeWriter` (`Pipe.cs:33-34`). Это разовые аллокации на соединение. Дальше начинается интересное.

Сегменты переиспользуются. Смотрите `GetOrCreateSegment` и `ReturnSegment` (`Pipe.cs:350-372`):

```csharp
private BufferSegment GetOrCreateSegment()
{
    if (_bufferSegmentPool.TryDequeue(out BufferSegment? segment))
    {
        return segment;
    }

    return new BufferSegment();
}

private void ReturnSegment(BufferSegment segment)
{
    // ...
    if (_bufferSegmentPool.Count < _options.MaxSegmentPoolSize)
    {
        _bufferSegmentPool.Enqueue(segment);
    }
}
```

Пул сегментов - это `SingleProducerSingleConsumerQueue<BufferSegment>` (`Pipe.cs:31`), то есть один читатель и один писатель почти никогда не блокируют друг друга. Ограничение `MaxSegmentPoolSize` по умолчанию 256 (`PipeOptions.cs:50`), а комментарий рядом объясняет арифметику: один сегмент около 96 байт, значит потолок пула примерно 24 КБ на соединение. Буферы данных живут отдельно в `MemoryPool`/`ArrayPool` и возвращаются туда еще до того, как сегмент попадет в пул.

Второй момент: все структуры, которые видит пользователь, не аллоцируют.

- `ReadResult` (`ReadResult.cs:9`) - `readonly struct` из `ReadOnlySequence<byte>` и флагов.
- `ReadOnlySequence<T>` (`ReadOnlySequence.cs:15`) - структура из четырех полей:

```csharp
// ReadOnlySequence.cs:18-21
private readonly object? _startObject;
private readonly object? _endObject;
private readonly int _startInteger;
private readonly int _endInteger;
```

Это разобранные на части две позиции. Копирование такой структуры не трогает кучу.

- `PipeAwaitable` (`PipeAwaitable.cs:12`) - тоже структура, и она реализует асинхронное ожидание через `IValueTaskSource`. Посмотрите на `DefaultPipeReader` (`Pipe.DefaultPipeReader.cs:13`): он `IValueTaskSource<ReadResult>`, а `ReadAsync` возвращает `ValueTask`, а не `Task`:

```csharp
// Pipe.cs:878
result = new ValueTask<ReadResult>(_reader, token: 0);
```

`_reader` тут - это один заранее созданный объект на весь pipe. То есть в нормальном случае `await pipe.Reader.ReadAsync()` не создает ни `Task`, ни замыканий. Тот же трюк для записи в `FlushAsync` (`Pipe.cs:504`): `new ValueTask<FlushResult>(_writer, token: 0)`.

Итого в установившемся режиме: ноль аллокаций на чтение и запись, пока данных хватает в уже выделенных сегментах. Аллокация происходит только когда нужен новый сегмент, и это амортизируется пулом.

Разберем трюк с `ValueTask` подробнее, потому что это ключ к нулевым аллокациям на асинхронности. Обычный `Task` - это класс, объект в куче. Каждый `await SomeTask()` уже имеет готовый `Task`, но методы, которые его создают, аллоцируют. Если метод вызывается миллион раз в секунду, миллион объектов `Task` - это много мусора.

`ValueTask` - это структура. Если операция завершилась синхронно, `ValueTask` вообще не создает объект, он просто хранит результат. Если асинхронно, он хранит ссылку на `IValueTaskSource` - объект, который умеет возобновлять ожидание.

`IValueTaskSource` позволяет реализовать асинхронную операцию вручную и переиспользовать один объект. Посмотрите на объявление (`Pipe.DefaultPipeReader.cs:13`):

```csharp
internal sealed class DefaultPipeReader : PipeReader, IValueTaskSource<ReadResult>
{
    // ...
}
```

А `ReadAsync` возвращает:

```csharp
result = new ValueTask<ReadResult>(_reader, token: 0);
```

Здесь `_reader` - это и есть источник, а `token` - номер "попытки". Дело в том, что `ValueTask` нельзя ожидать дважды. Один и тот же `_reader` переиспользуется для всех вызовов `ReadAsync`, и `token` увеличивается, чтобы рантайм мог понять, к какой именно попытке относится возобновление. Если вы попытаетесь ожидать один и тот же `ValueTask` два раза, получите ошибку.

Вот как это работает по шагам:

1. Вы зовете `ReadAsync()`. Пайп возвращает `ValueTask`, который ссылается на `_reader`.
2. Если данные уже есть, `ValueTask` завершается синхронно, объект не создается.
3. Если данных нет, `await` подписывается на `_reader` и паркует продолжение.
4. Когда приходят данные, пайп будит `_reader`, и тот вызывает ваше продолжение.

Ни на одном шаге не создается `Task`. Один объект `_reader` живет столько же, сколько пайп.

Практическое следствие: не сохраняйте `ValueTask` в поле и не ждите его повторно. Если нужно сохранить результат, сохраните его, а не сам `ValueTask`.

## Backpressure: не даем быстрому продюсеру съесть память

Что будет, если клиент шлет данные быстрее, чем вы их обрабатываете? Без ограничений очередь сегментов будет расти, пока не кончится память. Поэтому у `Pipe` есть два порога (`PipeOptions.cs:53-56`):

- `PauseWriterThreshold`, по умолчанию 64 КБ. Когда в пайпе накопилось столько, `FlushAsync` начинает блокироваться.
- `ResumeWriterThreshold`, по умолчанию 32 КБ. Как только читатель опустил объем ниже, писатель снова разблокируется.

Логика в `CommitUnsynchronized` (`Pipe.cs:406-411`):

```csharp
else if (PauseWriterThreshold > 0 &&
    oldLength < PauseWriterThreshold &&
    _unconsumedBytes >= PauseWriterThreshold &&
    !_readerCompletion.IsCompleted)
{
    _writerAwaitable.SetUncompleted();
}
```

А читатель отпускает писателя в `AdvanceReader`, когда `_unconsumedBytes` падает ниже порога возобновления (`Pipe.cs:607-613`). Здесь важна деталь: писатель тормозит не `Thread.Sleep`, а парковкой awaitable. Поток не простаивает, он уходит на другую работу.

Вот как выглядят пороги на шкале заполнения пайпа:

```text
0 байт          32 КБ                 64 КБ
|----------------|---------------------|---------------->
   писатель        resume               pause
   свободно        порог                порог

  < 32 КБ:        писатель не тормозит
  32 - 64 КБ:     писатель уже разбужен, но не запаркован
  >= 64 КБ:       FlushAsync паркует писателя, пока читатель не опустит ниже 32 КБ
```

Зачем два порога, а не один. Если бы порог был один, писатель дергался бы на каждой границе: чуть превысил - запарковался, чуть отпустил - разбудился. Это называется thrashing. Гистерезис между 64 и 32 КБ дает буфер, в котором писатель работает спокойно, а читатель успевает разгрести накопленное.

Есть еще защита от дедлока: если читатель ждет минимум N байт (`ReadAtLeastAsync`), а писатель как раз запаркован на пороге, читатель принудительно будит писателя (`Pipe.cs:835-838`).

## ReadOnlySequence и SequenceReader: парсим по кускам

`ReadOnlySequence<byte>` - это ответ на вопрос "как передать данные, которые лежат в нескольких несвязанных буферах, как одну логическую ленту". Он умеет `Length`, `IsSingleSegment` (`ReadOnlySequence.cs:41`), `FirstSpan` (`ReadOnlySequence.cs:55`) и `Slice`.

Но вручную по нему ходить неудобно. Для этого есть `SequenceReader<T>` (`SequenceReader.cs:42`), структура поверх последовательности. У нее есть `Remaining`, `Position`, `UnreadSpan`, `TryRead`, `Advance`, `Rewind`. Вся прелесть в том, что пока нужные байты лежат в одном сегменте, `SequenceReader` отдает их как обычный `ReadOnlySpan` без копирования. Копирование включается только когда данные реально разорваны между сегментами, и то не всегда.

Вот основные операции `SequenceReader` на примерах.

Создание и проверка, сколько осталось:

```csharp
var reader = new SequenceReader<byte>(buffer);

if (reader.Remaining < 4)
    return false; // даже заголовок не влез
```

Чтение числа в big-endian:

```csharp
if (!reader.TryReadBigEndian(out int length))
    return false; // не хватило байтов, позиция не сдвинулась
```

Важно: если `TryReadBigEndian` вернул `false`, курсор `reader.Position` не двигается. Можно спокойно подождать еще данных и попробовать снова.

Просмотр без потребления:

```csharp
// посмотреть следующие 2 байта, не сдвигая курсор
ReadOnlySpan<byte> peek = reader.UnreadSpan;
if (peek.Length >= 2 && peek[0] == 0xAB && peek[1] == 0xCD)
{
    reader.Advance(2); // теперь двигаем
}
```

Чтение до разделителя (например, строки до `\n`):

```csharp
if (reader.TryReadTo(out ReadOnlySpan<byte> line, (byte)'\n'))
{
    // line - кусок до перевода строки, без копии, если он в одном сегменте
    Process(line);
}
```

Если строка разорвана между сегментами, `TryReadTo` с `ReadOnlySpan` вернет `false`, потому что span не может пересекать границу сегмента. Для этого случая есть перегрузка с `ReadOnlySequence<byte>`, которая умеет отдавать составной кусок.

Ключевое различие, которое стоит усвоить: `reader.Position` - это курсор чтения внутри `SequenceReader`, а `reader.Consumed` - сколько байтов уже пройдено. Когда вы передаете данные наружу, вы обычно используете `reader.Position` как новую границу потребленного.

## Собираем протокол поверх нашего TCP-сервера

Теперь соединим это с прошлым уроком. Берем принятый `Socket`, заводим `Pipe`, одна корутина качает байты из сокета в пайп, вторая их разбирает. Формат сообщения: 4 байта длины в big-endian, потом тело.

```csharp
using System;
using System.Buffers;
using System.IO.Pipelines;
using System.Net.Sockets;
using System.Threading.Tasks;

sealed class PipeConnection
{
    private readonly Socket _socket;
    private readonly Pipe _pipe;

    public PipeConnection(Socket socket)
    {
        _socket = socket;
        _socket.NoDelay = true;
        _pipe = new Pipe(new PipeOptions(
            pauseWriterThreshold: 64 * 1024,
            resumeWriterThreshold: 32 * 1024,
            minimumSegmentSize: 4096,
            useSynchronizationContext: false));
    }

    public Task RunAsync() => Task.WhenAll(FillPipeAsync(), ParsePipeAsync());

    private async Task FillPipeAsync()
    {
        PipeWriter writer = _pipe.Writer;
        try
        {
            while (true)
            {
                Memory<byte> memory = writer.GetMemory(4096);
                int bytesRead = await _socket.ReceiveAsync(memory, SocketFlags.None)
                    .ConfigureAwait(false);
                if (bytesRead == 0)
                    break;

                writer.Advance(bytesRead);

                FlushResult result = await writer.FlushAsync().ConfigureAwait(false);
                if (result.IsCompleted)
                    break;
            }
        }
        finally
        {
            await writer.CompleteAsync().ConfigureAwait(false);
        }
    }

    private async Task ParsePipeAsync()
    {
        PipeReader reader = _pipe.Reader;
        try
        {
            while (true)
            {
                ReadResult result = await reader.ReadAsync().ConfigureAwait(false);
                ReadOnlySequence<byte> buffer = result.Buffer;

                while (TryReadMessage(ref buffer, out ReadOnlySequence<byte> message))
                {
                    // важно: досылаем до AdvanceTo, иначе сегменты вернутся в пул
                    await EchoAsync(message).ConfigureAwait(false);
                }

                reader.AdvanceTo(buffer.Start, buffer.End);

                if (result.IsCompleted)
                    break;
            }
        }
        finally
        {
            await reader.CompleteAsync().ConfigureAwait(false);
        }
    }

    private static bool TryReadMessage(ref ReadOnlySequence<byte> buffer, out ReadOnlySequence<byte> message)
    {
        var reader = new SequenceReader<byte>(buffer);

        if (reader.Remaining < 4)
        {
            message = default;
            return false;
        }

        if (!reader.TryReadBigEndian(out int length))
        {
            message = default;
            return false;
        }

        if (reader.Remaining < length)
        {
            // тело еще не пришло целиком, оставляем буфер как есть
            message = default;
            return false;
        }

        message = reader.Sequence.Slice(reader.Position, length);
        buffer = reader.Sequence.Slice(reader.Position + length);
        return true;
    }

    private async ValueTask EchoAsync(ReadOnlySequence<byte> message)
    {
        foreach (ReadOnlyMemory<byte> segment in message)
        {
            await _socket.SendAsync(segment, SocketFlags.None).ConfigureAwait(false);
        }
    }
}
```

Разберем, что тут к чему.

`GetMemory(4096)` выдает участок текущего сегмента, куда можно читать прямо из сокета. `Advance(bytesRead)` говорит пайпу, сколько из этого реально занято. `FlushAsync` коммитит данные и будит читателя. Это классический цикл заполнения.

На стороне парсинга `ReadAsync` возвращает `ReadResult` с `ReadOnlySequence<byte>`. Мы крутим `TryReadMessage`, пока он не скажет "мало данных". Затем `AdvanceTo(buffer.Start, buffer.End)` сообщает две вещи: что мы реально потребили (`buffer.Start`, который сдвинулся после каждого полного сообщения) и до какого места мы все осмотрели (`buffer.End`). Именно второй аргумент управляет backpressure.

`TryReadMessage` не копирует. Он смотрит заголовок через `TryReadBigEndian`, проверяет, хватает ли тела, и если да, отдает `ReadOnlySequence` - срез исходной последовательности. Тело остается в тех же сегментах пайпа.

Отдельно про `EchoAsync`. Отправка идет по сегментам. В типичном случае сообщение лежит в одном сегменте, и это один `SendAsync` без копии. Если сообщение разорвано, будет несколько отправок, но байты все равно не копируются.

И самое важное: `EchoAsync` вызывается до `AdvanceTo`. Если сначала вернуть сегменты в пул, а потом отправить по ним данные, пайп успеет переиспользовать память под следующую запись, и вы отправите мусор. Порядок здесь не стилистический, а обязательный.

## Ловушки

**Забыли `AdvanceTo` - читатель встал.** Пока вы не сказали пайпу, сколько потребили, он считает данные необработанными, и backpressure в итоге запаркует писателя. В дебаге это выглядит как зависший сервер без ошибок.

**Нельзя держать `ReadResult.Buffer` после `AdvanceTo`.** После возврата сегментов в пул эта память уже чужая. Все, что нужно сохранить, копируйте до `AdvanceTo`.

**`GetMemory`/`GetSpan` без `Advance` - ошибка.** `GetMemory` не резервирует данные, он лишь выдает доступный участок. Пока не вызван `Advance`, пайп не знает, что вы туда что-то положили.

**Не предполагайте один сегмент.** `ReadOnlySequence` может состоять из нескольких кусков. Код, который делает `buffer.FirstSpan` и считает, что это все сообщение, рано или поздно сломается. Для этого и нужен `SequenceReader`.

**`Pipe` не делает ввод-вывод.** Это буфер, а не транспорт. Байты из сокета в него кладете вы, и обратно в сокет тоже пишете вы. Отсюда и две корутины: одна качает в пайп, вторая разбирает.

**`useSynchronizationContext: false` для сервера.** Иначе продолжения `await` попытаются вернуться в захваченный контекст, которого на сервере нет, и вы просто получите лишнюю работу. Kestrel выставляет это в `false`.

## Частые ошибки на примерах

Соберу грабли в виде "было / стало".

**Забыли `AdvanceTo`.**

```csharp
// было: читатель встал, писатель запаркован навсегда
ReadResult result = await reader.ReadAsync();
ReadOnlySequence<byte> buffer = result.Buffer;
Process(buffer);
// AdvanceTo забыли

// стало: всегда сообщаем, что прочитали
ReadResult result2 = await reader.ReadAsync();
ReadOnlySequence<byte> buffer2 = result2.Buffer;
Process(buffer2);
reader.AdvanceTo(buffer2.End);
```

**Использование буфера после `AdvanceTo`.**

```csharp
// было: данные уже вернулись в пул и перезаписаны
ReadResult result = await reader.ReadAsync();
byte[] copy = result.Buffer.ToArray(); // это ок, копия сделана
reader.AdvanceTo(result.Buffer.End);
// а вот так нельзя: result.Buffer уже чужая память
```

Правило: все, что нужно сохранить за пределами обработки, копируйте до `AdvanceTo`.

**`GetMemory` без `Advance`.**

```csharp
// было: пайп не знает, что данные записаны
Memory<byte> memory = writer.GetMemory(1024);
memory.Span[0] = 42;
// Advance забыли, данные потеряны

// стало
Memory<byte> memory2 = writer.GetMemory(1024);
memory2.Span[0] = 42;
writer.Advance(1);
await writer.FlushAsync();
```

**Предположение об одном сегменте.**

```csharp
// было: сломается, если сообщение разорвано
ReadOnlySpan<byte> first = buffer.FirstSpan;
Process(first); // обработает только первый кусок

// стало: идем через SequenceReader или по сегментам
var reader = new SequenceReader<byte>(buffer);
while (reader.TryReadBigEndian(out int value))
{
    Process(value);
}
```

**Повторное ожидание `ValueTask`.**

```csharp
// было: ошибка, ValueTask нельзя await дважды
ValueTask<ReadResult> task = reader.ReadAsync();
ReadResult r1 = await task;
ReadResult r2 = await task; // InvalidOperationException

// стало: ждем один раз и сохраняем результат
ValueTask<ReadResult> task2 = reader.ReadAsync();
ReadResult result = await task2;
Use(result);
```

**Отправка после возврата сегментов.**

```csharp
// было: сегменты вернулись в пул, память перезаписана
reader.AdvanceTo(buffer.End);
await SendAsync(buffer); // отправляем мусор

// стало: сначала используем данные, потом сообщаем о потреблении
await SendAsync(buffer);
reader.AdvanceTo(buffer.End);
```

## Что в итоге

`System.IO.Pipelines` решает ровно одну задачу: превратить поток байтов в удобные логические куски, не копируя их и не аллоцируя на каждом шаге. Сегменты берутся из пула, буферы из `MemoryPool`/`ArrayPool`, асинхронность идет через `IValueTaskSource` без `Task`, а `ReadOnlySequence` и `SequenceReader` дают доступ к данным, даже если они разорваны между сегментами.

Вместе с прошлым уроком получается полный низкоуровневый стек: `SocketAsyncEventArgs` или `Pipe` для транспорта, `Pipe` и `SequenceReader` для протокола. И на всем пути, от `recv` до разобранного сообщения, ни одной лишней аллокации.

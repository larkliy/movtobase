---
title: "Безаллокационный TCP-сервер на C#: ноль байт из кучи в горячем пути"
description: "SocketAsyncEventArgs, IOCP и epoll, ноль аллокаций на соединение."
course: csharp
article: 5
duration: 14
tags: ["TCP", "sockets", "zero-allocation"]
---

Давайте я покажу вам два сервера. Первый пишут в туториалах, он занимает десять строк и на локальном ноутбуке показывает миллион запросов в секунду. Второй выглядит страшнее, но под реальной нагрузкой держит p99 latency ровным, пока первый уже тонет в паузах сборщика мусора. Разница между ними не в сети и не в железе, а в том, сколько объектов они рождают в куче.

## На пальцах: почему мусор в сервере это боль

Сначала разберемся, почему вообще аллокации в серверном коде так важны. В .NET выделить объект дешево: это сдвиг указателя, о чем мы говорили в уроке про GC. Дорого стоит не выделение, а уборка.

Объекты живут в **куче**, разбитой на **поколения**. Молодые объекты попадают в gen0. Когда gen0 заполняется, сборщик запускает **сборку**: останавливает все потоки приложения, проходит по живым объектам и переносит их дальше. Эта остановка называется **паузой GC**. Для сервера пауза означает, что запросы в этот момент не обрабатываются.

Теперь представьте сервер, который на каждый запрос создает десяток объектов. Пятьдесят тысяч запросов в секунду - это полмиллиона объектов. Gen0 переполняется постоянно, сборки идут одна за другой, и в хвостах latency (тот самый p99) появляются пики. Средняя latency может остаться неплохой, но один процент самых медленных запросов будет плохим именно из-за пауз.

Различают две метрики. **Пропускная способность** (throughput) - сколько запросов в секунду сервер переваривает. **Задержка** (latency) - сколько времени занимает один запрос. Можно иметь высокую пропускную способность и плохую задержку одновременно. Для интерактивных сервисов задержка важнее, и именно ее портят паузы GC.

Хорошая новость: большая часть этого мусора не нужна. Буфер можно переиспользовать, вместо `Task` использовать callback, а состояние операции хранить в одном объекте на все соединение. Этим и занимается `SocketAsyncEventArgs`.

## Словарь терминов

**Аллокация** - выделение нового объекта в куче.

**Gen0 / gen1 / gen2** - поколения объектов в куче. Молодые живут в gen0, пережившие сборку переезжают дальше.

**Пауза GC** - момент, когда сборщик останавливает потоки приложения, чтобы прибрать мусор.

**Throughput (пропускная способность)** - сколько работы сервер делает в единицу времени.

**Latency (задержка)** - сколько времени занимает одна операция. p99 - задержка, которую не превысили 99 процентов запросов.

**SAEA (SocketAsyncEventArgs)** - переиспользуемая структура-коробка для одной асинхронной операции над сокетом.

**IOCP (Input/Output Completion Port)** - механизм Windows для асинхронного ввода-вывода. Ядро выполняет операцию и кладет результат в очередь завершений.

**Overlapped** - нативная структура Windows, описывающая асинхронную операцию. `PreAllocatedOverlapped` - заранее выделенная обертка над ней.

**epoll** - механизм Unix для отслеживания готовности множества сокетов. Аналог IOCP, но работает по-другому: сообщает, когда сокет готов, а не когда операция завершена.

**Edge-triggered (по фронту)** - режим epoll, при котором уведомление приходит один раз при изменении состояния. Надо вычитать все доступные данные, иначе уведомление потеряется.

**Level-triggered (по уровню)** - режим, при котором уведомление повторяется, пока есть данные. Проще, но менее эффективен.

**DMA (Direct Memory Access)** - способ, которым устройство пишет в память напрямую, без участия процессора. Ядро Windows использует его для сетевого ввода-вывода.

**Pinning (пиннинг)** - запрет сборщику перемещать объект. Нужен, пока ядро пишет в буфер.

**ThreadPool** - пул потоков для выполнения задач.

**State machine (машина состояний)** - объект, в который компилятор превращает асинхронный метод с `await`.

**ExecutionContext** - контекст выполнения: `AsyncLocal`, `Activity`, данные логирования. Захват контекста может аллоцировать.

**AsyncLocal** - переменная, значение которой свое для каждого асинхронного потока управления.

**Callback** - функция, которую вызывают по завершении операции.

**Work item** - единица работы, которую ThreadPool ставит в очередь.

**Backlog** - очередь входящих соединений, которые ядро держит до вызова `Accept`.

**NoDelay** - опция сокета, отключающая алгоритм Нейгла. Полезно для интерактивных протоколов.

**ArrayPool** - пул переиспользуемых массивов.

**POH (Pinned Object Heap)** - куча для объектов, закрепленных навсегда. Позволяет пинить без создания GC-хэндла.

**CancellationToken** - токен для отмены операции.

## Сервер, который мусорит

Вот так пишут почти все:

```csharp
var listener = new TcpListener(IPAddress.Any, 5000);
listener.Start();

while (true)
{
    using TcpClient client = await listener.AcceptTcpClientAsync();
    _ = HandleAsync(client);
}

static async Task HandleAsync(TcpClient client)
{
    byte[] buffer = new byte[4096];
    NetworkStream stream = client.GetStream();

    while (true)
    {
        int read = await stream.ReadAsync(buffer);
        if (read == 0) break;
        await stream.WriteAsync(buffer.AsMemory(0, read));
    }
}
```

Что тут происходит с памятью, когда приходит тысяча соединений. На каждое соединение создается `TcpClient`, `NetworkStream` и массив `byte[4096]`. На каждую операцию чтения-записи - `Task`, продолжения, регистрации в пуле, плюс state machine асинхронного метода, который компилятор размещает в куче при первом реальном ожидании. Пятьдесят тысяч запросов в секунду превращаются в миллионы маленьких объектов, которые переживают одну сборку gen0 и промоутятся в gen1.

Посчитаем по объектам, чтобы стало наглядно. Возьмем одно соединение и один цикл чтения-записи:

| Что | Когда создается | Размер примерно |
|---|---|---|
| `TcpClient` | на соединение | 40 байт |
| `NetworkStream` | на соединение | 40 байт |
| `byte[4096]` | на соединение | 4 КБ плюс заголовок |
| state machine `HandleAsync` | при первом `await` | 100+ байт |
| `Task` от `ReadAsync` | на каждое чтение | 70+ байт |
| `Task` от `WriteAsync` | на каждую запись | 70+ байт |
| продолжения и регистрации | на каждое ожидание | десятки байт |

На соединение с 100 обменами это тысячи объектов. Умножьте на тысячи одновременных соединений - и получите постоянный поток мусора, который GC не успевает разгребать.

.NET аллоцирует быстро, бампом указателя. Проблема не в скорости аллокации, а в том, что заполненный gen0 рано или поздно останавливает потоки. Для сервера это прямой удар по хвостам latency. И самое обидное - большая часть этого мусора не нужна вообще. Массив можно переиспользовать, `Task` не создавать, а состояние операции хранить в одном объекте на все соединение.

## SocketAsyncEventArgs: коробка, которую создают один раз

`SocketAsyncEventArgs` (дальше SAEA) - это переиспользуемая коробка под одну асинхронную операцию над сокетом. Не под соединение, а именно под операцию: положили буфер, запустили чтение, получили результат, очистили, запустили следующее. Вся суть в том, что коробка живет долго, а операций через нее проходит бесконечно много.

API устроен необычно для .NET. Метод не возвращает `Task`, он возвращает `bool`:

```csharp
SocketAsyncEventArgs args = new SocketAsyncEventArgs(unsafeSuppressExecutionContextFlow: true);

args.SetBuffer(buffer, 0, buffer.Length);
args.Completed += OnCompleted;

bool pending = socket.ReceiveAsync(args);
if (!pending)
{
    // операция завершилась прямо здесь, до возврата
    OnCompleted(socket, args);
}
```

`true` значит операция повисла и callback придет позже. `false` значит она завершилась синхронно, и callback надо вызвать руками. Забыть про второй случай - классическая ошибка, из-за которой сервер молча перестает обслуживать соединение. Компилятор вам не подскажет, потому что `bool` он не проверяет.

Обратите внимание на `unsafeSuppressExecutionContextFlow: true`. Это не случайный флаг, за ним стоит конкретная строчка в рантайме.

## Что внутри коробки

Открываем `src/libraries/System.Net.Sockets/src/System/Net/Sockets/SocketAsyncEventArgs.cs`. Ключевые поля:

```csharp
// SocketAsyncEventArgs.cs:21
private Memory<byte> _buffer;
// SocketAsyncEventArgs.cs:72
private readonly bool _flowExecutionContext;
// SocketAsyncEventArgs.cs:87
private OperationState _operating; // Configuring = -1, Free = 0, InProgress = 1, Disposed = 2
```

А теперь `StartOperationCommon`, который вызывается перед каждой нативной операцией:

```csharp
// SocketAsyncEventArgs.cs:565
if (_flowExecutionContext ||
    (SocketsTelemetry.Log.IsEnabled() && (operation == SocketAsyncOperation.Connect || operation == SocketAsyncOperation.Accept)))
{
    _context = ExecutionContext.Capture(); // SocketAsyncEventArgs.cs:568
}
```

`ExecutionContext.Capture()` - это захват всего контекста выполнения на каждой операции. Если у вас есть `AsyncLocal`, `Activity` из OpenTelemetry или логирование через контекст, объект не пустой, и захват стоит аллокации. Дефолтный конструктор `SocketAsyncEventArgs()` выставляет `_flowExecutionContext = true` (`SocketAsyncEventArgs.cs:91`), а конструктор с `unsafeSuppressExecutionContextFlow: true` (`SocketAsyncEventArgs.cs:100`) его выключает. Рантайм сам этим пользуется: в `Socket.Tasks.cs` кэшированный `AwaitableSocketAsyncEventArgs` создается через `base(unsafeSuppressExecutionContextFlow: true)`, потому что `Task`/`ValueTask` выше уже разобрались с контекстом.

Теперь `_operating`. Это маленький state machine, который защищает коробку от повторного использования. Вот `SetBuffer` дергает `StartConfiguring` (`SocketAsyncEventArgs.cs:525`):

```csharp
private void StartConfiguring()
{
    OperationState status = Interlocked.CompareExchange(ref _operating, OperationState.Configuring, OperationState.Free);
    if (status != OperationState.Free)
    {
        ThrowForNonFreeStatus(status);
    }
}
```

Если операция еще в полете, вызов кинет `InvalidOperationException` с текстом `net_socketopinprogress`. Один SAEA - одна операция за раз. Это не баг, это защита от гонки, и об этом легко забыть.

Вот этот state machine на схеме:

```text
                  SetBuffer / запуск операции
        Free (0) ------------------------------> Configuring (-1)
           ^                                          |
           |                                          | StartOperation
           | CompleteCore                             v
           |                                     InProgress (1)
           |                                          |
           +------------------------------------------+
                          операция завершена

        из любого состояния ---> Disposed (2) при Dispose
```

Правила простые: пока не пришел `Completed`, состояние `InProgress`, и трогать SAEA нельзя. `SetBuffer` до старта операции переводит в `Configuring`. После завершения рантайм возвращает `Free`, и коробку можно готовить к следующей операции. Если попытаться настроить SAEA, пока он занят, получите исключение, а не тихую порчу данных.

## Windows: IOCP, overlapped и долгий пин

Чтобы понять этот раздел, разберемся с двумя словами. **Overlapped** - это нативная структура Windows, описывающая асинхронную операцию ввода-вывода. Вы заполняете ее буфером и параметрами, отдаете ядру, и ядро само выполняет операцию, пока ваш поток занимается другими делами. **IOCP** (Input/Output Completion Port) - это очередь, в которую ядро кладет уведомление о завершении. Поток берет из очереди готовые операции и обрабатывает их. Смысл в том, что поток не ждет, а разбирает уже завершенное.

Модель Windows принципиально асинхронная на уровне ядра: вы запускаете `WSARecv`, и он возвращается сразу, а данные придут позже. Именно поэтому буфер нельзя двигать все время операции, и его приходится пинить.

На Windows файл `SocketAsyncEventArgs.Windows.cs`. Каждая коробка в конструкторе создает `PreAllocatedOverlapped`:

```csharp
// SocketAsyncEventArgs.Windows.cs, InitializeInternals
_preAllocatedOverlapped = PreAllocatedOverlapped.UnsafeCreate(s_completionPortCallback, _strongThisRef, null);
```

Это нативная структура `OVERLAPPED` плюс callback, выделенная один раз. В горячем пути `WSARecv`/`WSASend` берут ее через `AllocateNativeOverlapped` и отдают ядру. На операцию - ноль нативных аллокаций.

Но с буфером все интереснее. Смотрите `ProcessIOCPResult`:

```csharp
if (!bufferToPin.Equals(default))
{
    _singleBufferHandle = bufferToPin.Pin();
}
```

На Windows ядро пишет в буфер асинхронно, через DMA, пока операция висит в IOCP. Значит буфер нельзя двигать сборщиком. Рантайм его пинит на все время операции, `MemoryHandle` лежит в поле SAEA, а освобождается в `CompleteCore`. Если вы берете буфер из `ArrayPool<byte>.Shared`, на каждую операцию создается GC-хэндл и пин. Это не куча, но это работа и давление на GC: закрепленные объекты усложняют компактировку.

Хитрость: `GC.AllocateUninitializedArray<byte>(size, pinned: true)` создает массив, закрепленный навсегда, в отдельной куче. `Memory<T>.Pin()` над таким массивом почти бесплатен. Если число соединений фиксировано, это лучший вариант.

Еще одна деталь из того же файла - `_asyncCompletionOwnership`, `ulong`, через который поток-запускатель и IOCP-callback договариваются, кто владеет завершением. Когда операция завершается синхронно, но хэндл не помечен `SkipCompletionPortOnSuccess`, рантайм не вызывает callback, а ждет пакет из IOCP. Если callback успел раньше, чем поток закончил настройку, владение переходит запускающему потоку, и операция обрабатывается как синхронная. Это экономит переключение контекста на быстрых accept'ах.

## Unix: epoll, один поток и короткий пин

**epoll** - это механизм Unix, который решает похожую задачу, но иначе. Вы регистрируете в нем набор сокетов и говорите "разбуди меня, когда на каком-нибудь из них появятся данные". Ядро держит этот набор и сообщает о готовности. Ключевое отличие от IOCP: epoll сообщает о **готовности** ("на этом сокете можно читать"), а не о **завершении операции**. Само чтение вы делаете потом, синхронно, но только когда ядро гарантировало, что данные есть.

Отсюда и короткий пин на Unix: `recv` выполняется быстро, данные копируются сразу, и буфер закреплен только на время этого вызова. Никакого длительного DMA, как на Windows.

На Unix все иначе. Здесь нет IOCP. Есть `SocketAsyncEngine` (`SocketAsyncEngine.Unix.cs`), который крутит `epoll_wait` в цикле. Загляните в нативный шим `src/native/libs/System.Native/pal_networking.c`:

```c
// pal_networking.c:3205
evt.events = GetEPollEvents(newEvents) | (unsigned int)EPOLLET;
evt.data.ptr = (void*)data;
int err = epoll_ctl(port, op, socket, &evt);
```

`EPOLLET` - edge-triggered режим. После одного уведомления надо вычерпать сокет до `EWOULDBLOCK`, иначе уведомление потеряется. Поэтому в `SocketAsyncContext.Unix.cs` есть `OperationQueue` с `_sequenceNumber` и состояниями `Ready/Waiting/Processing/Stopped`. Логика описана прямо в комментарии начиная со строки 749.

Движок создает поток `.NET Sockets` (`SocketAsyncEngine.Unix.cs:200`). Сколько их? Смотрите `GetEngineCount` (`SocketAsyncEngine.Unix.cs:49`): на x64 рантайм считает один движок на 30 ядер, на ARM - на 12. На обычной 16-ядерной машине это ровно один поток, который читает epoll и раскидывает события. Переопределяется переменной окружения `DOTNET_SYSTEM_NET_SOCKETS_THREAD_COUNT`.

События не обрабатываются в потоке epoll. Рантайм пакует их и кидает в ThreadPool:

```csharp
// SocketAsyncEngine.Unix.cs:301-308
for (int i = 0; i < count; i += MaxTreeSize)
{
    int treeSize = Math.Min(MaxTreeSize, count - i);
    SocketIOEvent root = asyncEvents[i];
    LinkChildren(root, new ReadOnlySpan<SocketIOEvent>(asyncEvents, i + 1, treeSize - 1));
    ThreadPool.UnsafeQueueUserWorkItem(root, preferLocal: false);
}
```

Зачем тут бинарное дерево? Чтобы на пачку из 1024 событий поставить в ThreadPool не 1024 work item, а около 32. Корень дерева при выполнении распаковывает детей в локальные очереди. `SocketIOEvent` берутся из пула `_eventPool` (`ConcurrentQueue<SocketIOEvent>`), так что на каждое событие аллокации нет.

А буфер на Unix пинится ровно на время системного вызова. Смотрите `SocketPal.Unix.cs`:

```csharp
// SocketPal.Unix.cs, TryCompleteReceive
fixed (byte* b = &MemoryMarshal.GetReference(buffer))
{
    errno = Interop.Sys.Recv(...);
}
```

Ядро копирует данные синхронно во время `recv`, потому что операция выполняется только когда epoll сказал, что сокет готов. Никакого длительного пина через асинхронный DMA тут нет. Для аллокаций и для GC это огромное преимущество Unix-пути.

Сводка различий:

| Что | Windows (IOCP) | Unix (epoll) |
|---|---|---|
| Кто ждет готовность | ядро, IOCP | поток `.NET Sockets`, `epoll_wait` |
| Буфер закреплен | на всю операцию | только внутри `recv`/`send` |
| Нативная структура на операцию | `PreAllocatedOverlapped`, одна на SAEA | нет |
| Диспетчеризация завершения | IOCP-порт | ThreadPool, батчами по дереву |
| Захват `ExecutionContext` | на каждой операции | на каждой операции |

## Собираем сервер

Идея простая: на каждое соединение один объект `Connection`, внутри два SAEA (чтение и запись) и один буфер из пула. Ни одного `await` в горячем пути.

```csharp
using System;
using System.Buffers;
using System.Net;
using System.Net.Sockets;

sealed class EchoServer
{
    private const int BufferSize = 16 * 1024;

    private readonly Socket _listener;
    private readonly SocketAsyncEventArgs _acceptArgs =
        new SocketAsyncEventArgs(unsafeSuppressExecutionContextFlow: true);

    public EchoServer(IPEndPoint endPoint)
    {
        _listener = new Socket(endPoint.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
        _listener.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
        _listener.Bind(endPoint);
        _listener.Listen(512);
    }

    public void Start()
    {
        _acceptArgs.Completed += OnAccept;
        StartAccept();
    }

    private void StartAccept()
    {
        _acceptArgs.AcceptSocket = null;
        if (!_listener.AcceptAsync(_acceptArgs))
        {
            OnAccept(_listener, _acceptArgs);
        }
    }

    private void OnAccept(object? sender, SocketAsyncEventArgs e)
    {
        if (e.SocketError == SocketError.Success)
        {
            Socket socket = e.AcceptSocket!;
            socket.NoDelay = true;
            _ = new Connection(socket, BufferSize);
        }

        StartAccept();
    }
}
```

Теперь само соединение. `SetBuffer` вызывается либо до старта, либо после завершения, когда SAEA снова `Free`.

```csharp
sealed class Connection
{
    private readonly Socket _socket;
    private readonly byte[] _buffer;
    private readonly SocketAsyncEventArgs _recv =
        new SocketAsyncEventArgs(unsafeSuppressExecutionContextFlow: true);
    private readonly SocketAsyncEventArgs _send =
        new SocketAsyncEventArgs(unsafeSuppressExecutionContextFlow: true);

    private int _sendOffset;
    private int _sendCount;

    public Connection(Socket socket, int bufferSize)
    {
        _socket = socket;
        _buffer = ArrayPool<byte>.Shared.Rent(bufferSize);

        _recv.UserToken = this;
        _recv.SetBuffer(_buffer, 0, _buffer.Length);
        _recv.Completed += OnReceive;

        _send.UserToken = this;
        _send.Completed += OnSend;

        StartReceive();
    }

    private void StartReceive()
    {
        if (!_socket.ReceiveAsync(_recv))
        {
            OnReceive(_socket, _recv);
        }
    }

    private void OnReceive(object? sender, SocketAsyncEventArgs e)
    {
        if (e.SocketError != SocketError.Success || e.BytesTransferred == 0)
        {
            Close();
            return;
        }

        _sendOffset = 0;
        _sendCount = e.BytesTransferred;
        StartSend();
    }

    private void StartSend()
    {
        _send.SetBuffer(_buffer, _sendOffset, _sendCount);
        if (!_socket.SendAsync(_send))
        {
            OnSend(_socket, _send);
        }
    }

    private void OnSend(object? sender, SocketAsyncEventArgs e)
    {
        if (e.SocketError != SocketError.Success)
        {
            Close();
            return;
        }

        _sendOffset += e.BytesTransferred;
        _sendCount -= e.BytesTransferred;

        if (_sendCount > 0)
        {
            StartSend();
            return;
        }

        StartReceive();
    }

    private void Close()
    {
        ArrayPool<byte>.Shared.Return(_buffer);
        _socket.Dispose();
    }
}
```

Считаем аллокации на соединение:

- `Socket` для принятого соединения создает сам рантайм в `GetOrCreateAcceptSocket` (`Socket.cs:2862`). Это единственная аллокация, которую обойти нельзя: у соединения должно быть управляемое состояние.
- `byte[]` берется из `ArrayPool<byte>.Shared`. Первый рент аллоцирует массив, дальше он переиспользуется между соединениями.
- Два `SocketAsyncEventArgs` и объект `Connection` - по одному на соединение.
- На каждую операцию чтения или записи: ноль управляемых аллокаций.

Про `AcceptSocket`. В `Socket.cs:2862` рантайм делает `GetOrCreateAcceptSocket(e.AcceptSocket, ...)`. Если не обнулить `e.AcceptSocket` перед следующим `AcceptAsync`, он попробует переиспользовать уже отданный вам сокет. Поэтому в `StartAccept` стоит `_acceptArgs.AcceptSocket = null`. На Unix, кстати, рантайм все равно создает временный `Socket` под капотом и копирует состояние в ваш (`FinishOperationAccept` в `SocketAsyncEventArgs.Unix.cs`), так что сэкономить там не выйдет.

## Ловушки

**CancellationToken в горячем пути аллоцирует.** В `SocketAsyncContext.Unix.cs:892` и в Windows-варианте регистрация делается только если `cancellationToken.CanBeCanceled`. `CancellationToken.None` не может быть отменен, регистрации нет. Как только вы передаете отменяемый токен на каждую операцию, рантайм делает `UnsafeRegister`, а это структура регистрации и потенциальная аллокация. Не тащите токен туда, где он не нужен.

**`await socket.ReceiveAsync(memory)` не равен нулевым аллокациям.** Рантайм держит кэшированный `AwaitableSocketAsyncEventArgs` на сокет (`Socket.Tasks.cs:19-21`), и `ValueTask` - структура. Но если операция реально повиснет, компилятор разместит state machine вашего асинхронного метода в куче. Если метод завершается синхронно, аллокации нет. Для гарантированного нуля в горячем пути - callback'и на SAEA, а не `await`.

**Один кэшированный SAEA на сокет - это один опережающий receive.** Перегрузки в `Socket.Tasks.cs` берут SAEA через `Interlocked.Exchange(ref _singleBufferReceiveEventArgs, null)`. Если запустить второй `ReceiveAsync(Memory)` на том же сокете, пока первый висит, кэш пуст, и рантайм создаст второй SAEA. Для пайплайна с несколькими одновременными операциями на сокет используйте явный пул SAEA, а не `ValueTask`-перегрузки.

**Буфер нельзя возвращать в пул раньше завершения.** На Windows ядро пишет в него асинхронно. Вернете в `ArrayPool` в момент старта операции - получите порчу данных, которые уже отданы другому соединению. Возвращайте только в колбэке завершения.

**`SetBuffer` во время операции кинет исключение.** Один SAEA - одна операция за раз. Не переиспользуйте SAEA, пока не пришел `Completed`.

**`SocketError.IOPending` не приходит наружу как исключение.** `AcceptAsync`/`ReceiveAsync`/`SendAsync` возвращают `bool`. Забыть про синхронный случай и не вызвать callback - классическая ошибка, сервер просто перестанет обслуживать соединение.

## Частые ошибки на примерах

Соберу главные грабли в виде "было / стало".

**Забыли синхронный случай.**

```csharp
// было: если ReceiveAsync вернул false, callback не придет, сервер встал
_socket.ReceiveAsync(_recv);

// стало: проверяем bool и вызываем callback руками
if (!_socket.ReceiveAsync(_recv))
{
    OnReceive(_socket, _recv);
}
```

Это ошибка номер один, потому что компилятор не подсказывает: `bool` можно проигнорировать без предупреждения.

**Вернули буфер в пул до завершения операции.**

```csharp
// было: ядро еще пишет в буфер, а он уже отдан другому соединению
_socket.SendAsync(_send);
ArrayPool<byte>.Shared.Return(_buffer); // порча данных

// стало: возвращаем только в колбэке завершения
private void OnSend(object? sender, SocketAsyncEventArgs e)
{
    // ...
    if (_sendCount == 0)
    {
        ArrayPool<byte>.Shared.Return(_buffer);
        _socket.Dispose();
    }
}
```

**Настройка SAEA во время операции.**

```csharp
// было: InvalidOperationException, коробка занята
_socket.ReceiveAsync(_recv);
_recv.SetBuffer(other, 0, other.Length); // падение

// стало: настраиваем только когда коробка Free
if (!_socket.ReceiveAsync(_recv))
    OnReceive(_socket, _recv);
// менять буфер можно только после Completed
```

**Переиспользование AcceptSocket без сброса.**

```csharp
// было: рантайм попробует переиспользовать уже отданный сокет
private void StartAccept()
{
    _listener.AcceptAsync(_acceptArgs); // AcceptSocket не сброшен
}

// стало: обнуляем перед следующим accept
private void StartAccept()
{
    _acceptArgs.AcceptSocket = null;
    if (!_listener.AcceptAsync(_acceptArgs))
        OnAccept(_listener, _acceptArgs);
}
```

**Отменяемый токен в горячем пути.**

```csharp
// было: на каждую операцию регистрация и аллокация
await socket.ReceiveAsync(memory, cancellationToken); // token CanBeCanceled

// стало: либо CancellationToken.None, либо вообще callback API
if (!socket.ReceiveAsync(_recv)) // без токена
    OnReceive(socket, _recv);
```

Если отмена нужна, держите один токен на соединение и не создавайте новый на каждую операцию.

**`await` там, где нужен гарантированный ноль.**

```csharp
// было: при реальном ожидании создается state machine в куче
while (true)
{
    int n = await socket.ReceiveAsync(memory);
    if (n == 0) break;
    await socket.SendAsync(memory.Slice(0, n));
}

// стало: callback-цикл на SAEA, ноль управляемых аллокаций на операцию
private void OnReceive(object? sender, SocketAsyncEventArgs e)
{
    // ... обработали, запустили следующую операцию ...
    if (!_socket.ReceiveAsync(_recv))
        OnReceive(_socket, _recv);
}
```

`await`-версия вполне нормальна для обычного кода: `ValueTask` и кэшированный SAEA сильно снижают аллокации. Но если вы целитесь ровно в ноль на горячем пути, callback надежнее.

## Как проверить, что аллокаций нет

Не верьте на слово, замеряйте.

Простейший способ - счетчик аллокаций текущего потока:

```csharp
long before = GC.GetAllocatedBytesForCurrentThread();
// ... прогон нагрузки ...
long after = GC.GetAllocatedBytesForCurrentThread();
Console.WriteLine($"allocated: {after - before} bytes");
```

Живые метрики:

```powershell
dotnet-counters monitor --counters System.Runtime --process-id <PID>
```

Смотрите `alloc-rate` и `gen-0-gc-count`. На безаллокационном сервере `alloc-rate` почти замирает после прогрева, а `gen-0-gc-count` перестает расти.

Для точного профиля с точками аллокаций - `dotnet-trace` или PerfView. Для микробенчмарков - BenchmarkDotNet с `[MemoryDiagnoser]`.

Полезные переменные окружения, которые меняют поведение сетевого движка:

- `DOTNET_SYSTEM_NET_SOCKETS_INLINE_COMPLETIONS=1` - выполнять продолжения прямо в потоке epoll, без ThreadPool. Меньше переключений контекста и latency, но если колбэк блокирует, встанет весь движок.
- `DOTNET_SYSTEM_NET_SOCKETS_THREAD_COUNT=<N>` - число потоков-движков. По умолчанию на x64 один движок на 30 ядер.

## Что в сухом остатке

`SocketAsyncEventArgs` - это коробка состояния, которую создают один раз и гоняют по кругу. `unsafeSuppressExecutionContextFlow: true` убирает `ExecutionContext.Capture()` из каждой операции. Буферы берутся из `ArrayPool<byte>`, а для фиксированного набора - через `GC.AllocateUninitializedArray<byte>(size, pinned: true)`, чтобы не пинить на Windows каждую операцию. Callback на `Completed` вместо `await` в горячем пути дает гарантированный ноль управляемых аллокаций на операцию. И помните про разницу: на Unix рантайм пинит буфер только внутри `recv`/`send`, на Windows - на всю операцию.

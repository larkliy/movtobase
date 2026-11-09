---
title: "Безаллокационный TCP-сервер на C#: ноль байт из кучи в горячем пути"
description: "SocketAsyncEventArgs, IOCP и epoll, ноль аллокаций на соединение."
course: csharp
article: 5
duration: 14
tags: ["TCP", "sockets", "zero-allocation"]
---

Стандартные примеры сетевого программирования на C# в документации выглядят просто и элегантно: `TcpListener`, цикл `AcceptTcpClientAsync`, чтение через `NetworkStream.ReadAsync` в цикле `while (true)` с ключевым словом `await`.

На локальном компьютере с синтетическим бенчмарком такой сервер легко покажет сотни тысяч запросов в секунду. Но стоит выкатить его в боевую эксплуатацию под реальную параллельную нагрузку в 50 000 RPS, как метрика p99 latency начнёт лихорадочно скакать.

Причина кроется не в сетевом стеке операционной системы и не в пропускной способности сетевой карты. Проблема в том, что стандартный `async/await` поверх `NetworkStream` генерирует лавину короткоживущих объектов в куче:

| Операция | Что аллоцируется | Почему |
|---|---|---|
| Новое соединение | `TcpClient`, `NetworkStream` | Классы-обёртки над дескриптором сокета |
| Буфер чтения | `new byte[4096]` | Выделение в куче Gen 0 |
| Каждый вызов `ReadAsync` | `Task<int>` или `ValueTaskSource` | Асинхронное ожидание результата |
| Захват контекста | `AsyncStateMachineBox<...>` | Компиляторная машина состояний `async` |
| Регистрация коллбэка | `Action`, `ExecutionContext` | Передача управления в ThreadPool |

На 50 000 запросов в секунду сервер порождает сотни тысяч объектов каждую секунду. Поколение Gen 0 переполняется непрерывно, вызывая постоянные микропаузы Stop-the-World. Средняя задержка (average latency) может оставаться приемлемой (например, 2 мс), но «хвост» распределения (p99 и p99.9) улетает в десятки и сотни миллисекунд именно из-за того, что запросы попадают в фазы сборки мусора.

Чтобы добиться идеально ровной линии p99, горячий путь обработки сокета должен быть переведён в режим **Zero-Allocation**: ноль байт из кучи на входящую операцию ввода-вывода.

---

## Архитектура SocketAsyncEventArgs

Главный инструмент безаллокационного сетевого ввода-вывода в .NET — класс `SocketAsyncEventArgs` (SAEA). 

Взглянем на устройство класса в `src/libraries/System.Net.Sockets/src/System/Net/Sockets/SocketAsyncEventArgs.cs`:

![SocketAsyncEventArgs в CoreCLR](/movtobase/images/csharp/code-saea-struct.svg)

Ключевая идея SAEA: **состояние асинхронной операции аллоцируется ровно один раз** (при старте сервера или при подключении клиента) и затем бесконечно переиспользуется для всех последующих операций чтения и записи.

Схема работы безаллокационного I/O-цикла:

![Архитектура SocketAsyncEventArgs: Zero-Allocation I/O Loop](/movtobase/images/csharp/saea-io-loop.svg)

### Как это устроено на уровне ядра ОС
1. **Windows (IOCP — I/O Completion Ports):**
   SAEA содержит поле `PreAllocatedOverlapped`. На Windows рантайм связывает сокет с портом завершения ввода-вывода (IOCP) и передаёт нативную структуру `OVERLAPPED` напрямую в системный вызов `WSARecv` / `WSASend`. Сетевая карта через DMA (Direct Memory Access) пишет байты напрямую в закрепленный буфер приложения. Когда операция завершается, системный поток пула IOCP извлекает пакет из очереди и вызывает обработчик `Completed` без переключения контекстов и аллокации Task.
2. **Linux (epoll):**
   Рантайм регистрирует файловый дескриптор сокета в системном `epoll` в режиме edge-triggered (`EPOLLET`). Специальный поток `SocketPal.Unix` отслеживает готовность сокета и при получении события вычитывает данные напрямую в буфер SAEA.

---

## Пул буферов в POH (Pinned Object Heap)

Чтобы ядро операционной системы могло безопасно выполнять DMA-запись в буфер вашего приложения, память буфера должна быть неподвижной (pinned).

Если использовать обычный массив из Gen 0 и закреплять его через `GCHandleType.Pinned`, сборщик мусора не сможет сдвинуть этот массив при дефрагментации, что приведёт к тяжелейшей фрагментации кучи.

Правильный подход — выделить большой монолитный блок байтов в **Pinned Object Heap (POH)** один раз при запуске приложения и нарезать его на сегменты для каждого SAEA:

```csharp
public sealed class BufferManager
{
    private readonly byte[] _bufferBlock;
    private readonly int _bufferSizePerSocket;
    private readonly Stack<int> _freeOffsets;

    public BufferManager(int maxConnections, int bufferSizePerSocket)
    {
        _bufferSizePerSocket = bufferSizePerSocket;
        int totalBytes = maxConnections * bufferSizePerSocket;

        // Выделяем монолитный массив сразу в куче закрепленных объектов (POH)
        _bufferBlock = GC.AllocateUninitializedArray<byte>(totalBytes, pinned: true);
        _freeOffsets = new Stack<int>(maxConnections);

        for (int i = 0; i < maxConnections; i++)
        {
            _freeOffsets.Push(i * bufferSizePerSocket);
        }
    }

    public void AssignBuffer(SocketAsyncEventArgs args)
    {
        int offset = _freeOffsets.Pop();
        args.SetBuffer(_bufferBlock, offset, _bufferSizePerSocket);
    }

    public void ReleaseBuffer(SocketAsyncEventArgs args)
    {
        _freeOffsets.Push(args.Offset);
        args.SetBuffer(null, 0, 0);
    }
}
```

---

## Реализация сервера: горячий цикл без Task и await

Построим ядро клиентского сеанса. Никаких `async Task` в цикле чтения: всё работает на событиях и проверке синхронного завершения:

```csharp
public sealed class ConnectionSession
{
    private readonly SocketAsyncEventArgs _readArgs;
    private Socket? _socket;

    public ConnectionSession(BufferManager bufferManager)
    {
        _readArgs = new SocketAsyncEventArgs();
        _readArgs.Completed += OnIOCompleted;
        bufferManager.AssignBuffer(_readArgs);
    }

    public void Start(Socket socket)
    {
        _socket = socket;
        _socket.NoDelay = true; // отключаем алгоритм Нейгла для мгновенной отправки

        // Запускаем первое чтение
        StartReceive();
    }

    private void StartReceive()
    {
        // Вызов ReceiveAsync:
        // Если возвращает true — операция выполняется асинхронно, сработает Completed
        // Если возвращает false — операция УЖЕ завершилась синхронно!
        bool pending = _socket!.ReceiveAsync(_readArgs);
        if (!pending)
        {
            ProcessReceive(_readArgs);
        }
    }

    private void OnIOCompleted(object? sender, SocketAsyncEventArgs e)
    {
        switch (e.LastOperation)
        {
            case SocketAsyncOperation.Receive:
                ProcessReceive(e);
                break;
            default:
                throw new InvalidOperationException($"Неожиданная операция: {e.LastOperation}");
        }
    }

    private void ProcessReceive(SocketAsyncEventArgs e)
    {
        // Проверка ошибок и штатного закрытия соединения клиентом
        if (e.SocketError != SocketError.Success || e.BytesTransferred == 0)
        {
            CloseConnection();
            return;
        }

        // Получаем срез прочитанных байт БЕЗ единой аллокации
        ReadOnlySpan<byte> receivedData = e.MemoryBuffer.Span.Slice(e.Offset, e.BytesTransferred);

        // Обработка бизнес-логики (например, эхо или парсинг команды)
        HandleRequest(receivedData);

        // Запускаем следующее чтение в ТОТ ЖЕ САМЫЙ экземпляр SAEA!
        StartReceive();
    }

    private void HandleRequest(ReadOnlySpan<byte> data)
    {
        // Парсим протокол прямо из спана
        // Никаких string, Task или замыканий!
    }

    private void CloseConnection()
    {
        try { _socket?.Shutdown(SocketShutdown.Both); } catch { }
        _socket?.Close();
        _socket = null;
    }
}
```

### Критический нюанс: синхронное завершение (pending == false)
Обратите внимание на проверку:

```csharp
bool pending = _socket.ReceiveAsync(_readArgs);
if (!pending)
{
    ProcessReceive(_readArgs);
}
```

Если данные уже находились в сетевом буфере сокета ядра ОС на момент вызова `ReceiveAsync`, рантайм вычитывает их немедленно и возвращает `false`. В этом случае событие `Completed` **не вызывается**! 

Если вы забудете обработать ветку `!pending`, ваше соединение просто зависнет навсегда. Обрабатывая синхронный исход напрямую, сервер экономит ещё больше циклов, полностью минуя диспетчеризацию через ThreadPool.

---

## Диагностика и телеметрия

Контроль за поведением сетевого стека и сборщика мусора осуществляется через подписку на события `Microsoft-Windows-DotNETRuntime` и `System.Net.Sockets`:

![Мониторинг событий сети и I/O через PerfView](/movtobase/images/csharp/perfview-events.png)

В правильно настроенном безаллокационном сервере график выделений памяти в процессе приёма трафика остаётся абсолютно горизонтальным. Все буферы живут в POH, SAEA переиспользуются, а сборщик мусора остаётся в спящем состоянии.

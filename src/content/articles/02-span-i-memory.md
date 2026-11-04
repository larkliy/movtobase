---
title: "Span<T> и Memory<T>: смотрим на память, не копируя ее"
description: "Стековые срезы, MemoryManager и как не копировать данные."
course: csharp
article: 2
duration: 17
tags: ["Span", "Memory", "allocations"]
---

Представьте, что вы пишете парсер CSV. Строка на входе - это `string`, 2 килобайта. Вы делите ее по запятым, каждое поле - это `Substring`. Пятьдесят полей - пятьдесят новых строк в куче. Потом вы эти поля парсите в числа. И вот уже горячий цикл обработки одной строки сгенерировал сотню объектов, которые умрут через микроволновку. GC недоволен, вы недоволен, p99 latency растет.

А ведь по-хорошему нам не нужны новые строки. Нам нужны окна в уже существующую память: "вот здесь, с 17-го по 24-й байт, лежит число". `Span<T>` и `Memory<T>` - это ровно такие окна. Указатель плюс длина. Никакого копирования.

Дальше я буду разбирать их по исходникам `System.Private.CoreLib` из `D:\runtime`, потому что вся суть этих типов видна именно в полях и в том, как рантайм обходится с ними.

## На пальцах: стек, куча и цена аллокации

Прежде чем нырять в `ref T _reference`, договоримся о базовых вещах. Если вы это знаете, пролистайте до словаря.

В .NET память живет в двух основных местах. **Стек** - это небольшая область на каждый поток, где лежат локальные переменные и адреса возврата. Выделение на стеке бесплатно: компилятор просто резервирует место, сдвигая указатель стека. **Куча** - это большая общая область, где живут объекты. Выделение в куче тоже быстро (сдвиг указателя), но у него есть цена: объект нужно потом собрать, а сборка мусора останавливает потоки и стоит времени.

Что значит "аллокация". Это выделение нового объекта в куче. Каждый `new`, каждый `Substring`, каждая конкатенация строк создают объект. Объект занимает память и требует работы GC, когда перестает быть нужен.

Вернемся к примеру с CSV. Строка `"42,hello,3.14"` уже лежит в куче, это один объект. Когда вы делаете `Substring`, рантайм создает **новую** строку и копирует в нее символы. Для 50 полей это 50 новых объектов. Каждый из них нужно выделить, а потом собрать. Вот откуда сотня объектов на одну строку входных данных.

А теперь идея `Span`. Вместо копирования символов мы храним два числа: "где начало" и "сколько символов". Указатель на символ внутри исходной строки плюс длина. Это и есть "окно". Никакого нового объекта, никакого копирования, никакой работы для GC.

```text
строка в куче:  [ 4 2 , h e l l o , 3 . 1 4 ]
                  ^         ^
                  |         |
   Span поле 1 ---+         |
   Span поле 2 -------------+
```

Оба span смотрят в ту же самую память. Просто с разных позиций и с разной длиной.

Вот та же операция в двух вариантах, чтобы разница была осязаемой:

```csharp
string line = "42,hello,3.14";

// вариант 1: две аллокации
string a = line.Substring(0, 2);    // новый объект string
string b = line.Substring(3, 5);    // еще один объект string

// вариант 2: ноль аллокаций
ReadOnlySpan<char> s = line.AsSpan();
ReadOnlySpan<char> a2 = s.Slice(0, 2);  // просто ссылка + длина
ReadOnlySpan<char> b2 = s.Slice(3, 5);  // просто ссылка + длина
```

Вариант 2 не создает ни одного объекта. `a2` и `b2` - это 16 байт на стеке, которые указывают внутрь `line`.

## Словарь терминов

**Аллокация** - выделение памяти под новый объект в куче.

**Стек** - область памяти потока для локальных переменных. Освобождается автоматически при выходе из метода.

**Куча** - область, где живут объекты. За ней следит сборщик мусора.

**GC (Garbage Collector, сборщик мусора)** - подсистема, которая находит объекты, ставшие ненужными, и освобождает их память.

**Managed reference (управляемая ссылка)** - ссылка на объект или его часть, которую видит и отслеживает GC. Если такая ссылка куда-то указывает, GC не тронет эту память.

**Interior pointer (внутренний указатель)** - ссылка не на начало объекта, а внутрь него. `Span<T>` держит именно такой указатель на элемент массива.

**ref struct** - структура, которая обязана жить на стеке. Компилятор запрещает класть ее в кучу.

**ref return / ref local** - возврат или хранение ссылки на переменную, а не ее копии. `ref T _reference` в `Span` - это ref-поле.

**Bounds check (проверка границ)** - проверка, что индекс не выходит за пределы массива или span. Каждое обращение `array[i]` содержит такую проверку.

**Intrinsic (интринсик)** - метод, который JIT не вызывает как обычный, а заменяет на специальный машинный код или на прямое обращение к данным.

**JIT (Just-In-Time)** - компилятор, который превращает IL в машинный код во время выполнения.

**Inlining (встраивание)** - замена вызова метода его телом прямо в месте вызова. Убирает накладные расходы на вызов.

**Backing object (несущий объект)** - объект, который реально владеет памятью. Для `Memory<T>` это массив, строка или `MemoryManager<T>`.

**Pinning (пиннинг)** - запрет сборщику перемещать объект. Нужен, когда нативный код держит указатель на управляемую память.

**GCHandle** - структура-дескриптор, через которую можно запинить объект и получить его адрес.

**Boxing (упаковка)** - превращение значимого типа в объект в куче. Требует аллокации.

**State machine (машина состояний)** - объект, в который компилятор превращает метод с `await`, чтобы приостановить и возобновить его.

**Lifetime (время жизни)** - как долго живет значение или ссылка. Главное правило span: он не живет дольше буфера, из которого сделан.

**stackalloc** - выделение буфера прямо на стеке. Не требует GC.

## Две структуры, одна идея

`Span<T>` и `Memory<T>` описывают одно и то же: непрерывный кусок памяти с началом и длиной. Разница в одном слове - `ref`.

```csharp
// Span.cs:28
public readonly ref struct Span<T>
{
    // Span.cs:31
    internal readonly ref T _reference;
    // Span.cs:33
    private readonly int _length;
}
```

`ref struct` - это структура, которая обязана жить на стеке. Компилятор и рантайм следят за тем, чтобы она никогда не оказалась в куче: ее нельзя упаковать в `object`, нельзя положить в поле класса, нельзя использовать в `async`-методе или в итераторе, потому что те превращаются в state machine на куче. Зато `ref T _reference` - это настоящая управляемая ссылка на элемент, которую видит GC. Она может указывать на массив, на стек (`stackalloc`), на нативную память. Рантайм знает, где эта ссылка, и не даст сборщику утащить массив, пока `Span` жив.

Вот сводка, что с `ref struct` можно, а что нельзя. Это стоит запомнить, потому что половина ошибок компиляции со span - именно отсюда.

| Действие | Можно? | Почему |
|---|---|---|
| Локальная переменная в методе | да | живет на стеке |
| Параметр метода | да | передается на стеке |
| Возврат из метода | да | если не ссылается на локальный буфер |
| Поле класса или структуры | нет | структура может уехать в кучу |
| Упаковка в `object` | нет | boxing создает объект в куче |
| Использование в `async`/`yield` | нет | метод превращается в state machine на куче |
| Захват в лямбду | нет | замыкание живет в куче |
| Элемент массива | нет | массив в куче |
| Поле `ref struct` внутри другого `ref struct` | да | обе на стеке |

Ключевое отличие `ref T` от обычного указателя `T*`. Указатель - это просто число, GC про него ничего не знает. Ссылка `ref T` - это тоже адрес, но рантайм умеет ее распознавать: при сборке мусора он понимает, что по этому адресу лежит живая ссылка, и корректирует ее, если объект переехал. Поэтому `Span` может спокойно указывать на массив, и GC не утащит этот массив, пока span жив, и не оставит висячий указатель после компактировки.

```csharp
// Memory.cs:21-28
public readonly struct Memory<T> : IEquatable<Memory<T>>
{
    private readonly object? _object;
    private readonly int _index;
    private readonly int _length;
}
```

`Memory<T>` - обычная структура. Ее можно положить в поле класса, передать через `await`, сохранить в список. Внутри лежит `object`, который держит backing-память живой. Обратите внимание: `Memory<T>` не хранит `ref`, он хранит объект плюс индекс. Именно поэтому он переживает перемещение GC и асинхронные границы.

Простая аналогия: `Span<T>` - это окно, которое живет ровно столько, сколько идет вычисление на текущем кадре стека. `Memory<T>` - это квитанция на багаж, которую можно положить в карман и предъявить позже.

## Как Span&lt;T> превращается в адрес

Ключевой вопрос: откуда берется `ref T _reference`. Ответ в конструкторе от массива:

```csharp
// Span.cs:52
_reference = ref MemoryMarshal.GetArrayDataReference(array);
_length = array.Length;
```

`GetArrayDataReference` - интринсик. Смотрите `MemoryMarshal.cs:100`:

```csharp
[Intrinsic]
[NonVersionable]
public static ref T GetArrayDataReference<T>(T[] array) =>
    ref GetArrayDataReference(array);
```

А реализация для `Array` (`MemoryMarshal.cs:118`) делает так:

```csharp
// MemoryMarshal.cs:124
return ref Unsafe.AddByteOffset(ref Unsafe.As<RawData>(array).Data,
    (nuint)RuntimeHelpers.GetMethodTable(array)->BaseSize - (nuint)(2 * sizeof(IntPtr)));
```

Это ручной сдвиг к первому элементу массива: берем адрес заголовка объекта, прибавляем `BaseSize` минус два указателя (указатель на method table и на длину массива). Получаем адрес данных без проверки границ, которую сделал бы `array[0]`. Именно поэтому `Span<T>` умеет смотреть в массив, не дергая никаких проверок на входе.

Разберем эти термины, потому что они встречаются везде. **Method table** - это структура, описывающая тип объекта: его размер, флаги, методы. В начале каждого объекта в куче лежит указатель на нее, так рантайм понимает, что это за тип. **BaseSize** - размер объекта в байтах, включая заголовок. У массива `BaseSize` включает заголовок, указатель на method table и поле длины.

Вот как выглядит массив `int[3]` в памяти:

```text
адрес+0:  [заголовок]      8 байт (служебные данные GC)
адрес+8:  [MethodTable*]   8 байт указателя на тип int[]
адрес+16: [length]         4 байта (плюс 4 выравнивания)
адрес+24: [0]              4 байта, первый элемент
адрес+28: [1]              4 байта
адрес+32: [2]              4 байта
```

`GetArrayDataReference` берет адрес начала объекта, прибавляет `BaseSize` (для `int[3]` это 24) и получает адрес первого элемента. `array[0]` сделал бы то же самое, но дополнительно проверил бы, что индекс 0 меньше длины. Здесь проверка не нужна: мы точно знаем, что смотрим на элемент 0 существующего массива.

Почему это важно для производительности. Каждое обращение к массиву по индексу в .NET содержит проверку границ. В плотном цикле это лишние сравнения и ветвления. `GetArrayDataReference` дает адрес начала один раз, без проверки, и дальше можно идти по памяти. JIT часто сам убирает проверки в цикле, но не всегда. Здесь же компилятор получает гарантию от рантайма.

Срез тоже ничего не копирует, он просто двигает ссылку:

```csharp
// Span.cs:396-401
public Span<T> Slice(int start)
{
    if ((uint)start > (uint)_length)
        ThrowHelper.ThrowArgumentOutOfRangeException();

    return new Span<T>(ref Unsafe.Add(ref _reference, (nint)(uint)start), _length - start);
}
```

А вот в `Slice(int start, int length)` зарыт красивый трюк с переполнением на 64 битах (`Span.cs:415-427`):

```csharp
#if TARGET_64BIT
    // Since start and length are both 32-bit, their sum can be computed across a 64-bit domain
    // without loss of fidelity. The cast to uint before the cast to ulong ensures that the
    // extension from 32- to 64-bit is zero-extending rather than sign-extending.
    if ((ulong)(uint)start + (ulong)(uint)length > (ulong)(uint)_length)
        ThrowHelper.ThrowArgumentOutOfRangeException();
#else
    if ((uint)start > (uint)_length || (uint)length > (uint)(_length - start))
        ThrowHelper.ThrowArgumentOutOfRangeException();
#endif
```

На 64-битной платформе обе проверки - отрицательный `start`, отрицательный `length`, выход за границы - сворачиваются в одну. `uint` перед `ulong` гарантирует нулевое расширение, а не знаковое, поэтому отрицательное число превращается в огромное положительное и сразу проваливает сравнение. Один `cmp`, одна ветка вместо двух. Рантайм экономит такт на каждом срезе, потому что срезы случаются в каждом парсере.

Теперь про размер. Два поля: ссылка (8 байт на x64) и длина (4 байта), плюс выравнивание. То есть `Span<T>` - это примерно 16 байт, которые целиком помещаются в пару регистров и обычно вообще не попадают в память, если JIT развернул инлайнинг. `Span<T>` помечен `[Intrinsic]` (`Span.cs:27`), и `Length` тоже (`Span.cs:165`), так что JIT умеет обращаться с ним как с первоклассной структурой, а не как с обычным типом.

## Почему Span нельзя протащить в heap

Вот код, который выглядит невинно и не компилируется:

```csharp
class Parser
{
    private Span<char> _buffer; // ошибка компилятора: ref struct не может быть полем класса
}
```

И вот такой тоже:

```csharp
async Task ReadAsync(Span<byte> buffer) // ошибка: ref struct нельзя в async-метод
{
    await socket.ReceiveAsync(buffer);
}
```

Компилятор режет это не из вредности. Если бы `Span<T>` лежал в куче, его `ref T _reference` мог бы указывать на кадр стека, которого уже нет. GC не смог бы отследить такую ссылку корректно, и мы бы получили висячий указатель в управляемой памяти. Язык просто запрещает ситуацию на этапе компиляции. Это и есть та самая "memory safety без unsafe".

Разберем, почему `async` особенно опасен. Когда метод содержит `await`, компилятор переписывает его в **state machine** - объект в куче, который хранит состояние метода между приостановками. Все локальные переменные, переживающие `await`, становятся полями этого объекта. Если бы среди них был `Span`, он оказался бы в куче. А его `ref` мог бы указывать на буфер, который к моменту возобновления уже освобожден.

Вот что примерно происходит с таким методом:

```csharp
async Task Example()
{
    Span<byte> buffer = stackalloc byte[256]; // буфер на стеке
    await SomethingAsync();                    // здесь кадр стека исчезает
    buffer[0] = 1;                             // буфер уже не существует
}
```

`await` освобождает текущий кадр стека и возвращает управление вызывающему. Буфер `buffer` жил в этом кадре. Когда метод возобновится, это будет уже другой кадр, и адрес из `ref` будет указывать в никуда. Компилятор запрещает такой код, потому что иначе мы получили бы порчу памяти, от которой GC не защитит.

Отсюда практическое правило: `Span<T>` - для синхронного, локального кода. Как только нужно сохранить окно в объекте или пережить `await`, берем `Memory<T>`.

## Memory&lt;T>: квитанция вместо окна

`Memory<T>` устроен вокруг `_object`. Посмотрите на конструктор от массива (`Memory.cs:47-49`): `_object = array; _index = 0; _length = array.Length`. Backing-объект держится живым, потому что на него ссылается поле структуры.

Вот как выглядит `Memory<int>`, который смотрит на кусок массива:

```csharp
int[] data = new int[100];
Memory<int> mem = data.AsMemory(10, 5); // элементы с 10 по 14
```

```text
Memory<int> (16 байт на стеке)
  _object = -------> int[100] в куче (весь массив)
  _index  = 10
  _length = 5
```

Обратите внимание: `Memory<int>` хранит ссылку на **весь** массив, а не на его часть. Смещение и длину он держит у себя. Именно поэтому GC видит обычную ссылку на объект и корректно его сохраняет. А когда нужно получить `Span`, рантайм берет адрес массива, прибавляет `_index` и получает нужное окно.

Отсюда и главный минус, о котором мы поговорим в ловушках: `Memory` держит живым весь массив целиком. Если массив на 100 МБ, а `Memory` смотрит на 10 байт, все 100 МБ останутся в памяти, пока жива структура.

Чтобы получить `Span<T>` из `Memory<T>`, рантайм делает нетривиальную работу (`Memory.cs:263`). Внутри он разбирает, что за объект лежит в `_object`:

- `string`, если `T` это `char`. Тогда берется `GetRawStringData` строки.
- массив. Тогда `GetArrayDataReference`.
- `MemoryManager<T>`. Тогда `manager.GetSpan()`.

Вот фрагмент (`Memory.cs:283-319`):

```csharp
if (typeof(T) == typeof(char) && tmpObject.GetType() == typeof(string))
{
    refToReturn = ref Unsafe.As<char, T>(ref ((string)tmpObject).GetRawStringData());
    lengthOfUnderlyingSpan = Unsafe.As<string>(tmpObject).Length;
}
else if (RuntimeHelpers.ObjectHasComponentSize(tmpObject))
{
    refToReturn = ref MemoryMarshal.GetArrayDataReference(Unsafe.As<T[]>(tmpObject));
    lengthOfUnderlyingSpan = Unsafe.As<T[]>(tmpObject).Length;
}
else
{
    Span<T> memoryManagerSpan = Unsafe.As<MemoryManager<T>>(tmpObject).GetSpan();
    refToReturn = ref MemoryMarshal.GetReference(memoryManagerSpan);
    lengthOfUnderlyingSpan = memoryManagerSpan.Length;
}
```

Тут же есть защита от "порванной" структуры: `desiredStartIndex = (uint)_index & (uint)RemoveFlagsBitMask` (`Memory.cs:328`). `RemoveFlagsBitMask` - это `0x7FFFFFFF` (`ReadOnlyMemory.cs:30`). Старший бит индекса используется как флаг: если он выставлен, значит память уже запинена и `Pin()` не будет выделять новый `GCHandle`. Об этом прямо написано в комментарии над полями (`Memory.cs:23-25`):

```csharp
// The highest order bit of _index is used to discern whether _object is a pre-pinned array.
// (_index < 0) => _object is a pre-pinned array, so Pin() will not allocate a new GCHandle
//       (else) => Pin() needs to allocate a new GCHandle to pin the object.
```

Экономия одного бита индекса, чтобы не заводить отдельное поле-флаг. Классика низкоуровневого дизайна рантайма.

`Memory<T>` весит ровно 16 байт: `object` (8), `_index` (4), `_length` (4). Никакого boxing внутри, никаких скрытых аллокаций при копировании структуры.

## Span или Memory: как выбрать

Правило простое, но его стоит закрепить таблицей.

| Ситуация | Что брать | Почему |
|---|---|---|
| Локальная обработка внутри метода | `Span<T>` | быстрее, нет объекта, живет на стеке |
| Параметр синхронного метода | `ReadOnlySpan<T>` | нет аллокации, читаемость |
| Поле класса | `Memory<T>` или `ReadOnlyMemory<T>` | span в поле нельзя |
| Данные переживают `await` | `Memory<T>` | span запрещен в async |
| Возврат из `async` метода | `Memory<T>` | span нельзя вернуть через await |
| Буфер под interop | `Memory<T>` + `Pin` | нужен `void*` и контроль времени жизни |
| Парсинг строки на месте | `ReadOnlySpan<char>` | ноль копирований |
| Долгий цикл по массиву | `Span<T>` | JIT убирает проверки границ |

Типичный прием на границе: снаружи API принимает `Memory<T>`, а внутри метода сразу превращает его в `Span<T>` и дальше работает только со span. Так и аллокаций нет, и API удобный.

```csharp
public void Process(ReadOnlyMemory<byte> data)
{
    ReadOnlySpan<byte> span = data.Span; // один раз
    // дальше везде span, без обращений к Memory
    Parse(span);
}
```

Важно: `data.Span` каждый раз делает работу по разбору `_object`. Если вызывать его в цикле, вы будете repeatedly платить за то, что можно сделать один раз. Поэтому вынесли в локальную переменную.

## Строка как ReadOnlySpan&lt;char>

Самая частая задача - пройтись по строке без создания новых строк. У `string` есть внутренний метод:

```csharp
// String.cs:531
internal ref char GetRawStringData() => ref _firstChar;
```

Это ссылка на первый символ. А расширение `AsSpan` (`MemoryExtensions.cs:97`) собирает из нее span:

```csharp
[Intrinsic] // When input is a string literal
public static ReadOnlySpan<char> AsSpan(this string? text)
{
    if (text == null)
        return default;

    return new ReadOnlySpan<char>(ref text.GetRawStringData(), text.Length);
}
```

`[Intrinsic]` здесь не для красоты. Когда вы пишете `"GET / HTTP/1.1".AsSpan()`, JIT видит строковый литерал и может свернуть весь span в статическую ссылку на данные в куче без единой проверки.

Сравните:

```csharp
string line = "42,hello,3.14";

// аллокация на каждое поле
string a = line.Substring(0, 2);   // "42"
string b = line.Substring(3, 5);   // "hello"

// ноль аллокаций
ReadOnlySpan<char> span = line.AsSpan();
ReadOnlySpan<char> a2 = span.Slice(0, 2);
ReadOnlySpan<char> b2 = span.Slice(3, 5);
```

`a2` и `b2` - это просто ссылка внутрь исходной строки плюс длина. Строка не копируется, `Substring` не вызывается, GC молчит. Парсеры и `int.Parse(ReadOnlySpan<char>)`, и `double.Parse(ReadOnlySpan<char>)`, и `Encoding.GetBytes(ReadOnlySpan<char>, Span<byte>)` работают именно так.

## MemoryManager&lt;T>: память, которую придумали вы

Откуда `Memory<T>` может смотреть в нативную память или в пул? Через `MemoryManager<T>` (`Buffers/MemoryManager.cs:11`):

```csharp
public abstract class MemoryManager<T> : IMemoryOwner<T>, IPinnable
{
    public virtual Memory<T> Memory => new Memory<T>(this, GetSpan().Length);

    public abstract Span<T> GetSpan();
    public abstract MemoryHandle Pin(int elementIndex = 0);
    public abstract void Unpin();

    protected abstract void Dispose(bool disposing);
}
```

Вы наследуетесь, реализуете `GetSpan`, `Pin`, `Unpin`, и `Memory<T>` начинает смотреть куда угодно. `Memory<T>.Span` в ветке `else` (`Memory.cs:315`) дергает `manager.GetSpan()`, а `Memory<T>.Pin` (`Memory.cs:428`) дергает `manager.Pin(_index)`.

Пин возвращает `MemoryHandle` (`Buffers/MemoryHandle.cs:11`):

```csharp
public unsafe struct MemoryHandle : IDisposable
{
    private void* _pointer;
    private GCHandle _handle;
    private IPinnable? _pinnable;
    ...
    public void Dispose()
    {
        if (_handle.IsAllocated) _handle.Free();
        if (_pinnable != null) { _pinnable.Unpin(); _pinnable = null; }
        _pointer = null;
    }
}
```

Это то, что нужно для interop: получаете `void*`, отдаете его нативной функции, а `Dispose` снимает пин. `ArrayPool<T>` и `MemoryPool<T>` построены на этом же механизме.

## Что при этом делает процессор

JIT знает про `Span<T>` не как про обычную структуру, а как про встроенный паттерн. Несколько практических следствий:

- Проверка границ в цикле по span часто устраняется. Если вы пишете `for (int i = 0; i < span.Length; i++)`, JIT видит, что индекс ограничен длиной, и убирает per-element bounds check. На массиве такое тоже возможно, но со span это надежнее.
- `GetArrayDataReference` экономит проверку на нулевом элементе, которую делает обычное индексирование массива.
- `CopyTo` дергает `Buffer.Memmove` напрямую (`Span.cs:334`), без промежуточного слоя и с корректной обработкой перекрытия областей.
- `stackalloc` теперь типизирован: `Span<byte> buf = stackalloc byte[256];` дает буфер на стеке с проверкой границ. Ноль аллокаций, ноль работы для GC.

Но есть и цена. `Span<T>` - это структура, которую передают по значению. Если JIT не заинлайнил метод, каждый вызов копирует 16 байт. На горячем пути это не проблема, потому что все инлайнится, но в рекурсивных или виртуальных сценариях может внезапно стать заметно.

## Ловушки, на которые легко наступить

**Span, возвращенный из метода, может указывать на мертвый стек.** Вот это ловушка номер один:

```csharp
Span<int> GetNumbers()
{
    Span<int> local = stackalloc int[4];
    return local; // компилятор не даст, если вернуть напрямую
}
```

Компилятор защищает от прямого возврата, но `ref struct` все равно легко протащить через `ref`-параметры или замыкания так, что lifetime станет неочевидным. Правило простое: span живет не дольше того буфера, из которого он сделан.

**`Span<T>.Equals` всегда кидает исключение.** Это не забывчивость авторов, а следствие того, что span нельзя упаковать (`Span.cs:192-206`):

```csharp
[Obsolete("Equals() on Span will always throw an exception. Use the equality operator instead.")]
public override bool Equals(object? obj) =>
    throw new NotSupportedException(SR.NotSupported_CannotCallEqualsOnSpan);
```

Потому что любой вызов `Equals(object)` требует боксинга, а `ref struct` боксить нельзя. Для сравнения есть `operator ==` (`Span.cs:365`), который сравнивает адрес и длину, а не содержимое.

**`ToArray` аллоцирует.** `Span.cs:437` честно об этом пишет в комментарии. Если вы вызываете `ToArray` в горячем пути, вы вернули все аллокации, от которых убегали. Мост к старым API на массивах неизбежен, но его стоит держать на границе, а не в цикле.

**`Memory<T>` держит весь backing-объект.** Если вы нарезали `Memory<byte>` из массива в 100 МБ и сохранили срез в 10 байт, массив все равно останется живым, пока живет `Memory<T>`. GC не умеет освобождать часть массива. Для долгоживущих мелких срезов это утечка по памяти.

**`Memory<T>.Pin` на обычном массиве аллоцирует `GCHandle`.** Смотрите `Memory.cs:420-422`: для не-пре-пиненного массива создается `GCHandle.Alloc(..., GCHandleType.Pinned)`. Если это происходит на каждую операцию, вы снова платите. Либо используйте память, помеченную как pre-pinned (тогда старший бит `_index` выставится и `Pin` обойдется без хэндла), либо `MemoryManager<T>`, который сам управляет пином.

## Частые ошибки на примерах

Разберем типовые грабли в виде "было / стало", потому что на словах все понятно, а в коде ошибки повторяются.

**Срез строки в цикле.**

```csharp
// было: аллокация на каждую итерацию
for (int i = 0; i < lines.Count; i++)
{
    string field = lines[i].Substring(0, 4);
    Handle(field);
}

// стало: ноль аллокаций
for (int i = 0; i < lines.Count; i++)
{
    ReadOnlySpan<char> field = lines[i].AsSpan(0, 4);
    Handle(field);
}
```

**Span как поле класса.**

```csharp
// было: не компилируется
class Reader
{
    private Span<byte> _buffer;
}

// стало: Memory в поле, Span локально
class Reader
{
    private Memory<byte> _buffer;

    public void Read()
    {
        Span<byte> span = _buffer.Span;
        // работаем со span
    }
}
```

**Возврат буфера со стека.**

```csharp
// было: указывает на мертвый стек
Span<int> Broken()
{
    Span<int> local = stackalloc int[4];
    return local;
}

// стало: либо копируем наружу
int[] CopyOut()
{
    Span<int> local = stackalloc int[4];
    return local.ToArray();
}

// либо просим буфер у вызывающего
void Fill(Span<int> destination)
{
    // пишем прямо в переданный буфер
}
```

Второй вариант лучше: вызывающий сам решает, откуда взять буфер, и аллокаций по-прежнему ноль, если он передал `stackalloc` или кусок пула.

**Memory держит большой массив.**

```csharp
// было: весь массив на 100 МБ остается живым
byte[] big = new byte[100 * 1024 * 1024];
ReadOnlyMemory<byte> slice = big.AsMemory(0, 10);
Store(slice); // теперь big нельзя собрать

// стало: если нужен маленький долгоживущий кусок, скопируйте его
ReadOnlyMemory<byte> slice2 = big.AsMemory(0, 10).ToArray();
Store(slice2); // держит только 10 байт
```

**Пиннинг на каждом вызове.**

```csharp
// было: GCHandle создается на каждую операцию
using MemoryHandle h = memory.Pin();
NativeCall(h.Pointer);

// стало: либо заранее запиненная память (POH)
byte[] pinned = GC.AllocateUninitializedArray<byte>(4096, pinned: true);
using MemoryHandle h2 = pinned.AsMemory().Pin(); // без нового GCHandle

// либо один долгоживущий хэндл на весь жизненный цикл
```

**ToArray в горячем пути.**

```csharp
// было: аллокация ради передачи в старый API
ProcessData(span.ToArray());

// стало: используйте перегрузку на span, если она есть
ProcessData(span);

// а если нет, держите ToArray на границе, а не в цикле
```

**Сравнение span через Equals.**

```csharp
// было: исключение
bool eq = span1.Equals(span2); // NotSupportedException

// стало: сравнение содержимого
bool eq2 = span1.SequenceEqual(span2);

// или сравнение адреса и длины
bool same = span1 == span2;
```

## Практика: парсим без аллокаций

Соберем кусок, который раньше создавал гору строк:

```csharp
using System;
using System.Buffers.Text;

static bool TryParsePoint(ReadOnlySpan<char> line, out int x, out int y)
{
    x = 0;
    y = 0;

    int comma = line.IndexOf(',');
    if (comma < 0) return false;

    ReadOnlySpan<char> left = line.Slice(0, comma);
    ReadOnlySpan<char> right = line.Slice(comma + 1);

    return int.TryParse(left, out x) && int.TryParse(right, out y);
}
```

Ни одного `Substring`, ни одной промежуточной строки. `int.TryParse(ReadOnlySpan<char>)` читает символы прямо из исходной строки.

А вот запись без аллокаций через `Span<byte>` и UTF-8:

```csharp
static int WritePoint(Span<byte> destination, int x, int y)
{
    Utf8Formatter.TryFormat(x, destination, out int written);
    destination[written++] = (byte)':';
    Utf8Formatter.TryFormat(y, destination.Slice(written), out int writtenY);
    return written + writtenY;
}
```

Если буфер выделен из `ArrayPool<byte>`, вся операция проходит без единого объекта в куче.

Соберем полный пример: разбор CSV-строки на числа без единой аллокации.

```csharp
static bool TryParseCsv(ReadOnlySpan<char> line, Span<int> results, out int count)
{
    count = 0;
    int start = 0;

    for (int i = 0; i <= line.Length; i++)
    {
        // разделитель - запятая или конец строки
        if (i == line.Length || line[i] == ',')
        {
            ReadOnlySpan<char> field = line.Slice(start, i - start);
            if (!int.TryParse(field, out int value))
                return false;

            results[count++] = value;
            start = i + 1;
        }
    }
    return true;
}
```

Вызываем так:

```csharp
Span<int> numbers = stackalloc int[16];
if (TryParseCsv("42,7,13,99".AsSpan(), numbers, out int n))
{
    for (int i = 0; i < n; i++)
        Console.WriteLine(numbers[i]);
}
```

Здесь нет ни одной строки, ни одного массива в куче. `line` - окно в существующую строку, `numbers` - буфер на стеке. Весь разбор это хождение по памяти плюс `int.TryParse`, который читает символы прямо из span.

Сравните с наивным вариантом, который делает то же самое:

```csharp
static List<int> ParseCsvNaive(string line)
{
    var result = new List<int>();
    foreach (string field in line.Split(','))   // массив строк + строки
        result.Add(int.Parse(field));           // int.Parse(string)
    return result;                              // список в куче
}
```

На строке из 16 чисел наивный вариант создает массив из 16 строк, 16 объектов строк, список и его внутренний массив. Это десятки объектов и десятки килобайт мусора. Вариант со span - ноль. Разница в аллокациях измеряется не процентами, а порядками.

Как убедиться, что вы действительно не аллоцируете. В тесте:

```csharp
long before = GC.GetAllocatedBytesForCurrentThread();
TryParseCsv(line, numbers, out _);
long after = GC.GetAllocatedBytesForCurrentThread();
Console.WriteLine($"allocated: {after - before} bytes");
```

На корректно написанном span-коде разница будет нулевой. Если нет, значит где-то спрятался `ToString`, `ToArray` или бокс.

## Что в итоге

`Span<T>` и `Memory<T>` - это не просто удобные обертки. Это способ сказать рантайму: "вот область памяти, работай с ней напрямую, не копируй". `Span<T>` дает максимальную скорость и живет на стеке, `Memory<T>` дает возможность сохранить окно и пережить `await` ценой одного поля-объекта. Вместе они убирают самый частый источник мусора в .NET - промежуточные массивы и строки.

Когда в следующий раз увидите `Substring` в цикле или `new byte[]` под каждую операцию, вспомните: скорее всего, там достаточно пары `Slice` над `ReadOnlySpan`. И тогда GC скажет вам спасибо.

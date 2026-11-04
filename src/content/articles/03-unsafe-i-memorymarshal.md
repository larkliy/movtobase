---
title: "Unsafe и MemoryMarshal: работаем с адресами, не выключая GC"
description: "Указатели, ref T, MemoryMarshal и ручная работа с памятью."
course: csharp
article: 3
duration: 15
tags: ["Unsafe", "MemoryMarshal", "pointers"]
---

Обычный C# прячет от вас адреса. Вы не знаете, где лежит объект, GC может его подвинуть, а разыменовать `ref` за пределами времени жизни объекта компилятор не даст. Это и есть memory safety. Но когда вы пишете высокопроизводительный код, эта забота иногда мешает: хочется прочитать структуру прямо из байтов, переинтерпретировать массив, посчитать адрес поля, скопировать блок памяти. Для этого в .NET есть два инструмента: `System.Runtime.CompilerServices.Unsafe` и `System.Runtime.InteropServices.MemoryMarshal`.

Это не `unsafe` из C++ и не выключение GC. Это способ сказать рантайму: "я знаю, что делаю, дай мне управляемую ссылку в обход обычных проверок". GC по-прежнему отслеживает `ref T`, просто проверки компилятора и часть рантайм-гарантий вы берете на себя.

## На пальцах: что вообще такое адрес и ссылка

Чтобы дальше было понятно, разберемся с тремя способами сослаться на данные в .NET.

**Обычная ссылка на объект** (`object o`, `string s`). Это адрес объекта в куче. GC знает про эту ссылку, отслеживает ее и, если объект переехал при компактировке, обновляет значение. Для программиста это прозрачно.

**ref T (managed byref, управляемая ссылка)**. Это адрес конкретного значения: элемента массива, поля структуры, локальной переменной. GC тоже про нее знает и корректирует, если объект, внутри которого она лежит, сдвинулся. Именно так работают `ref`-параметры и `Span<T>`.

**void\* (неуправляемый указатель)**. Это просто число-адрес. GC про него не знает ничего. Если объект сдвинется, указатель останется смотреть на старое место, и вы получите мусор.

Вся тема этой главы - это мосты между тремя мирами. `Unsafe.AsPointer` превращает `ref T` в `void*`. `Unsafe.AsRef` делает обратно. `MemoryMarshal` строит поверх этого удобные и относительно безопасные операции.

Где это применяется. Вот реальный пример: у вас есть буфер байтов, пришедший из сети, и в нем лежит структура заголовка. Наивный способ прочитать ее - скопировать байты в структуру через `BitConverter` для каждого поля. Это медленно и громоздко:

```csharp
// медленно и шумно
uint magic = BitConverter.ToUInt32(buffer, 0);
ushort version = BitConverter.ToUInt16(buffer, 4);
ushort flags = BitConverter.ToUInt16(buffer, 6);
int length = BitConverter.ToInt32(buffer, 8);
```

С `MemoryMarshal` это одна операция:

```csharp
// быстро и коротко
PacketHeader header = MemoryMarshal.Read<PacketHeader>(buffer);
```

`MemoryMarshal.Read` берет адрес буфера, переинтерпретирует его как `PacketHeader` и копирует структуру. Ни `BitConverter`, ни промежуточных объектов.

## Словарь терминов

**Managed byref (управляемая ссылка, `ref T`)** - адрес значения, который отслеживает GC. Может указывать внутрь объекта или на стек.

**void\*** - неуправляемый указатель. Число-адрес, невидимое для GC.

**Intrinsic (интринсик)** - метод, который JIT не вызывает, а заменяет на специальные инструкции. Тело метода в исходнике обычно `throw`.

**Method table** - структура, описывающая тип объекта. В начале каждого объекта лежит указатель на нее.

**Object header (заголовок объекта)** - служебные данные перед полями объекта: указатель на method table, длина массива, служебные биты GC.

**BaseSize** - полный размер объекта в байтах, включая заголовок.

**Blittable** - тип, у которого управляемое и нативное представление совпадают. Такой тип можно копировать в нативную память без конвертации.

**Unmanaged type** - тип, не содержащий управляемых ссылок: числа, `bool`, `char`, структуры из них, указатели.

**Alignment (выравнивание)** - требование, чтобы адрес был кратен размеру. Процессоры читают выровненные данные быстрее, а некоторые архитектуры (ARM) на невыровненных могут падать.

**Endianness (порядок байтов)** - порядок хранения байтов числа в памяти: little-endian (младший байт первый) или big-endian (старший первый). Сетевые протоколы обычно big-endian.

**Pinning (пиннинг)** - запрет GC перемещать объект. Нужен, когда вы отдаете адрес управляемой памяти в нативный код.

**fixed** - конструкция C#, которая пинит объект на время блока и дает на него указатель.

**GCHandle** - дескриптор для пиннинга и получения адреса объекта вручную.

**memcpy / memset** - классические C-функции копирования и заполнения памяти. В .NET им соответствуют `CopyBlock` и `InitBlock`.

**cpblk / initblk** - IL-инструкции копирования и заполнения блока памяти. JIT превращает их в машинный код, часто векторизованный.

**Bounds check (проверка границ)** - проверка, что индекс не выходит за пределы массива. Каждое `array[i]` ее содержит.

**Reinterpret (переинтерпретация)** - прочитать те же байты как другой тип. `Unsafe.As` меняет только тип ссылки, байты не трогает.

**Covariance (ковариантность)** - разрешение считать `Derived[]` совместимым с `Base[]`. Из-за нее `array[i]` может делать проверку типа.

**Boxing (упаковка)** - превращение значимого типа в объект в куче.

**Lifetime (время жизни)** - как долго ссылка остается валидной. Для `void*` и `AsRef` это целиком на вашей ответственности.

**scoped** - модификатор, который ограничивает время жизни ссылки текущим методом. Помогает компилятору проверять безопасность.

## ref T - это не просто указатель

Сначала разберемся с главным. `ref T` в .NET - это managed byref, управляемая ссылка. GC про нее знает и корректирует, если объект подвинулся. `void*` - это неуправляемый указатель, GC про него не знает ничего.

`Unsafe.AsPointer` (`Unsafe.cs:31`) превращает одно в другое:

```csharp
[Intrinsic]
public static void* AsPointer<T>(ref readonly T value)
{
    throw new PlatformNotSupportedException();
    // ldarg.0
    // conv.u
    // ret
}
```

Комментарий с IL здесь не декорация. Тело метода в исходнике - это `throw`, а настоящую реализацию подставляет JIT: он видит `[Intrinsic]` и заменяет вызов на пару инструкций. Так работает почти весь `Unsafe`. В шапке файла прямо написано (`Unsafe.cs:8`):

```csharp
// The implementations of most the methods in this file are provided as intrinsics.
// In CoreCLR, the body of the functions are replaced by the EE with unsafe code.
```

Обратная операция, `Unsafe.AsRef<T>(void* source)` (`Unsafe.cs:720`), делает `ref T` из сырого указателя. Вот тут и начинается опасность: полученная ссылка уже не отслеживается GC, и если объект сдвинется, вы держите мусорный адрес. Поэтому для работы с `void*` объект надо пинить.

Как GC вообще понимает, где на стеке и в регистрах лежат `ref T`. Для каждого метода JIT генерирует **GC info**: карту, которая говорит, в какой точке кода какие слоты содержат управляемые ссылки. Когда GC запускается, он проходит по стеку, смотрит эту карту и корректирует каждую живую ссылку, если объект переехал. Это называется "tracked byref" (отслеживаемая ссылка).

Теперь становится ясно, почему `AsRef(void*)` опасен. Результат - это `ref T`, но он не зарегистрирован ни в одной GC-карте. GC про него не знает. Если между `AsRef` и использованием объекта произойдет сборка с компактировкой, ссылка станет указывать на старое место, а объект уже будет в другом. Это классический dangling reference.

Поэтому правило простое: получили `void*` из управляемого объекта - держите объект запиненным, пока используете указатель. Пиннинг говорит GC "не трогай этот объект", и адрес перестает меняться.

```csharp
byte[] buffer = new byte[1024];

// fixed пинит массив на время блока
unsafe
{
    fixed (byte* p = buffer)
    {
        // пока мы здесь, buffer не сдвинется, p валиден
        NativeCall(p, buffer.Length);
    }
}
// здесь пин снят, массив снова может двигаться
```

## Unsafe: набор интринсиков, а не библиотека

Список того, что умеет `Unsafe`, стоит пройтись по нему как по арсеналу.

Переинтерпретация:

```csharp
Unsafe.As<TFrom, TTo>(ref source)   // Unsafe.cs:87, тот же адрес, другой тип
Unsafe.As<T>(object o)              // Unsafe.cs:68, без проверки типа
Unsafe.BitCast<TFrom, TTo>(source)  // Unsafe.cs:267, с проверкой размера
```

`As<TFrom, TTo>` не проверяет ничего. Если размеры не совпадают, вы читаете за пределами значения. `BitCast` аккуратнее: он проверяет, что `sizeof(TFrom) == sizeof(TTo)` и что оба типа value type (`Unsafe.cs:271`).

Арифметика по ссылкам:

```csharp
Unsafe.Add(ref source, elementOffset)          // Unsafe.cs:107
Unsafe.AddByteOffset(ref source, byteOffset)   // Unsafe.cs:675
Unsafe.ByteOffset(ref origin, ref target)      // Unsafe.cs:754
Unsafe.AreSame(ref left, ref right)            // Unsafe.cs:248
```

`Add` умножает смещение на `sizeof(T)`, `AddByteOffset` добавляет байты как есть. `AreSame` - это сравнение адресов, а не содержимого.

Сырая память:

```csharp
Unsafe.CopyBlock(dest, src, byteCount)          // Unsafe.cs:345, как memcpy
Unsafe.CopyBlockUnaligned(dest, src, byteCount) // Unsafe.cs:384, без требования выравнивания
Unsafe.InitBlock(start, value, byteCount)       // Unsafe.cs:503, как memset
Unsafe.ReadUnaligned<T>(ref source)             // Unsafe.cs:596
Unsafe.WriteUnaligned<T>(ref dest, value)       // Unsafe.cs:648
```

`CopyBlock` компилируется в `cpblk`, `InitBlock` в `initblk`, а `ReadUnaligned`/`WriteUnaligned` добавляют к обычной загрузке/записи префикс `unaligned. 0x1`. Это критично на ARM, где невыровненный доступ может стоить дорого или падать.

Наконец, экзотика:

```csharp
Unsafe.SizeOf<T>()      // Unsafe.cs:51
Unsafe.NullRef<T>()     // Unsafe.cs:773, ссылка, указывающая в никуда
Unsafe.IsNullRef(ref x) // Unsafe.cs:794
Unsafe.Unbox<T>(object) // Unsafe.cs:983, mutable ref на бокс
Unsafe.SkipInit(out x)  // Unsafe.cs:815, обойти definite assignment
```

Покажу каждую категорию на маленьком примере, потому что по одним сигнатурам смысл не всегда очевиден.

Переинтерпретация. `Unsafe.As` не трогает байты, только меняет тип ссылки. Классический пример - посмотреть на биты `int` как на `float`:

```csharp
int bits = 0x3F800000;
float f = Unsafe.As<int, float>(ref bits);
Console.WriteLine(f); // 1
```

Байты не изменились, мы просто сказали компилятору "считай эти четыре байта числом с плавающей точкой". `BitCast` делает то же самое, но проверяет, что размеры совпадают:

```csharp
float f2 = Unsafe.BitCast<int, float>(0x3F800000); // ок
// long bad = Unsafe.BitCast<int, long>(0);        // ошибка компиляции: размеры разные
```

Арифметика по ссылкам. `Unsafe.Add` двигает ссылку на N элементов, сам умножая N на размер типа:

```csharp
int[] data = { 10, 20, 30, 40 };
ref int first = ref MemoryMarshal.GetArrayDataReference(data);
ref int third = ref Unsafe.Add(ref first, 2);
Console.WriteLine(third); // 30
```

Здесь `Add(ref first, 2)` прибавляет `2 * sizeof(int)` байтов. `AddByteOffset` сделал бы то же, но с байтами напрямую.

Сырая память. `CopyBlock` работает как `memcpy`:

```csharp
Span<byte> src = stackalloc byte[] { 1, 2, 3, 4 };
Span<byte> dst = stackalloc byte[4];
Unsafe.CopyBlock(ref dst[0], ref src[0], (uint)src.Length);
```

А `InitBlock` как `memset`:

```csharp
Span<byte> buffer = stackalloc byte[16];
Unsafe.InitBlock(ref buffer[0], 0xAB, (uint)buffer.Length); // все байты 0xAB
```

Экзотика. `SkipInit` позволяет объявить переменную, которую вы гарантированно заполните сами, и не платить за зануление:

```csharp
Unsafe.SkipInit(out int value);
value = 42; // если этого не сделать, будет мусор, а не 0
```

`Unbox` дает мутабельную ссылку на значение внутри бокса:

```csharp
object boxed = 42;
ref int inside = ref Unsafe.Unbox<int>(boxed);
inside = 100; // меняет значение прямо в боксе
```

Обычный `unbox` дает копию, а `Unsafe.Unbox` - ссылку на сами данные в куче. Работает только для значимых типов и требует, чтобы бокс был именно этого типа.

## SizeOf&lt;T> и почему не sizeof(T)

`sizeof(T)` в C# требует, чтобы `T` был unmanaged. Это неудобно: `MemoryMarshal.Cast` и `Span` должны уметь работать с любым `T`, включая структуры с ссылками. Для этого есть `Unsafe.SizeOf<T>()` (`Unsafe.cs:51`):

```csharp
[Intrinsic]
public static int SizeOf<T>()
{
    return sizeof(T);
}
```

JIT подставляет реальный размер типа. Для ссылочных полей он считает их как размер указателя. И когда `T` известен на этапе компиляции, `SizeOf<T>()` сворачивается в константу, так что это не вызов, а число. Именно на этом строится вся арифметика `MemoryMarshal`.

## GetArrayDataReference: заглядываем за заголовок массива

Как `Span<T>` получает указатель на данные массива, минуя проверку границ? Через `MemoryMarshal.GetArrayDataReference` (`MemoryMarshal.cs:118`):

```csharp
[Intrinsic]
public static unsafe ref byte GetArrayDataReference(Array array)
{
    return ref Unsafe.AddByteOffset(ref Unsafe.As<RawData>(array).Data,
        (nuint)RuntimeHelpers.GetMethodTable(array)->BaseSize - (nuint)(2 * sizeof(IntPtr)));
}
```

Разберем по частям. Управляемый массив в памяти - это заголовок объекта, в котором лежат указатель на method table и длина (для массивов это `2 * sizeof(IntPtr)`), а сразу за ним начинаются данные. `Unsafe.As<RawData>(array).Data` дает адрес первого поля данных, но так как `RawData` не знает реальный тип, нужно сдвинуться к началу данных. `GetMethodTable(array)->BaseSize` - это размер заголовка объекта для данного типа, а вычитание двух указателей убирает длину и указатель на method table. Результат - ровно адрес элемента с индексом 0.

Зачем так сложно, если есть `array[0]`? Потому что `array[0]` делает проверку индекса и возвращает ссылку с проверкой ковариантности. А здесь одна арифметика, и JIT может свернуть всю конструкцию в адрес без ветвлений. Этот трюк используется в конструкторах `Span<T>` (`Span.cs:52`) на каждом срезе массива.

Вот как выглядит массив `int[4]` в памяти, чтобы формула стала наглядной:

```text
адрес+0:  [заголовок GC]   8 байт
адрес+8:  [MethodTable*]   8 байт  <- на int[]
адрес+16: [length = 4]     4 байта
адрес+20: [padding]        4 байта выравнивания
адрес+24: [0]              4 байта  <- сюда указывает GetArrayDataReference
адрес+28: [1]
адрес+32: [2]
адрес+36: [3]
```

`BaseSize` для `int[4]` равен 24: заголовок (8) плюс указатель на method table (8) плюс длина (4) плюс выравнивание (4). Формула вычитает два указателя из `BaseSize`, потому что `Unsafe.As<RawData>(array).Data` уже указывает на начало объекта, и нужно перепрыгнуть заголовок. В итоге получается ровно `адрес+24`.

Про ковариантность, раз уж она упомянута. В C# можно написать:

```csharp
string[] strings = { "a", "b" };
object[] objects = strings; // ковариантность массивов
objects[0] = 42;            // InvalidCastException в рантайме
```

Компилятор разрешает присваивание, но при записи рантайм обязан проверить, что `42` совместимо с реальным типом массива `string[]`. Это и есть проверка ковариантности. `GetArrayDataReference` возвращает `ref byte` на начало данных, без понятия о типе элементов, поэтому такой проверки не делает. Быстрее, но и безопасность перекладывается на вас.

## MemoryMarshal: типобезопасная прослойка

`MemoryMarshal` построен поверх `Unsafe` и добавляет ровно то, чего не хватает: проверки, которые не дает обойти обычный код, но которые можно свести к минимуму.

Получение ссылки:

```csharp
MemoryMarshal.GetReference<T>(Span<T> span)          // MemoryMarshal.cs:82
MemoryMarshal.GetReference<T>(ReadOnlySpan<T> span)  // MemoryMarshal.cs:88
```

Это просто `ref span._reference`. Ноль работы.

Переинтерпретация с проверками - `Cast` (`MemoryMarshal.cs:155`):

```csharp
public static unsafe Span<TTo> Cast<TFrom, TTo>(Span<TFrom> span)
{
    if (RuntimeHelpers.IsReferenceOrContainsReferences<TFrom>())
        ThrowHelper.ThrowArgument_TypeContainsReferences(typeof(TFrom));
    if (RuntimeHelpers.IsReferenceOrContainsReferences<TTo>())
        ThrowHelper.ThrowArgument_TypeContainsReferences(typeof(TTo));

    uint fromSize = (uint)sizeof(TFrom);
    uint toSize = (uint)sizeof(TTo);
    uint fromLength = (uint)span.Length;
    int toLength;
    if (fromSize == toSize)
    {
        toLength = (int)fromLength;
    }
    else if (fromSize == 1)
    {
        toLength = (int)(fromLength / toSize);
    }
    else
    {
        ulong toLengthUInt64 = (ulong)fromLength * (ulong)fromSize / (ulong)toSize;
        toLength = checked((int)toLengthUInt64);
    }

    return new Span<TTo>(ref Unsafe.As<TFrom, TTo>(ref span._reference), toLength);
}
```

Тут три вещи, на которые стоит посмотреть. Первая: проверка `IsReferenceOrContainsReferences` защищает от того, чтобы переинтерпретировать массив с ссылками как массив байтов и испортить GC. Вторая: вычисление новой длины делается в `uint`/`ulong` и разбито на случаи, потому что JIT так лучше оптимизирует деление на константу и checked-приведение. Третья: сама переинтерпретация - это `Unsafe.As`, то есть ноль инструкций, просто новый тип для той же ссылки.

Создание span из произвольной ссылки - `CreateSpan` (`MemoryMarshal.cs:267`):

```csharp
public static Span<T> CreateSpan<T>(scoped ref T reference, int length) =>
    new Span<T>(ref Unsafe.AsRef(in reference), length);
```

Комментарий честно предупреждает: длина не проверяется, и lifetime не валидируется. Это инструмент для тех, кто точно знает, что делает.

Извлечение backing-памяти:

```csharp
MemoryMarshal.TryGetArray<T>(memory, out ArraySegment<T> segment)   // MemoryMarshal.cs:311
MemoryMarshal.TryGetMemoryManager<T, TManager>(memory, out mgr)     // MemoryMarshal.cs:373
MemoryMarshal.TryGetString(ReadOnlyMemory<char> memory, out string) // MemoryMarshal.cs:485
```

Это позволяет достать исходный массив или строку из `Memory<T>`, если он там есть. Например, для interop, которому нужен именно `T[]`.

И совсем отдельная история - `CreateFromPinnedArray` (`MemoryMarshal.cs:643`):

```csharp
return new Memory<T>((object)array, start | (1 << 31), length);
```

Обратите внимание на `start | (1 << 31)`. Тот самый старший бит индекса, о котором мы говорили в уроке про `Span`/`Memory`. Здесь он и выставляется: метод сообщает `Memory<T>`, что массив уже запинен, и `Pin()` не будет создавать `GCHandle`. Естественно, если массив на самом деле не запинен, вы получите порчу памяти.

## Что происходит с процессором

`Unsafe` и `MemoryMarshal` - это не библиотечные вызовы, а почти всегда ноль или одна инструкция.

- `Unsafe.As` и `Unsafe.AsRef` в JIT исчезают совсем: это переименование типа для одной и той же ссылки.
- `Unsafe.SizeOf<T>()` сворачивается в константу, когда `T` статически известен.
- `Unsafe.Add` превращается в `add` с уже домноженным смещением.
- `CopyBlock`/`InitBlock` ложатся в `cpblk`/`initblk`, которые на больших размерах разворачиваются в векторизованный цикл.
- `GetArrayDataReference` дает адрес без проверки границ, так что цикл по `Span` может обойтись вообще без bounds check.

Покажу на псевдоассемблере, что это значит. Вот как примерно выглядит обычное обращение к массиву с проверкой границ:

```asm
; array[i] = 5
cmp rcx, [rdx+16]      ; сравнить i с длиной массива
jae out_of_range       ; если i >= length, прыгнуть на исключение
mov dword [rdx+rcx*4+24], 5  ; записать по адресу данных
```

А вот что получается, если адрес данных получен через `GetArrayDataReference` и цикл ограничен длиной:

```asm
; для i в [0, length)
mov dword [rbase+rcx*4], 5   ; просто запись, ни cmp, ни jae
```

Проверка исчезла совсем. На массиве из миллиона элементов это экономит миллион сравнений и ветвлений, а ветвления на границах еще и мешают предсказателю переходов.

Еще пример, `Unsafe.As`:

```csharp
long value = 0x1122334455667788;
double asDouble = Unsafe.As<long, double>(ref value);
```

После JIT от `Unsafe.As` не остается ничего, потому что это переименование типа для одной и той же ссылки. Регистр с `value` просто используется дальше как `double`.

Именно поэтому эти API появились: не чтобы писать опасный код ради опасности, а чтобы убрать из горячего пути проверки, которые JIT не может доказать самостоятельно.

## Практика: читаем бинарный протокол

Допустим, у нас есть заголовок пакета, и мы хотим прочитать из него поля без копирования.

```csharp
using System;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, Pack = 1)]
struct PacketHeader
{
    public uint Magic;
    public ushort Version;
    public ushort Flags;
    public int PayloadLength;
}

static PacketHeader ReadHeader(ReadOnlySpan<byte> buffer)
{
    if (buffer.Length < Unsafe.SizeOf<PacketHeader>())
        throw new ArgumentException("buffer too small");

    // копирует байты в локальную структуру без выравнивания на источник
    return MemoryMarshal.Read<PacketHeader>(buffer);
}
```

`MemoryMarshal.Read<T>` (`MemoryMarshal.cs:509`) внутри проверяет, что `T` не содержит ссылок и что буфера хватает, а потом читает через `Unsafe.ReadUnaligned<T>` (`MemoryMarshal.cs:520`, сам интринсик в `Unsafe.cs:571`), то есть умеет работать с невыровненной памятью. Для чтения из сети, где данные не выровнены, это ровно то, что нужно.

А вот как разбить буфер байтов на массив `ushort` без копии:

```csharp
ReadOnlySpan<byte> raw = stackalloc byte[8];
Span<ushort> words = MemoryMarshal.Cast<byte, ushort>(raw); // 4 элемента
```

Если нужно наоборот, сериализовать структуру в байты:

```csharp
static void WriteHeader(Span<byte> destination, in PacketHeader header)
{
    MemoryMarshal.Write(destination, in header);
}
```

Ни одной аллокации, ни одного `BitConverter`, только арифметика и пара инструкций.

Соберем более полный пример: разбор пакета, где первые 4 байта - длина в big-endian, дальше идет полезная нагрузка.

```csharp
using System;
using System.Buffers.Binary;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

static bool TryReadPacket(ReadOnlySpan<byte> buffer, out ReadOnlySpan<byte> payload)
{
    payload = default;
    if (buffer.Length < 4)
        return false;

    // сетевой порядок байтов: big-endian
    uint length = BinaryPrimitives.ReadUInt32BigEndian(buffer);

    // проверить, что длина не превышает буфер и не переполняет int
    if (length > (uint)(buffer.Length - 4))
        return false;

    payload = buffer.Slice(4, (int)length);
    return true;
}
```

Здесь `BinaryPrimitives.ReadUInt32BigEndian` решает проблему порядка байтов, а `MemoryMarshal` для этого не нужен, потому что мы не переинтерпретируем структуру, а читаем число явно. Если же у вас структура в native-порядке байтов (например, из общей памяти с нативным кодом), используйте `MemoryMarshal.Read`:

```csharp
// структура лежит в native-порядке байтов
PacketHeader header = MemoryMarshal.Read<PacketHeader>(buffer);
ReadOnlySpan<byte> body = buffer.Slice(Unsafe.SizeOf<PacketHeader>());
```

А если хочется разом разобрать массив чисел из байтов без копирования:

```csharp
ReadOnlySpan<byte> raw = new byte[] { 1, 0, 2, 0, 3, 0, 4, 0 };
ReadOnlySpan<ushort> numbers = MemoryMarshal.Cast<byte, ushort>(raw);
// numbers.Length == 4, значения 1, 2, 3, 4 (на little-endian)
```

Обратите внимание: `Cast` не копирует. `numbers` смотрит в тот же самый массив `raw`. Если изменить `raw`, изменится и `numbers`, и наоборот (для мутабельного span).

И напоследок, чтение структуры с диска через `unsafe`, чтобы стало понятно, чем это отличается от `MemoryMarshal`:

```csharp
static unsafe PacketHeader ReadHeaderUnsafe(byte* p)
{
    // разыменование сырого указателя, без проверок
    return *(PacketHeader*)p;
}
```

Это работает, но: нет проверки длины буфера, нет проверки выравнивания, нет проверки на ссылки внутри `PacketHeader`. `MemoryMarshal.Read` делает часть этих проверок за вас и не требует `unsafe`-блока. Поэтому в обычном коде предпочитайте его, а `unsafe` оставляйте для мест, где накладные расходы реально мешают.

## Ловушки

**`Unsafe.As<TFrom, TTo>` не проверяет размеры.** Если `sizeof(TFrom) != sizeof(TTo)`, вы получите мусор или выйдете за границы. Для безопасной версии есть `BitCast`, который падает при несовпадении.

**Ссылка из `Unsafe.AsRef(void*)` не отслеживается GC.** Объект может сдвинуться, и ссылка станет висячей. Для `void*` объект нужно пинить через `fixed` или `GCHandle`.

**`CreateSpan` не проверяет длину.** Вы можете создать span длиннее реальной памяти. Рантайм не спасет, это ваша ответственность.

**`Cast` требует blittable-типов и уважения к выравниванию.** На x86 невыровненный доступ прощается, на ARM может стоить дорого или падать. Если источник не выровнен, читайте через `ReadUnaligned`, а не через прямую переинтерпретацию.

**Endianness остается на вас.** `MemoryMarshal.Read<PacketHeader>` читает в порядке байтов платформы. Для сетевых протоколов, где все big-endian, нужен `BinaryPrimitives.ReadUInt32BigEndian` или ручное переставление. Рантайм не будет переставлять байты за вас.

**`Unsafe.As<T>(object)` не проверяет тип.** Классический способ получить объект, у которого method table от одного типа, а данные от другого. Диспетчеризация пойдет не туда, и падение будет далеко от места ошибки.

**`CreateFromPinnedArray` требует реального пина.** Если массив не запинен, а вы пометили его как запиненный, GC его сдвинет, и `Memory<T>.Pin` вернет неверный указатель.

**`MemoryMarshal.AsMemory` на `ReadOnlyMemory<char>` поверх строки дает мутабельный доступ к неизменяемой строке.** Это технически дыра в типах, но она существует, чтобы один и тот же буфер мог быть то `ReadOnlyMemory<char>`, то `Memory<char>`. Не пишите в него, если не хотите странных багов.

## Частые ошибки на примерах

Соберу главные грабли в виде "было / стало".

**Переинтерпретация несовпадающих размеров.**

```csharp
// было: читаем мусор за пределами int
long value = 0;
int x = Unsafe.As<long, int>(ref value); // нет проверки размера

// стало: проверяемый вариант
// int x = Unsafe.BitCast<long, int>(value); // ошибка компиляции, размеры разные

// если действительно нужно взять младшие 4 байта, делайте это явно
int low = (int)value;
```

**Ссылка на незапиненный объект.**

```csharp
// было: указатель может стать висячим
byte[] buffer = new byte[1024];
unsafe
{
    byte* p = (byte*)Unsafe.AsPointer(ref buffer[0]);
    // GC может подвинуть buffer прямо здесь
    NativeCall(p);
}

// стало: пиним на время использования
unsafe
{
    fixed (byte* p = buffer)
    {
        NativeCall(p);
    }
}
```

**Создание span длиннее памяти.**

```csharp
// было: span длиной 1000 поверх 10 байт
Span<byte> small = stackalloc byte[10];
Span<byte> bad = MemoryMarshal.CreateSpan(ref small[0], 1000); // порча памяти

// стало: длина из реального буфера
Span<byte> good = MemoryMarshal.CreateSpan(ref small[0], small.Length);
```

**Невыровненный Cast.**

```csharp
// было: на ARM может упасть или работать медленно
ReadOnlySpan<byte> raw = buffer.Slice(1); // сдвиг на 1 байт ломает выравнивание
ReadOnlySpan<int> ints = MemoryMarshal.Cast<byte, int>(raw);

// стало: читаем по одному через ReadUnaligned
for (int i = 0; i + 4 <= raw.Length; i += 4)
{
    int value = Unsafe.ReadUnaligned<int>(ref Unsafe.AsRef(in raw[i]));
    // ...
}
```

**Забытый порядок байтов.**

```csharp
// было: на little-endian машине прочитает наоборот
uint value = MemoryMarshal.Read<uint>(networkBuffer);

// стало: явно указываем сетевой порядок
uint value2 = BinaryPrimitives.ReadUInt32BigEndian(networkBuffer);
```

**Помеченный как запиненный, но не запиненный массив.**

```csharp
// было: Memory думает, что массив запинен, а GC двигает его
byte[] notPinned = new byte[1024];
Memory<byte> bad = MemoryMarshal.CreateFromPinnedArray(notPinned, 0, notPinned.Length);

// стало: либо реально запинить через POH
byte[] pinned = GC.AllocateUninitializedArray<byte>(1024, pinned: true);
Memory<byte> good = MemoryMarshal.CreateFromPinnedArray(pinned, 0, pinned.Length);

// либо не использовать этот метод и брать обычный AsMemory
Memory<byte> safe = notPinned.AsMemory();
```

## Что в итоге

`Unsafe` - это набор интринсиков, которые JIT превращает в одну инструкцию или в ноль. Он дает переинтерпретацию, арифметику по ссылкам, сырые копирования и чтения без выравнивания. `MemoryMarshal` - это слой поверх него, который добавляет проверки на ссылки внутри типов, вычисляет новую длину при переинтерпретации и умеет доставать backing-память из `Span`/`Memory`.

Вместе они дают то, чего не хватает обычному C#: работу с памятью как с байтами, но с сохранением managed-ссылок, которые GC продолжает видеть. Пользуйтесь ими там, где профилировщик показал реальную стоимость проверок или копирований, и держите их подальше от бизнес-логики. Это инструмент для узкого горячего пути, а не стиль жизни.

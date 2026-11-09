---
title: "Unsafe и MemoryMarshal: работаем с адресами, не выключая GC"
description: "Указатели, ref T, MemoryMarshal и ручная работа с памятью."
course: csharp
article: 3
duration: 15
tags: ["Unsafe", "MemoryMarshal", "pointers"]
---

Обычный C# тщательно оберегает разработчика от прямых адресов памяти. Вы не знаете, по какому физическому адресу расположен объект, сборщик мусора в любой момент может переместить его при дефрагментации кучи, а попытку разыменовать висячую ссылку пресечёт компилятор. Это фундамент типобезопасности и защиты от повреждения памяти.

Однако в ультра-высокопроизводительном системном коде эти гарантии иногда превращаются в бутылочное горлышко:
- Нужно десериализовать бинарный заголовок сетевого пакета прямо из буфера байтов без копирования полей через `BitConverter`.
- Требуется обойти проверку ковариантности массивов и двойные проверки границ при индексации в критическом цикле.
- Нужно выполнить переинтерпретацию памяти (type punning) — прочитать `Span<byte>` как `Span<int>` или массив структур.

Для этих задач CoreCLR предоставляет два хирургических инструмента: `System.Runtime.CompilerServices.Unsafe` и `System.Runtime.InteropServices.MemoryMarshal`. Это не просто `unsafe`-блоки из C++: эти API позволяют манипулировать адресами на уровне машинного кода, сохраняя при этом корректное отслеживание ссылок сборщиком мусора.

---

## Три мира указателей в .NET

Чтобы понимать происходящее под капотом, важно различать три принципиально разные формы адресации данных в CLR:

1. **Объектная ссылка (`object`, `string`, `class`):**
   Указывает строго на начало объекта в куче (на поле `MethodTable`). GC знает о ней всё: регистрирует её в корнях, сканирует при сборке и автоматически обновляет адрес, если объект переместился.
2. **Управляемая ссылка (`ref T`, managed byref):**
   Указывает на конкретное значение типа `T`. Это может быть элемент массива, поле структуры или переменная на стеке. GC отслеживает `ref T` через стековые GC-карты и точно так же корректирует адрес при сжатии кучи.
3. **Неуправляемый указатель (`T*`, `void*`):**
   Обычное 64-битное число — физический виртуальный адрес. Сборщик мусора про него **не знает ничего**. Если GC решит переместить объект, неуправляемый указатель останется смотреть на старое место памяти, превратившись в висячую ссылку (dangling pointer).

Классы `Unsafe` и `MemoryMarshal` служат скоростными мостами между этими тремя мирами.

---

## Внутренности Unsafe: почему методы в исходниках выбрасывают исключения

Откроем исходный код `src/libraries/System.Private.CoreLib/src/System/Runtime/CompilerServices/Unsafe.cs`:

```csharp title="src/libraries/System.Private.CoreLib/src/System/Runtime/CompilerServices/Unsafe.cs"
[Intrinsic]
[NonVersionable]
[MethodImpl(MethodImplOptions.AggressiveInlining)]
public static unsafe void* AsPointer<T>(ref readonly T value)
{
    throw new PlatformNotSupportedException();
}
```

Любопытная деталь: в теле метода написано буквально `throw new PlatformNotSupportedException();`.

Почему этот метод никогда не падает с `PlatformNotSupportedException` в реальном приложении?

Секрет в атрибуте `[Intrinsic]`. Для RyuJIT этот метод является встроенной операцией компилятора. Когда JIT видит вызов `Unsafe.AsPointer`, он вообще не генерирует инструкцию вызова функции (`call`). Вместо этого компилятор заменяет его на прямой перевод управляемой ссылки в машинный регистр:

```asm
; Код для AsPointer (x64)
; Вход: rcx содержит управляемую ссылку (managed byref)
; Выход: rax содержит тот же самый адрес, но теперь трактуемый как void*
mov   rax, rcx
ret
```

Тело с `throw` существует исключительно для статических анализаторов и рефлексии в средах, где нет поддержки RyuJIT.

В шапке файла разработчики CoreCLR оставили поясняющий комментарий:
> *«The implementations of most methods in this file are provided as intrinsics. In CoreCLR, the body of the functions are replaced by the EE with unsafe code.»*

---

## Unsafe.As: идеальный Type Punning без накладных расходов

В C++ программисты часто используют `reinterpret_cast` или объединения (`union`) для смены типа данных без копирования. В C# для этого есть `Unsafe.As`:

```csharp
// Превращение управляемой ссылки одного типа в другой
public static ref TTo As<TFrom, TTo>(ref TFrom source);
```

В машинном коде `Unsafe.As` транслируется ровно в **ноль инструкций**. JIT просто меняет тип узла в своём внутреннем дереве промежуточного представления (IR).

### Пример из реального рантайма: обход приватных полей
Рантайм сам активно использует этот трюк. Например, когда нужно получить прямой доступ к сырым байтам строки `string`, не аллоцируя массив:

```csharp
string s = "Hello World";
// Получаем ref char на первый символ строки минуя вызовы и проверки
ref char firstChar = ref MemoryMarshal.GetReference(s.AsSpan());
```

---

## Layout объектов и смещения полей

Чтобы безопасно работать с низкоуровневой памятью, нужно понимать внутреннее выравнивание типов. Структура `MethodTable` и `EEClass` в CoreCLR регламентирует физическое расположение полей:

![Layout MethodTable и выравнивание полей в CoreCLR (BOTR)](/movtobase/images/csharp/typeloader-fig2.png)

В CoreCLR поля в классах по умолчанию упорядочиваются оптимизатором (Auto Layout), чтобы минимизировать padding (дыры выравнивания). 

Для структур, с которыми вы работаете через `Unsafe` или Interop, всегда явно указывайте последовательное размещение:

```csharp
[StructLayout(LayoutKind.Sequential, Pack = 1)]
public struct PacketHeader
{
    public uint Magic;     // 4 байта
    public ushort Version; // 2 байта
    public ushort Flags;   // 2 байта
    public uint Length;    // 4 байта
}
```

Арифметика смещений выполняется через `Unsafe.AddByteOffset`:

```csharp
// Сдвиг managed byref на произвольное число байт
ref byte nextField = ref Unsafe.AddByteOffset(ref baseRef, (nint)offset);
```

В отличие от арифметики обычных указателей `ptr + offset`, `Unsafe.AddByteOffset` сохраняет тип `ref T` — сборщик мусора продолжает отслеживать эту ссылку!

---

## MemoryMarshal.Cast: нарезка памяти без копирования

Один из самых мощных методов во всей экосистеме .NET — `MemoryMarshal.Cast<TFrom, TTo>`:

![Схема работы MemoryMarshal.Cast](/movtobase/images/csharp/unsafe-memory-cast.svg)

Посмотрим, как он реализован в CoreCLR (`src/libraries/System.Private.CoreLib/src/System/Runtime/InteropServices/MemoryMarshal.cs`):

```csharp title="src/libraries/System.Private.CoreLib/src/System/Runtime/InteropServices/MemoryMarshal.cs"
public static Span<TTo> Cast<TFrom, TTo>(Span<TFrom> span)
    where TFrom : struct
    where TTo : struct
{
    // Расчет новой длины с учетом размеров структур
    int toSize = Unsafe.SizeOf<TTo>();
    int fromSize = Unsafe.SizeOf<TFrom>();
    int newLength = checked((int)((long)span.Length * fromSize / toSize));

    return new Span<TTo>(ref Unsafe.As<TFrom, TTo>(ref MemoryMarshal.GetReference(span)), newLength);
}
```

Метод берет `Span<TFrom>` и возвращает `Span<TTo>`, указывающий **на ту же самую физическую память**. 

Как вычисляется новая длина?
1. Полный размер входного спана в байтах: `totalBytes = span.Length * sizeof(TFrom)`.
2. Новая длина: `newLength = totalBytes / sizeof(TTo)`.
3. Создаётся новый экземпляр `Span<TTo>` со старым адресом `_reference` и новой длиной `newLength`.

### Пример: чтение заголовка пакета за 0 наносекунд
```csharp
Span<byte> networkBuffer = ReadFromSocket();

// Мгновенная интерпретация начала буфера как структуры заголовка!
// Никакого BitConverter, никаких промежуточных объектов в куче.
ref PacketHeader header = ref MemoryMarshal.AsRef<PacketHeader>(networkBuffer);

if (header.Magic == 0x54454E2E) // ".NET"
{
    ProcessPayload(networkBuffer.Slice(Unsafe.SizeOf<PacketHeader>(), (int)header.Length));
}
```

> **Внимание — выравнивание (Alignment):** На архитектурах ARM64 обращение к 4-байтовому или 8-байтовому числу по невыровненному адресу (не кратному 4 или 8) может приводить к аппаратному исключению шины или жесткой деградации скорости из-за работы эмулятора невыровненного доступа в ядре ОС. Убедитесь, что смещение в буфере кратно выравниванию целевой структуры.

---

## GetArrayDataReference: обход проверки ковариантности массивов

Когда вы обращаетесь к обычному массиву в C#:

```csharp
array[i] = value;
```

JIT компилирует две скрытые проверки:
1. **Bounds Check:** проверка, что `i < array.Length`.
2. **Array Covariance Check:** поскольку в .NET массивы исторически ковариантны (`string[]` можно привести к `object[]`), рантайм при записи ссылки в массив объектов обязан проверить фактический тип элемента в `MethodTable`, генерируя вызов `JIT_Stelem_Ref`.

В критическом сетевом коде это лишние инструкции на каждый элемент. 

Метод `MemoryMarshal.GetArrayDataReference` достаёт прямую управляемую ссылку на нулевой элемент массива в обход проверок:

```csharp title="src/libraries/System.Private.CoreLib/src/System/Runtime/InteropServices/MemoryMarshal.cs"
[MethodImpl(MethodImplOptions.AggressiveInlining)]
public static ref T GetArrayDataReference<T>(T[] array)
{
    return ref Unsafe.As<byte, T>(ref Unsafe.AddByteOffset(
        ref Unsafe.As<RawData>(array).Data,
        (nuint)RuntimeHelpers.OffsetToStringData));
}
```

Рантайм берет указатель на массив, сдвигает его на базовый размер заголовка объекта (`BaseSize`) и возвращает `ref byte` первого реального элемента данных. Получив эту ссылку, вы можете обходить массив через `Unsafe.Add` со скоростью нативного C++.

---

## Главные опасности и GC Holes

С колоссальной скоростью приходит колоссальная ответственность:

1. **GC Hole (рассинхронизация сборщика):**
   Если вы получили неуправляемый указатель через `void* ptr = Unsafe.AsPointer(ref obj.field)`, сборщик мусора **не видит** этот `ptr`. Если объект `obj` не закреплен (pinned), и в этот момент произойдёт сборка Gen 0 с компактировкой, объект уедет по новому адресу, а `ptr` продолжит указывать на чужие данные. Любая запись по нему разрушит хип.
   *Правило:* получили `void*` из управляемого объекта — держите объект под `fixed` или используйте `POH`.
2. **Dangling ByRef (возврат ссылки на локальный стек):**
   Никогда не возвращайте `ref T`, указывающий на локальную переменную метода или буфер `stackalloc`. После возврата из функции фрейм стека освобождается, и следующая функция перезапишет эти данные. Roslyn отслеживает большинство таких ошибок через `ref struct`, но с `Unsafe` эту защиту можно случайно обойти.
3. **Нарушение инвариантов иммутабельности:**
   Через `MemoryMarshal.GetReference` можно модифицировать символы внутри строки `string`. Если эта строка была интернирована рантаймом (например, строковый литерал), вы измените её глобально для всего процесса, сломав работу внутренних словарей .NET.

---

## Итог

`Unsafe` и `MemoryMarshal` — это инструментарий высшего пилотажа. Они устраняют границу между высокоуровневой платформой C# и производительностью «железа», позволяя реализовывать бескомпромиссные алгоритмы с нулевым копированием и нулевыми аллокациями.

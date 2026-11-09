export const siteBase = '/movtobase';

export interface Lesson {
  slug: string;
  number: number;
  title: string;
  description: string;
  duration: number;
  part: 1 | 2 | 3;
  partTitle: string;
  tags: string[];
}

export interface Article {
  slug: string;
  number: number;
  title: string;
  description: string;
  duration: number;
  tags: string[];
}

export const zigLessons: Lesson[] = [
  {
    "slug": "01-hello-world",
    "number": 1,
    "title": "Первый hello world",
    "description": "В Zig 0.17 main получает std.process.Init с аргументами, окружением, аллокатором и std.Io. Разбираем минимальную программу и путь байтов до терминала.",
    "duration": 5,
    "part": 1,
    "partTitle": "Часть I. База",
    "tags": [
      "hello world",
      "stdio"
    ]
  },
  {
    "slug": "02-peremennye-i-tipy",
    "number": 2,
    "title": "Переменные и их типы",
    "description": "Zig требует явного сужения типов, ловит переполнение в Debug и хранит comptime_int отдельно от машинных целых. Разбираем, как устроены типы.",
    "duration": 5,
    "part": 1,
    "partTitle": "Часть I. База",
    "tags": [
      "types",
      "integers"
    ]
  },
  {
    "slug": "03-stroki",
    "number": 3,
    "title": "Строки",
    "description": "Строка в Zig это срез []const u8 с длиной рядом с указателем. Разбираем литералы, sentinel, std.mem и ошибки при работе с UTF-8.",
    "duration": 5,
    "part": 1,
    "partTitle": "Часть I. База",
    "tags": [
      "strings",
      "memory"
    ]
  },
  {
    "slug": "04-oshibki",
    "number": 4,
    "title": "Ошибки и их обработка",
    "description": "Функция возвращает error union, и компилятор не дает отбросить ошибку. Разбираем error sets, try, catch, errdefer и представление ошибок.",
    "duration": 5,
    "part": 1,
    "partTitle": "Часть I. База",
    "tags": [
      "errors",
      "try/catch"
    ]
  },
  {
    "slug": "05-usloviya-i-optionals",
    "number": 5,
    "title": "Условия if/else и optionals",
    "description": "if принимает только bool, а отсутствие значения выражается типом ?T. Разбираем захват, orelse, .? и то, сколько стоит null.",
    "duration": 5,
    "part": 1,
    "partTitle": "Часть I. База",
    "tags": [
      "optionals",
      "control flow"
    ]
  },
  {
    "slug": "06-cikly",
    "number": 6,
    "title": "Циклы while и for",
    "description": "В Zig два цикла: while с отдельным шагом и for по коллекциям. Разбираем метки, захват optional и то, как циклы выглядят в std.mem.",
    "duration": 5,
    "part": 1,
    "partTitle": "Часть I. База",
    "tags": [
      "loops",
      "while/for"
    ]
  },
  {
    "slug": "07-funkcii",
    "number": 7,
    "title": "Функции",
    "description": "Параметры в Zig неизменяемы, return обязателен, а дженерики работают через comptime T и anytype. Разбираем сигнатуры и указатели на функции.",
    "duration": 5,
    "part": 1,
    "partTitle": "Часть I. База",
    "tags": [
      "functions",
      "scope"
    ]
  },
  {
    "slug": "08-struktury",
    "number": 8,
    "title": "Структуры",
    "description": "Структура хранит данные и методы, а порядок полей зависит от layout. Разбираем auto, extern, packed и стоимость выравнивания.",
    "duration": 5,
    "part": 1,
    "partTitle": "Часть I. База",
    "tags": [
      "structs",
      "methods"
    ]
  },
  {
    "slug": "09-enum-i-switch",
    "number": 9,
    "title": "Enum и switch",
    "description": "Enum в Zig это отдельный тип, а switch обязан покрыть все варианты. Разбираем базовый тип, диапазоны, методы и проверку значений извне.",
    "duration": 5,
    "part": 2,
    "partTitle": "Часть II. Язык и память",
    "tags": [
      "enums",
      "switch"
    ]
  },
  {
    "slug": "10-union-i-tagged-union",
    "number": 10,
    "title": "Union и tagged union",
    "description": "union(enum) хранит тег и payload, bare union доверяет тебе. Разбираем switch с захватом, extern union и типичные ошибки доступа.",
    "duration": 5,
    "part": 2,
    "partTitle": "Часть II. Язык и память",
    "tags": [
      "unions",
      "tagged union"
    ]
  },
  {
    "slug": "11-massivy-srezy-ukazateli",
    "number": 11,
    "title": "Массивы, срезы и указатели",
    "description": "Массив, срез и многоэлементный указатель это три разных типа. Разбираем длину, sentinel, выравнивание и границы.",
    "duration": 5,
    "part": 2,
    "partTitle": "Часть II. Язык и память",
    "tags": [
      "slices",
      "pointers"
    ]
  },
  {
    "slug": "12-sborka-proekta-i-moduli",
    "number": 12,
    "title": "Сборка проекта и модули",
    "description": "build.zig это Zig-программа, которая строит граф сборки. Разбираем модули, импорты, зависимости и C-код в проекте.",
    "duration": 5,
    "part": 2,
    "partTitle": "Часть II. Язык и память",
    "tags": [
      "build.zig",
      "modules"
    ]
  },
  {
    "slug": "13-testy-i-otladka",
    "number": 13,
    "title": "Тесты и отладка",
    "description": "Тесты в Zig это блоки test рядом с кодом. Разбираем expect, тестовый аллокатор, проверку утечек и отладку через std.debug.",
    "duration": 5,
    "part": 2,
    "partTitle": "Часть II. Язык и память",
    "tags": [
      "testing",
      "debugging"
    ]
  },
  {
    "slug": "14-allokatory-i-vladenie-pamyatyu",
    "number": 14,
    "title": "Аллокаторы и владение памятью",
    "description": "Аллокатор передается параметром, а владение памятью задается через defer. Разбираем DebugAllocator, арену, FixedBufferAllocator и ArrayList.",
    "duration": 5,
    "part": 2,
    "partTitle": "Часть II. Язык и память",
    "tags": [
      "allocators",
      "memory"
    ]
  },
  {
    "slug": "15-comptime-i-refleksiya",
    "number": 15,
    "title": "Comptime и рефлексия",
    "description": "comptime выполняет код при компиляции. Разбираем generic-функции, @typeInfo, inline for и проверки через @compileError.",
    "duration": 5,
    "part": 2,
    "partTitle": "Часть II. Язык и память",
    "tags": [
      "comptime",
      "reflection"
    ]
  },
  {
    "slug": "16-standardnaya-biblioteka",
    "number": 16,
    "title": "Стандартная библиотека на практике",
    "description": "Хеш-таблицы, сортировка, JSON, файлы, время, случайные числа и логи. Карта актуальных API std для Zig 0.17.",
    "duration": 5,
    "part": 2,
    "partTitle": "Часть II. Язык и память",
    "tags": [
      "std",
      "json"
    ]
  },
  {
    "slug": "17-novyy-io",
    "number": 17,
    "title": "Новый I/O в Zig 0.17",
    "description": "В 0.17 ввод-вывод переехал в std.Io. Разбираем writer и reader, файлы, каталоги, таймеры и поле interface.",
    "duration": 5,
    "part": 3,
    "partTitle": "Часть III. Системное программирование",
    "tags": [
      "io",
      "std.Io"
    ]
  },
  {
    "slug": "18-oshibki-v-produktsii",
    "number": 18,
    "title": "Ошибки в продакшене",
    "description": "Ошибки проектируют: явные наборы, контекст, откат ресурсов, отмена и коды выхода. Разбираем рабочие приемы для Zig.",
    "duration": 5,
    "part": 3,
    "partTitle": "Часть III. Системное программирование",
    "tags": [
      "errors",
      "production"
    ]
  },
  {
    "slug": "19-c-interop",
    "number": 19,
    "title": "C interop",
    "description": "Zig вызывает C без оберток и экспортирует функции с C ABI. Разбираем extern, translate-c и сборку C-кода в build.zig.",
    "duration": 5,
    "part": 3,
    "partTitle": "Часть III. Системное программирование",
    "tags": [
      "c interop",
      "ffi"
    ]
  },
  {
    "slug": "20-potoki-i-atomiki",
    "number": 20,
    "title": "Потоки и атомики",
    "description": "std.Thread, std.Io.Mutex и std.atomic.Value дают потоки и синхронизацию без скрытой магии. Разбираем порядок памяти и гонки.",
    "duration": 5,
    "part": 3,
    "partTitle": "Часть III. Системное программирование",
    "tags": [
      "threads",
      "atomics"
    ]
  },
  {
    "slug": "21-proizvoditelnost-i-build-modes",
    "number": 21,
    "title": "Производительность и build modes",
    "description": "Debug, ReleaseSafe, ReleaseFast и ReleaseSmall меняют проверки и скорость. Разбираем замеры, @setRuntimeSafety, SIMD и профилирование.",
    "duration": 5,
    "part": 3,
    "partTitle": "Часть III. Системное программирование",
    "tags": [
      "performance",
      "build modes"
    ]
  },
  {
    "slug": "22-kross-kompilyatsiya-i-ci",
    "number": 22,
    "title": "Кросс-компиляция и CI",
    "description": "Zig собирает бинарники под другие платформы без отдельного тулчейна. Разбираем target triple, libc, упаковку и CI на GitHub Actions.",
    "duration": 5,
    "part": 3,
    "partTitle": "Часть III. Системное программирование",
    "tags": [
      "cross-compilation",
      "ci"
    ]
  },
  {
    "slug": "23-capstone-faylovyy-indeksator",
    "number": 23,
    "title": "Capstone: файловый индексатор",
    "description": "Финальный проект: CLI-индексатор файлов на std.Io, StringHashMap и ArrayList. Собираем аллокаторы, тесты и build.zig вместе.",
    "duration": 5,
    "part": 3,
    "partTitle": "Часть III. Системное программирование",
    "tags": [
      "capstone",
      "cli"
    ]
  },
  {
    "slug": "24-prodvinutyy-zig",
    "number": 24,
    "title": "Продвинутый Zig: SIMD и свои аллокаторы",
    "description": "SIMD через @Vector и собственный аллокатор с vtable. Разбираем векторные операции, учет памяти и контракт Allocator.",
    "duration": 5,
    "part": 3,
    "partTitle": "Часть III. Системное программирование",
    "tags": [
      "simd",
      "allocators"
    ]
  }
];

export const csharpArticles: Article[] = [
  {
    "slug": "01-gc-iznutri",
    "number": 1,
    "title": "GC изнутри: поколения, кучи и как не будить сборщик",
    "description": "Поколения, LOH, финализация и почему аллокации — это не бесплатно.",
    "duration": 15,
    "tags": [
      "GC",
      "CoreCLR",
      "memory"
    ]
  },
  {
    "slug": "02-span-i-memory",
    "number": 2,
    "title": "Span<T> и Memory<T>: смотрим на память, не копируя ее",
    "description": "Стековые срезы, MemoryManager и как не копировать данные.",
    "duration": 17,
    "tags": [
      "Span",
      "Memory",
      "allocations"
    ]
  },
  {
    "slug": "03-unsafe-i-memorymarshal",
    "number": 3,
    "title": "Unsafe и MemoryMarshal: работаем с адресами, не выключая GC",
    "description": "Указатели, ref T, MemoryMarshal и ручная работа с памятью.",
    "duration": 15,
    "tags": [
      "Unsafe",
      "MemoryMarshal",
      "pointers"
    ]
  },
  {
    "slug": "04-struktura-nativeaot",
    "number": 4,
    "title": "Структура NativeAOT: как C# превращается в один нативный бинарник",
    "description": "Как C# превращается в нативный бинарник: дерево зависимостей, тримминг и нативный старт.",
    "duration": 33,
    "tags": [
      "NativeAOT",
      "compilation"
    ]
  },
  {
    "slug": "05-bezallokacionnyy-tcp-server",
    "number": 5,
    "title": "Безаллокационный TCP-сервер на C#: ноль байт из кучи в горячем пути",
    "description": "SocketAsyncEventArgs, IOCP и epoll, ноль аллокаций на соединение.",
    "duration": 14,
    "tags": [
      "TCP",
      "sockets",
      "zero-allocation"
    ]
  },
  {
    "slug": "06-system-io-pipelines",
    "number": 6,
    "title": "System.IO.Pipelines: разбор протокола поверх TCP без копирований",
    "description": "Pipe, SequenceReader, backpressure и потоковая обработка TCP.",
    "duration": 13,
    "tags": [
      "Pipelines",
      "I/O",
      "backpressure"
    ]
  }
];

export const zigParts = [
  { number: 1, title: 'Часть I. База', lessons: zigLessons.filter((l) => l.part === 1) },
  { number: 2, title: 'Часть II. Язык и память', lessons: zigLessons.filter((l) => l.part === 2) },
  { number: 3, title: 'Часть III. Системное программирование', lessons: zigLessons.filter((l) => l.part === 3) },
];

export const zigTotal = zigLessons.length;

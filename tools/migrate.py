"""Migrate movtobase Markdown sources into Astro/Starlight content."""

from __future__ import annotations

import json
import math
import re
import shutil
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

BASE = Path(__file__).resolve().parent.parent
SRC = Path(r"C:\Users\heller\Desktop\movtobase-site\docs")
DOCS = BASE / "src" / "content" / "docs"
TASKS = BASE / "src" / "content" / "tasks"
ANSWERS = BASE / "src" / "content" / "answers"
ARTICLES = BASE / "src" / "content" / "articles"
DATA = BASE / "src" / "data"

PART_TITLES = {
    1: "Часть I. База",
    2: "Часть II. Язык и память",
    3: "Часть III. Системное программирование",
}

TAGS = {
    1: ["hello world", "stdio"],
    2: ["types", "integers"],
    3: ["strings", "memory"],
    4: ["errors", "try/catch"],
    5: ["optionals", "control flow"],
    6: ["loops", "while/for"],
    7: ["functions", "scope"],
    8: ["structs", "methods"],
    9: ["enums", "switch"],
    10: ["unions", "tagged union"],
    11: ["slices", "pointers"],
    12: ["build.zig", "modules"],
    13: ["testing", "debugging"],
    14: ["allocators", "memory"],
    15: ["comptime", "reflection"],
    16: ["std", "json"],
    17: ["io", "std.Io"],
    18: ["errors", "production"],
    19: ["c interop", "ffi"],
    20: ["threads", "atomics"],
    21: ["performance", "build modes"],
    22: ["cross-compilation", "ci"],
    23: ["capstone", "cli"],
    24: ["simd", "allocators"],
}

CSHARP_TAGS = {
    1: ["GC", "CoreCLR", "memory"],
    2: ["Span", "Memory", "allocations"],
    3: ["Unsafe", "MemoryMarshal", "pointers"],
    4: ["NativeAOT", "compilation"],
    5: ["TCP", "sockets", "zero-allocation"],
    6: ["Pipelines", "I/O", "backpressure"],
}

CSHARP_CARDS = {
    1: "Поколения, LOH, финализация и почему аллокации — это не бесплатно.",
    2: "Стековые срезы, MemoryManager и как не копировать данные.",
    3: "Указатели, ref T, MemoryMarshal и ручная работа с памятью.",
    4: "Как C# превращается в нативный бинарник: дерево, тримминг, старт.",
    5: "SocketAsyncEventArgs, IOCP и epoll, ноль аллокаций на соединение.",
    6: "Pipe, SequenceReader, backpressure и потоковая обработка TCP.",
}


def strip_h1(text: str) -> tuple[str, str]:
    lines = text.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r"^#\s+(.+?)\s*$", line)
        if m:
            return m.group(1).strip(), "\n".join(lines[i + 1 :]).lstrip("\n")
    return "", text


def strip_tail(text: str) -> str:
    text = re.sub(r"\n---\s*\n\s*[✅📝][^\n]*\n?\s*$", "\n", text, flags=re.S)
    text = re.sub(r"\n---\s*\n\s*[✅📝].*$", "\n", text, flags=re.S)
    return text.rstrip() + "\n"


def strip_md(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[*_#>|]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def first_paragraph(body: str) -> str:
    for block in re.split(r"\n\s*\n", body):
        block = block.strip()
        if not block:
            continue
        if block.startswith(("```", "|", "#", "---", ">", "- ", "1.")):
            continue
        if block.startswith("!"):
            continue
        plain = strip_md(block)
        if len(plain) > 40:
            return plain
    return ""


def clamp_description(text: str, limit: int = 170) -> str:
    text = strip_md(text)
    if len(text) <= limit:
        return text
    cut = text.rfind(" ", 0, limit)
    if cut < limit // 2:
        cut = limit
    return text[:cut].rstrip(" ,.;:—") + "…"


def reading_minutes(body: str) -> int:
    text = re.sub(r"```.*?```", " ", body, flags=re.S)
    words = len(re.findall(r"\w+", text))
    return max(5, math.ceil(words / 180))


def escape_angles(text: str) -> str:
    """Escape `<` outside fenced and inline code so Markdown/MDX keeps generics."""
    parts = re.split(r"(```.*?```|`[^`\n]*`)", text, flags=re.S)
    out = []
    for i, part in enumerate(parts):
        if i % 2 == 1:
            out.append(part)
        else:
            out.append(part.replace("<", "&lt;"))
    return "".join(out)


def yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def lesson_meta(number: int) -> dict:
    part = 1 if number <= 8 else 2 if number <= 16 else 3
    return {
        "part": part,
        "partTitle": PART_TITLES[part],
        "tags": TAGS[number],
        "difficulty": part,
    }


def migrate_lessons() -> list[dict]:
    lessons = []
    src_dir = SRC / "zig" / "lessons"
    for path in sorted(src_dir.glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        h1, body = strip_h1(raw)
        m = re.match(r"^(\d+)\.\s+(.+)$", h1)
        if not m:
            raise SystemExit(f"Bad lesson title: {path.name}: {h1!r}")
        number = int(m.group(1))
        title = m.group(2).strip()
        body = re.sub(r"\n##\s+Пробуем руками.*$", "\n", body, flags=re.S)
        body = body.rstrip() + "\n"
        meta = lesson_meta(number)
        description = clamp_description(first_paragraph(body))
        duration = reading_minutes(body)
        slug = path.stem
        lessons.append(
            {
                "slug": slug,
                "number": number,
                "title": title,
                "description": description,
                "duration": duration,
                **meta,
            }
        )
        front = "\n".join(
            [
                "---",
                f"title: {yaml_string(f'{number}. {title}')}",
                f"description: {yaml_string(description)}",
                "course: zig",
                f"lesson: {number}",
                f"part: {meta['part']}",
                f"duration: {duration}",
                f"tags: {json.dumps(meta['tags'], ensure_ascii=False)}",
                "---",
            ]
        )
        body = escape_angles(body)
        content = (
            f"{front}\n\n"
            "import TaskForLesson from '../../../../components/TaskForLesson.astro';\n\n"
            f"{body}\n"
            f'<TaskForLesson lesson="{slug}" />\n'
        )
        write(DOCS / "zig" / "lessons" / f"{slug}.mdx", content)
    return lessons


def migrate_tasks_and_answers() -> None:
    if any(TASKS.glob("*.md")) and any(ANSWERS.glob("*.md")):
        return
    for kind, src_name, schema_kind in (
        ("tasks", "tasks", "task"),
        ("answers", "answers", "answer"),
    ):
        src_dir = SRC / "zig" / src_name
        out_dir = TASKS if kind == "tasks" else ANSWERS
        for path in sorted(src_dir.glob("*.md")):
            raw = path.read_text(encoding="utf-8")
            h1, body = strip_h1(raw)
            m = re.match(r"^(?:Задача|Ответ к задаче)\s+(\d+)\.\s+(.+)$", h1)
            if not m:
                raise SystemExit(f"Bad {kind} title: {path.name}: {h1!r}")
            number = int(m.group(1))
            title = m.group(2).strip()
            body = strip_tail(body)
            meta = lesson_meta(number)
            description = clamp_description(first_paragraph(body) or strip_md(body))
            front = "\n".join(
                [
                    "---",
                    f"number: {number}",
                    f"title: {yaml_string(title)}",
                    f"lesson: {yaml_string(path.stem)}",
                    f"part: {meta['part']}",
                    f"difficulty: {meta['difficulty']}",
                    f"tags: {json.dumps(meta['tags'], ensure_ascii=False)}",
                    f"description: {yaml_string(description)}",
                    "---",
                ]
            )
            write(out_dir / f"{path.stem}.md", f"{front}\n\n{escape_angles(body)}")


def migrate_csharp() -> list[dict]:
    articles = []
    src_dir = SRC / "csharp"
    for path in sorted(src_dir.glob("*.md")):
        if path.name == "index.md":
            continue
        raw = path.read_text(encoding="utf-8")
        h1, body = strip_h1(raw)
        m = re.match(r"^(\d+)-", path.name)
        if not m:
            raise SystemExit(f"Bad C# filename: {path.name}")
        number = int(m.group(1))
        body = body.rstrip() + "\n"
        description = clamp_description(CSHARP_CARDS.get(number) or first_paragraph(body))
        duration = reading_minutes(body)
        articles.append(
            {
                "slug": path.stem,
                "number": number,
                "title": h1,
                "description": description,
                "duration": duration,
                "tags": CSHARP_TAGS[number],
            }
        )
        front = "\n".join(
            [
                "---",
                f"title: {yaml_string(h1)}",
                f"description: {yaml_string(description)}",
                "course: csharp",
                f"article: {number}",
                f"duration: {duration}",
                f"tags: {json.dumps(CSHARP_TAGS[number], ensure_ascii=False)}",
                "---",
            ]
        )
        # `.md` (not `.mdx`) keeps C# generics like Span<T> out of JSX parsing.
        write(ARTICLES / f"{path.stem}.md", f"{front}\n\n{escape_angles(body)}")
    return articles


def migrate_zig_extras() -> None:
    extras = {
        "setup.md": ("setup.md", "Установка и настройка", ["setup", "install"]),
        "cheatsheet.md": ("cheatsheet.md", "Шпаргалка", ["cheatsheet", "syntax"]),
        "migration-017.md": (
            "migration-017.md",
            "Что изменилось в Zig 0.17.0",
            ["zig 0.17", "migration"],
        ),
    }
    # extras live next to lessons in the old docs tree
    for src_name, (out_name, title, tags) in extras.items():
        dest = DOCS / "zig" / out_name
        if dest.exists():
            continue
        path = SRC / "zig" / src_name
        if not path.exists():
            raise SystemExit(f"Missing extra: {path}")
        raw = path.read_text(encoding="utf-8")
        h1, body = strip_h1(raw)
        body = body.rstrip() + "\n"
        description = clamp_description(first_paragraph(body))
        duration = reading_minutes(body)
        front = "\n".join(
            [
                "---",
                f"title: {yaml_string(h1 or title)}",
                f"description: {yaml_string(description)}",
                "course: zig",
                f"duration: {duration}",
                f"tags: {json.dumps(tags, ensure_ascii=False)}",
                "---",
            ]
        )
        write(dest, f"{front}\n\n{escape_angles(body)}")


def read_lesson_meta(paths: list[Path]) -> list[dict]:
    """Read metadata from already rewritten lesson files."""
    lessons = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        parts = text.split("---", 2)
        if len(parts) < 3:
            raise SystemExit(f"Bad frontmatter: {path}")
        meta = {}
        for line in parts[1].splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip()
        number = int(meta["lesson"])
        title = re.sub(r"^\d+\.\s+", "", json.loads(meta["title"]))
        part = int(meta["part"])
        lessons.append(
            {
                "slug": path.stem,
                "number": number,
                "title": title,
                "description": json.loads(meta.get("description", '""')),
                "duration": int(meta.get("duration", "5")),
                "part": part,
                "partTitle": PART_TITLES[part],
                "tags": json.loads(meta.get("tags", "[]")),
            }
        )
    return sorted(lessons, key=lambda lesson: lesson["number"])


def write_data(lessons: list[dict], articles: list[dict]) -> None:
    lines = [
        "export const siteBase = '/movtobase';",
        "",
        "export interface Lesson {",
        "  slug: string;",
        "  number: number;",
        "  title: string;",
        "  description: string;",
        "  duration: number;",
        "  part: 1 | 2 | 3;",
        "  partTitle: string;",
        "  tags: string[];",
        "}",
        "",
        "export interface Article {",
        "  slug: string;",
        "  number: number;",
        "  title: string;",
        "  description: string;",
        "  duration: number;",
        "  tags: string[];",
        "}",
        "",
        "export const zigLessons: Lesson[] = " + json.dumps(lessons, ensure_ascii=False, indent=2) + ";",
        "",
        "export const csharpArticles: Article[] = " + json.dumps(articles, ensure_ascii=False, indent=2) + ";",
        "",
        "export const zigParts = [",
        "  { number: 1, title: 'Часть I. База', lessons: zigLessons.filter((l) => l.part === 1) },",
        "  { number: 2, title: 'Часть II. Язык и память', lessons: zigLessons.filter((l) => l.part === 2) },",
        "  { number: 3, title: 'Часть III. Системное программирование', lessons: zigLessons.filter((l) => l.part === 3) },",
        "];",
        "",
        "export const zigTotal = zigLessons.length;",
        "",
    ]
    write(DATA / "courses.ts", "\n".join(lines))


def main() -> None:
    lesson_dir = DOCS / "zig" / "lessons"
    existing_lessons = sorted(lesson_dir.glob("*.mdx")) if lesson_dir.exists() else []

    for path in (TASKS, ANSWERS, DOCS / "csharp", ARTICLES, DATA):
        if path.exists():
            shutil.rmtree(path)
    for path in (DOCS / "zig",):
        path.mkdir(parents=True, exist_ok=True)

    if existing_lessons:
        lessons = read_lesson_meta(existing_lessons)
        print("lessons kept as-is")
    else:
        lessons = migrate_lessons()
    articles = migrate_csharp()
    migrate_tasks_and_answers()
    migrate_zig_extras()
    write_data(lessons, articles)
    print(f"lessons={len(lessons)} csharp={len(articles)} tasks/answers={len(lessons)}")


if __name__ == "__main__":
    main()

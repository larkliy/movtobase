import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

patterns = [
    r"\bЭто (позволяет|дает|делает|значит|означает|касается|важно)\b",
    r"\bиспользуется\b",
    r"\bприменяется\b",
    r"\bсчитается\b",
    r"\bназывается\b",
    r"\bможно\b",
    r"\bнужно\b",
]

for path in sorted(pathlib.Path("src/content/docs/zig/lessons").glob("*.mdx")):
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    in_code = False
    for number, line in enumerate(lines, 1):
        if line.startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        for pattern in patterns:
            if re.search(pattern, line, re.IGNORECASE):
                print(f"{path.name}:{number}: {line.strip()}")
                break

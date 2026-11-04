import pathlib
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

BANNED = [
    "важно отметить",
    "стоит подчеркнуть",
    "в заключение",
    "ключевой аспект",
    "давайте рассмотрим",
    "в этом разделе мы",
    "не только",
    "предоставляет широкие возможности",
    "играет важную роль",
    "прикол",
    "в чём",
    "в чем",
]

for folder in ["src/content/tasks", "src/content/answers"]:
    print("==", folder)
    for path in sorted(pathlib.Path(folder).glob("*.md")):
        text = path.read_text(encoding="utf-8")
        low = text.lower()
        issues = [f"BANNED:{word}" for word in BANNED if word in low]
        if "—" in text:
            issues.append(f"emdash:{text.count('—')}")
        if "–" in text:
            issues.append(f"endash:{text.count('–')}")
        if re.search(r"\bвы\b", low):
            issues.append("vy")
        if issues:
            print(path.name, "|", ", ".join(issues))

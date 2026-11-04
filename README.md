# movtobase (Astro + Starlight)

Новая версия сайта: без PDF, с прогрессом, задачами внутри уроков и поиском.

## Команды

```bash
npm install
npm run migrate   # обновить контент из C:\Users\heller\Desktop\movtobase-site\docs
npm run dev       # http://localhost:4321/movtobase/
npm run build     # dist/
```

## Структура

- `src/content/docs/zig/lessons` — уроки Zig
- `src/content/docs/csharp` — разборы C#
- `src/content/tasks` и `src/content/answers` — задачи и решения
- `src/pages/index.astro` — главная
- `src/pages/zig/index.astro` — программа курса Zig
- `src/pages/csharp/index.astro` — программа C#
- `src/pages/practice.astro` — все задачи
- `src/styles/custom.css` — тема и дизайн

## Деплой

GitHub Actions собирает сайт и публикует `dist` на GitHub Pages. База сайта: `/movtobase/`.

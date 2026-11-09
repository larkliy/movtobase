import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { csharpArticles, siteBase, zigLessons } from './src/data/courses.ts';
import { config } from './src/data/config.ts'
const base = siteBase;

const zigItems = [
  { label: 'Обзор курса', link: '/zig/' },
  { label: 'Установка и настройка', link: '/zig/setup/' },
  { label: 'Шпаргалка', link: '/zig/cheatsheet/' },
  { label: 'Что изменилось в 0.17.0', link: '/zig/migration-017/' },
  {
    label: 'Часть I. База',
    items: zigLessons
      .filter((lesson) => lesson.part === 1)
      .map((lesson) => ({
        label: `${lesson.number}. ${lesson.title}`,
        link: `/zig/lessons/${lesson.slug}/`,
      })),
  },
  {
    label: 'Часть II. Язык и память',
    collapsed: true,
    items: zigLessons
      .filter((lesson) => lesson.part === 2)
      .map((lesson) => ({
        label: `${lesson.number}. ${lesson.title}`,
        link: `/zig/lessons/${lesson.slug}/`,
      })),
  },
  {
    label: 'Часть III. Системное программирование',
    collapsed: true,
    items: zigLessons
      .filter((lesson) => lesson.part === 3)
      .map((lesson) => ({
        label: `${lesson.number}. ${lesson.title}`,
        link: `/zig/lessons/${lesson.slug}/`,
      })),
  },
];

const csharpItems = [
  { label: 'Обзор серии', link: '/csharp/' },
  ...csharpArticles.map((article) => ({
    label: `${String(article.number).padStart(2, '0')}. ${article.title}`,
    link: `/csharp/${article.slug}/`,
  })),
];

export default defineConfig({
  site: 'https://larkliy.github.io',
  base,
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'movtobase',
      description:
        'База знаний по системному программированию: C# Low Level + Zero Allocations и Zig 0.17.0 с нуля.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'Русский', lang: 'ru' },
      },
      favicon: '/favicon.svg',
      social: [
        { icon: 'github', label: 'GitHub', href: `https://github.com/${config.github}` },
      ],
      customCss: ['./src/styles/custom.css'],
      components: {
        Header: './src/components/Header.astro',
        Sidebar: './src/components/Sidebar.astro',
        PageTitle: './src/components/PageTitle.astro',
        Footer: './src/components/Footer.astro',
      },
      sidebar: [
        { label: 'Zig 0.17.0', items: zigItems },
        { label: 'C# Low Level + Zero Allocations', items: csharpItems },
        { label: 'Практика', link: '/practice/' },
      ],
      expressiveCode: {
        themes: ['github-dark-default', 'github-light-default'],
      },
      head: [
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0a0a0f' } },
        {
          tag: 'script',
          attrs: {
            async: true,
            src: 'https://www.googletagmanager.com/gtm.js?id=GTM-NF45KN38',
          },
        },
        {
          tag: 'script',
          content: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`,
        },
      ],
    }),
  ],
});

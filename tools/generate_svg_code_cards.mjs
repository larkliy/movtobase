import fs from 'node:fs';
import path from 'node:path';
import { createHighlighter } from 'shiki';

const snippets = [
  // 01-gc-iznutri
  {
    id: 'code-gc-alloc-context',
    file: 'D:/runtime/src/coreclr/gc/gcinterface.h',
    start: 198,
    end: 213,
    lang: 'cpp',
    title: 'src/coreclr/gc/gcinterface.h:198-213 — Fast path аллокации: gc_alloc_context',
  },
  {
    id: 'code-gc-regions-invariants',
    file: 'D:/runtime/src/coreclr/gc/gcpriv.h',
    start: 135,
    end: 153,
    lang: 'cpp',
    title: 'src/coreclr/gc/gcpriv.h:135-153 — Инварианты регионов в CoreCLR GC',
  },
  {
    id: 'code-gc-card-table',
    file: 'D:/runtime/src/coreclr/gc/card_table.cpp',
    start: 53,
    end: 66,
    lang: 'cpp',
    title: 'src/coreclr/gc/card_table.cpp:53-66 — Card Table: card_bundle_set для барьера записи',
  },
  {
    id: 'code-gc-allocate-uninitialized',
    file: 'D:/runtime/src/coreclr/System.Private.CoreLib/src/System/GC.CoreCLR.cs',
    start: 831,
    end: 855,
    lang: 'csharp',
    title: 'src/coreclr/System.Private.CoreLib/src/System/GC.CoreCLR.cs:831-855 — AllocateUninitializedArray',
  },

  // 02-span-i-memory
  {
    id: 'code-span-struct-def',
    file: 'D:/runtime/src/libraries/System.Private.CoreLib/src/System/Span.cs',
    start: 25,
    end: 45,
    lang: 'csharp',
    title: 'src/libraries/System.Private.CoreLib/src/System/Span.cs:25-45 — Анатомия ref struct Span<T>',
  },
  {
    id: 'code-memory-struct-def',
    file: 'D:/runtime/src/libraries/System.Private.CoreLib/src/System/Memory.cs',
    start: 20,
    end: 43,
    lang: 'csharp',
    title: 'src/libraries/System.Private.CoreLib/src/System/Memory.cs:20-43 — Структура Memory<T> для async-контекстов',
  },
  {
    id: 'code-memory-manager',
    file: 'D:/runtime/src/libraries/System.Private.CoreLib/src/System/Buffers/MemoryManager.cs',
    start: 15,
    end: 35,
    lang: 'csharp',
    title: 'src/libraries/System.Private.CoreLib/src/System/Buffers/MemoryManager.cs:15-35 — Базовый класс MemoryManager<T>',
  },

  // 03-unsafe-i-memorymarshal
  {
    id: 'code-unsafe-aspointer',
    file: 'D:/runtime/src/libraries/System.Private.CoreLib/src/System/Runtime/CompilerServices/Unsafe.cs',
    start: 26,
    end: 42,
    lang: 'csharp',
    title: 'src/libraries/System.Private.CoreLib/src/System/Runtime/CompilerServices/Unsafe.cs:26-42 — JIT Intrinsic: AsPointer',
  },
  {
    id: 'code-memorymarshal-cast',
    file: 'D:/runtime/src/libraries/System.Private.CoreLib/src/System/Runtime/InteropServices/MemoryMarshal.cs',
    start: 46,
    end: 74,
    lang: 'csharp',
    title: 'src/libraries/System.Private.CoreLib/src/System/Runtime/InteropServices/MemoryMarshal.cs:46-74 — MemoryMarshal.Cast',
  },
  {
    id: 'code-memorymarshal-getarraydata',
    file: 'D:/runtime/src/libraries/System.Private.CoreLib/src/System/Runtime/InteropServices/MemoryMarshal.cs',
    start: 116,
    end: 126,
    lang: 'csharp',
    title: 'src/libraries/System.Private.CoreLib/src/System/Runtime/InteropServices/MemoryMarshal.cs:116-126 — GetArrayDataReference',
  },

  // 04-struktura-nativeaot
  {
    id: 'code-nativeaot-methodtable',
    file: 'D:/runtime/src/coreclr/nativeaot/Common/src/Internal/Runtime/MethodTable.cs',
    start: 125,
    end: 148,
    lang: 'csharp',
    title: 'src/coreclr/nativeaot/Common/src/Internal/Runtime/MethodTable.cs:125-148 — MethodTable в NativeAOT',
  },
  {
    id: 'code-nativeaot-bootstrap-main',
    file: 'D:/runtime/src/coreclr/nativeaot/Bootstrap/main.cpp',
    start: 20,
    end: 46,
    lang: 'cpp',
    title: 'src/coreclr/nativeaot/Bootstrap/main.cpp:20-46 — Точка входа main() и запуск CoreLib',
  },

  // 05-bezallokacionnyy-tcp-server
  {
    id: 'code-saea-struct',
    file: 'D:/runtime/src/libraries/System.Net.Sockets/src/System/Net/Sockets/SocketAsyncEventArgs.cs',
    start: 25,
    end: 55,
    lang: 'csharp',
    title: 'src/libraries/System.Net.Sockets/src/System/Net/Sockets/SocketAsyncEventArgs.cs:25-55 — SocketAsyncEventArgs',
  },

  // 06-system-io-pipelines
  {
    id: 'code-pipe-buffersegment',
    file: 'D:/runtime/src/libraries/System.IO.Pipelines/src/System/IO/Pipelines/BufferSegment.cs',
    start: 10,
    end: 32,
    lang: 'csharp',
    title: 'src/libraries/System.IO.Pipelines/src/System/IO/Pipelines/BufferSegment.cs:10-32 — BufferSegment в Pipelines',
  },
  {
    id: 'code-pipe-unconsumed',
    file: 'D:/runtime/src/libraries/System.IO.Pipelines/src/System/IO/Pipelines/Pipe.cs',
    start: 58,
    end: 88,
    lang: 'csharp',
    title: 'src/libraries/System.IO.Pipelines/src/System/IO/Pipelines/Pipe.cs:58-88 — Указатели голов и хвостов в Pipe',
  },
];

function escapeXml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function main() {
  const highlighter = await createHighlighter({
    themes: ['github-dark-default'],
    langs: ['csharp', 'cpp'],
  });

  const outDir = 'C:/Users/heller/Desktop/movtobase-astro/public/images/csharp';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const item of snippets) {
    if (!fs.existsSync(item.file)) {
      console.warn('File not found:', item.file);
      continue;
    }
    const lines = fs.readFileSync(item.file, 'utf8').split('\n');
    const startIdx = Math.max(0, item.start - 1);
    const endIdx = Math.min(lines.length, item.end);
    const selectedLines = lines.slice(startIdx, endIdx);
    const rawCode = selectedLines.join('\n');

    const tokenLines = highlighter.codeToTokensBase(rawCode, {
      lang: item.lang,
      theme: 'github-dark-default',
    });

    const lineHeight = 22;
    const paddingY = 20;
    const headerHeight = 42;
    const totalHeight = headerHeight + paddingY * 2 + tokenLines.length * lineHeight;
    const width = 880;
    const lineNumWidth = 65;

    let svgLines = [];
    tokenLines.forEach((lineTokens, i) => {
      const lineNum = item.start + i;
      const y = headerHeight + paddingY + i * lineHeight + 16;
      
      // Line number
      svgLines.push(
        `<text x="${lineNumWidth - 12}" y="${y}" font-family="'JetBrains Mono', Consolas, monospace" font-size="12.5" fill="#484f58" text-anchor="end">${lineNum}</text>`
      );

      // Line content
      const tspans = lineTokens.map(tok => {
        const fill = tok.color || '#c9d1d9';
        const content = escapeXml(tok.content);
        return `<tspan fill="${fill}">${content}</tspan>`;
      }).join('');

      svgLines.push(
        `<text x="${lineNumWidth + 14}" y="${y}" font-family="'JetBrains Mono', 'Cascadia Code', Consolas, monospace" font-size="13" xml:space="preserve">${tspans}</text>`
      );
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${totalHeight}" width="100%" height="100%">
  <defs>
    <filter id="shadow-${item.id}" x="-3%" y="-3%" width="106%" height="108%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>

  <!-- Container -->
  <rect x="2" y="2" width="${width - 4}" height="${totalHeight - 4}" rx="10" fill="#0d1117" stroke="#30363d" stroke-width="1.2" filter="url(#shadow-${item.id})"/>

  <!-- Title bar -->
  <path d="M 3,2 L ${width - 3},2 Q ${width - 2},2 ${width - 2},12 L ${width - 2},${headerHeight} L 2,${headerHeight} L 2,12 Q 2,2 3,2 Z" fill="#161b22"/>
  <line x1="2" y1="${headerHeight}" x2="${width - 2}" y2="${headerHeight}" stroke="#21262d" stroke-width="1"/>

  <!-- Window dots -->
  <circle cx="20" cy="${headerHeight / 2}" r="6" fill="#ff5f56"/>
  <circle cx="38" cy="${headerHeight / 2}" r="6" fill="#ffbd2e"/>
  <circle cx="56" cy="${headerHeight / 2}" r="6" fill="#27c93f"/>

  <!-- Title / Path -->
  <text x="80" y="${headerHeight / 2 + 4.5}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12.5" font-weight="600" fill="#8b949e">${escapeXml(item.title)}</text>

  <!-- Line numbers separator -->
  <line x1="${lineNumWidth}" y1="${headerHeight}" x2="${lineNumWidth}" y2="${totalHeight - 2}" stroke="#21262d" stroke-width="1"/>

  <!-- Code content -->
  ${svgLines.join('\n  ')}
</svg>`;

    fs.writeFileSync(path.join(outDir, `${item.id}.svg`), svg, 'utf8');
    console.log(`Generated ${item.id}.svg`);
  }
}

main().catch(console.error);

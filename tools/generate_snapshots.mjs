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
    title: 'src/coreclr/gc/gcinterface.h:198-213 — Fast path: gc_alloc_context',
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
    title: 'src/coreclr/gc/card_table.cpp:53-66 — Card Table: card_bundle_set',
  },
  {
    id: 'code-gc-allocate-uninitialized',
    file: 'D:/runtime/src/coreclr/System.Private.CoreLib/src/System/GC.CoreCLR.cs',
    start: 831,
    end: 855,
    lang: 'csharp',
    title: 'src/coreclr/System.Private.CoreLib/src/System/GC.CoreCLR.cs:831-855 — AllocateUninitializedArray и POH',
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
    title: 'src/libraries/System.Private.CoreLib/src/System/Buffers/MemoryManager.cs:15-35 — Базовый MemoryManager<T>',
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
    title: 'src/coreclr/nativeaot/Bootstrap/main.cpp:20-46 — Точка входа main() и вызов CoreLib',
  },

  // 05-bezallokacionnyy-tcp-server
  {
    id: 'code-saea-struct',
    file: 'D:/runtime/src/libraries/System.Net.Sockets/src/System/Net/Sockets/SocketAsyncEventArgs.cs',
    start: 25,
    end: 55,
    lang: 'csharp',
    title: 'src/libraries/System.Net.Sockets/src/System/Net/Sockets/SocketAsyncEventArgs.cs:25-55 — Поля SAEA',
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

async function run() {
  const highlighter = await createHighlighter({
    themes: ['github-dark-default'],
    langs: ['csharp', 'cpp'],
  });

  const cardsHtml = [];

  for (const item of snippets) {
    if (!fs.existsSync(item.file)) {
      console.error('File not found:', item.file);
      continue;
    }
    const lines = fs.readFileSync(item.file, 'utf8').split('\n');
    const startIdx = Math.max(0, item.start - 1);
    const endIdx = Math.min(lines.length, item.end);
    const selectedLines = lines.slice(startIdx, endIdx);

    const rawCode = selectedLines.join('\n');
    const codeHtml = highlighter.codeToHtml(rawCode, {
      lang: item.lang,
      theme: 'github-dark-default',
    });

    cardsHtml.push({
      id: item.id,
      title: item.title,
      codeHtml,
      start: item.start,
      linesCount: selectedLines.length,
      lines: selectedLines,
      lang: item.lang
    });
  }

  const htmlDoc = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    background: #090c10;
    color: #c9d1d9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    margin: 0;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .card-container {
    width: 860px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 10px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
    overflow: hidden;
    margin-bottom: 24px;
  }
  .card-header {
    background: #161b22;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid #21262d;
    gap: 8px;
  }
  .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
  .dot-red { background: #ff5f56; }
  .dot-yellow { background: #ffbd2e; }
  .dot-green { background: #27c93f; }
  .card-title {
    color: #8b949e;
    font-size: 13px;
    font-family: "JetBrains Mono", Consolas, monospace;
    margin-left: 10px;
    font-weight: 500;
  }
  .card-body {
    display: flex;
    background: #0d1117;
    font-family: "JetBrains Mono", Consolas, "Courier New", monospace;
    font-size: 13.5px;
    line-height: 1.6;
    overflow-x: auto;
  }
  .line-numbers {
    padding: 16px 12px 16px 16px;
    color: #484f58;
    text-align: right;
    user-select: none;
    border-right: 1px solid #21262d;
    font-size: 12.5px;
  }
  .code-content {
    flex: 1;
    padding: 16px 20px;
    overflow-x: auto;
  }
  .code-content pre {
    margin: 0 !important;
    padding: 0 !important;
    background: transparent !important;
  }
  .code-content code {
    font-family: inherit !important;
  }
</style>
</head>
<body>
  ${cardsHtml.map((c) => {
    const lineNums = Array.from({ length: c.linesCount }, (_, i) => c.start + i).join('<br>');
    return `
    <div id="${c.id}" class="card-container">
      <div class="card-header">
        <span class="dot dot-red"></span>
        <span class="dot dot-yellow"></span>
        <span class="dot dot-green"></span>
        <span class="card-title">${c.title}</span>
      </div>
      <div class="card-body">
        <div class="line-numbers">${lineNums}</div>
        <div class="code-content">${c.codeHtml}</div>
      </div>
    </div>
    `;
  }).join('\n')}

  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('card');
    if (targetId) {
      document.querySelectorAll('.card-container').forEach(el => {
        if (el.id !== targetId) {
          el.style.display = 'none';
        } else {
          el.style.display = 'block';
          el.style.margin = '0 auto';
        }
      });
    }
  </script>
</body>
</html>`;

  fs.writeFileSync('C:/Users/heller/Desktop/movtobase-astro/tools/code_snapshots_preview.html', htmlDoc, 'utf8');
  console.log(`Generated HTML with ${cardsHtml.length} code cards.`);
}

run().catch(console.error);

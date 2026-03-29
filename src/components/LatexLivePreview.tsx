import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'

/**
 * Converts LaTeX source to a Markdown-compatible string for instant preview.
 * Uses react-markdown + rehype-katex for safe rendering (no innerHTML).
 */
function latexToMarkdown(source: string): string {
  const docMatch = source.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/)
  if (!docMatch) return '*Add \\\\begin\\{document\\}...\\\\end\\{document\\} to see preview*'

  let content = docMatch[1]

  const title = source.match(/\\title\{([^}]*)\}/)?.[1] ?? ''
  const author = source.match(/\\author\{([^}]*)\}/)?.[1] ?? ''
  const date = source.match(/\\date\{([^}]*)\}/)?.[1] ?? ''

  let header = ''
  if (title) {
    header += `# ${title}\n\n`
    if (author) header += `*${author}*\n\n`
    const dateStr = date === '\\today'
      ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : date
    if (dateStr) header += `*${dateStr}*\n\n`
  }

  content = content.replace(/\\maketitle/g, '')
  content = content.replace(/\\section\*?\{([^}]*)\}/g, '\n## $1\n')
  content = content.replace(/\\subsection\*?\{([^}]*)\}/g, '\n### $1\n')
  content = content.replace(/\\subsubsection\*?\{([^}]*)\}/g, '\n#### $1\n')
  content = content.replace(/\\textbf\{([^}]*)\}/g, '**$1**')
  content = content.replace(/\\textit\{([^}]*)\}/g, '*$1*')
  content = content.replace(/\\emph\{([^}]*)\}/g, '*$1*')
  content = content.replace(/\\underline\{([^}]*)\}/g, '$1')

  // Keep math as-is (react-markdown + remark-math handles $...$ and $$...$$)
  // Convert \[...\] to $$...$$
  content = content.replace(/\\\[([\s\S]*?)\\\]/g, '\n$$\n$1\n$$\n')
  // Convert \(...\) to $...$
  content = content.replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')

  // Lists
  content = content.replace(/\\begin\{itemize\}/g, '')
  content = content.replace(/\\end\{itemize\}/g, '')
  content = content.replace(/\\begin\{enumerate\}/g, '')
  content = content.replace(/\\end\{enumerate\}/g, '')
  content = content.replace(/\\item\s*/g, '- ')

  // Remove remaining LaTeX commands but keep their content
  content = content.replace(/\\begin\{[^}]*\}/g, '')
  content = content.replace(/\\end\{[^}]*\}/g, '')
  content = content.replace(/\\usepackage(\[[^\]]*\])?\{[^}]*\}/g, '')
  content = content.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
  content = content.replace(/\\(?![$\\])[a-zA-Z]+/g, '')

  return header + content.trim()
}

export function LatexLivePreview({ source }: { source: string }) {
  const markdown = useMemo(() => latexToMarkdown(source), [source])

  return (
    <div className="latex-live-preview">
      <ReactMarkdown
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        remarkPlugins={[remarkMath]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}

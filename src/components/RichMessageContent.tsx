import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import {
  BrainCircuit,
  Code2,
  FileAudio,
  FileImage,
  FileText,
  Film,
  LockKeyhole,
  Sparkles,
} from 'lucide-react'
import type { OpenRouterReasoningDetail } from '../lib/openrouter'
import { CodeBlock } from './CodeBlock'

const LANG_LABELS: Record<string, string> = {
  python: 'Python', py: 'Python',
  javascript: 'JavaScript', js: 'JavaScript', jsx: 'JSX',
  typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TSX',
  cpp: 'C++', 'c++': 'C++', cxx: 'C++', cc: 'C++',
  c: 'C',
  csharp: 'C#', cs: 'C#', 'c#': 'C#',
  java: 'Java',
  kotlin: 'Kotlin', kt: 'Kotlin',
  swift: 'Swift',
  go: 'Go', golang: 'Go',
  rust: 'Rust', rs: 'Rust',
  ruby: 'Ruby', rb: 'Ruby',
  php: 'PHP',
  scala: 'Scala',
  haskell: 'Haskell', hs: 'Haskell',
  elixir: 'Elixir', ex: 'Elixir', exs: 'Elixir',
  erlang: 'Erlang',
  clojure: 'Clojure', clj: 'Clojure',
  ocaml: 'OCaml', ml: 'OCaml',
  fsharp: 'F#', fs: 'F#',
  lua: 'Lua',
  perl: 'Perl', pl: 'Perl',
  r: 'R',
  matlab: 'MATLAB',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS', sass: 'SCSS',
  less: 'Less',
  xml: 'XML',
  svg: 'SVG',
  json: 'JSON', jsonc: 'JSON',
  yaml: 'YAML', yml: 'YAML',
  toml: 'TOML',
  markdown: 'Markdown', md: 'Markdown',
  bash: 'Bash', sh: 'Bash', shell: 'Bash', zsh: 'Bash', fish: 'Bash',
  powershell: 'PowerShell', ps1: 'PowerShell', pwsh: 'PowerShell',
  sql: 'SQL', mysql: 'MySQL', postgresql: 'PostgreSQL', psql: 'PostgreSQL', sqlite: 'SQLite',
  graphql: 'GraphQL', gql: 'GraphQL',
  vue: 'Vue',
  svelte: 'Svelte',
  dockerfile: 'Dockerfile', docker: 'Dockerfile',
  terraform: 'Terraform', tf: 'Terraform', hcl: 'HCL',
  nginx: 'Nginx',
  apache: 'Apache',
  protobuf: 'Protobuf', proto: 'Protobuf',
  solidity: 'Solidity', sol: 'Solidity',
  assembly: 'Assembly', asm: 'Assembly', nasm: 'Assembly',
  wasm: 'WebAssembly', wat: 'WebAssembly',
  vb: 'VB.NET', vbnet: 'VB.NET',
  diff: 'Diff',
  makefile: 'Makefile', make: 'Makefile',
  regex: 'Regex',
  latex: 'LaTeX', tex: 'LaTeX',
  ini: 'INI', cfg: 'INI', conf: 'Config',
  env: '.env',
}

type RichMessageAttachmentKind = 'image' | 'pdf' | 'audio' | 'video' | 'code'

type RichMessageAttachment = {
  id: string
  kind: RichMessageAttachmentKind
  name: string
  previewUrl?: string
  summary: string
}

type RichMessageAudio = {
  src: string | null
  transcript: string | null
}

type RichMessageContentProps = {
  attachments?: RichMessageAttachment[]
  audio?: RichMessageAudio | null
  images?: string[]
  isStreaming?: boolean
  reasoning?: string
  reasoningDetails?: OpenRouterReasoningDetail[]
  refusal?: string
  text?: string
}

const supportedLatexBlockEnvironments = new Set([
  'align',
  'align*',
  'aligned',
  'array',
  'Bmatrix',
  'bmatrix',
  'cases',
  'CD',
  'equation',
  'equation*',
  'gather',
  'gather*',
  'matrix',
  'multline',
  'multline*',
  'pmatrix',
  'smallmatrix',
  'split',
  'Vmatrix',
  'vmatrix',
])

const codeOrInlineCodePattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g

function normalizeLatexSegment(segment: string) {
  const withNormalizedDelimiters = segment
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, content: string) => {
      const trimmed = content.trim()

      return trimmed ? `\n$$\n${trimmed}\n$$\n` : ''
    })
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, content: string) => {
      const trimmed = content.trim()

      return trimmed ? `$${trimmed}$` : ''
    })

  return withNormalizedDelimiters
    .split(/(\$\$[\s\S]*?\$\$)/g)
    .map((part) => {
      if (part.startsWith('$$') && part.endsWith('$$')) {
        return part
      }

      return part.replace(
        /(^|\n)(\s*)(\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\4\})(\s*)(?=\n|$)/g,
        (
          match,
          lineStart: string,
          leadingWhitespace: string,
          environmentBlock: string,
          environmentName: string,
        ) => {
          if (!supportedLatexBlockEnvironments.has(environmentName)) {
            return match
          }

          const trimmedBlock = environmentBlock.trim()

          return `${lineStart}${leadingWhitespace}$$\n${trimmedBlock}\n$$`
        },
      )
    })
    .join('')
}

function normalizeMarkdownMath(content: string) {
  return content
    .split(codeOrInlineCodePattern)
    .map((segment, index) => (index % 2 === 0 ? normalizeLatexSegment(segment) : segment))
    .join('')
}

function MarkdownBlock({ children }: { children: string }) {
  const normalizedChildren = normalizeMarkdownMath(children)

  return (
    <ReactMarkdown
      components={{
        a: ({ children: linkChildren, href }) => (
          <a href={href} rel="noreferrer" target="_blank">
            {linkChildren}
          </a>
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pre: ({ node, children: preChildren }: any) => {
          const codeNode = node?.children?.[0]
          const classNames: string[] = (codeNode?.properties?.className as string[]) ?? []
          const langId = classNames.find((c: string) => c.startsWith('language-'))?.replace('language-', '') ?? ''
          const label = LANG_LABELS[langId.toLowerCase()] ?? (langId && langId !== 'plaintext' && langId !== 'text' ? langId : '')
          // Raw code text from the AST for execution
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawCode: string = (codeNode?.children?.[0] as any)?.value ?? ''
          return (
            <CodeBlock code={rawCode} langId={langId} label={label}>
              {preChildren}
            </CodeBlock>
          )
        },
        code: ({ children: codeChildren, className, ...props }) => {
          const isInline = !className

          return (
            <code
              className={isInline ? 'workspace-inline-code' : className}
              {...props}
            >
              {codeChildren}
            </code>
          )
        },
      }}
      rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
      remarkPlugins={[remarkGfm, remarkMath]}
    >
      {normalizedChildren}
    </ReactMarkdown>
  )
}

function getAttachmentIcon(kind: RichMessageAttachmentKind) {
  switch (kind) {
    case 'image':
      return FileImage
    case 'pdf':
      return FileText
    case 'audio':
      return FileAudio
    case 'video':
      return Film
    case 'code':
      return Code2
    default:
      return FileText
  }
}

function getReasoningNode(detail: OpenRouterReasoningDetail): ReactNode {
  if (detail.type === 'reasoning.summary') {
    return (
      <article className="workspace-thinking-block" key={detail.id ?? detail.summary}>
        <div className="workspace-thinking-label">
          <Sparkles size={14} />
          <span>Summary</span>
        </div>
        <div className="workspace-markdown">
          <MarkdownBlock>{detail.summary}</MarkdownBlock>
        </div>
      </article>
    )
  }

  if (detail.type === 'reasoning.text') {
    const value = detail.text?.trim()

    if (!value) {
      return null
    }

    return (
      <article className="workspace-thinking-block" key={detail.id ?? value}>
        <div className="workspace-thinking-label">
          <BrainCircuit size={14} />
          <span>Trace</span>
        </div>
        <div className="workspace-markdown">
          <MarkdownBlock>{value}</MarkdownBlock>
        </div>
      </article>
    )
  }

  return (
    <article className="workspace-thinking-block" key={detail.id ?? detail.data}>
      <div className="workspace-thinking-label">
        <LockKeyhole size={14} />
        <span>Encrypted</span>
      </div>
      <p className="workspace-thinking-note">
        This provider returned encrypted reasoning details. Argue keeps them in the
        conversation for follow-up turns, but they cannot be displayed in plaintext.
      </p>
    </article>
  )
}

function RichMessageContent({
  attachments = [],
  audio = null,
  images = [],
  isStreaming = false,
  reasoning = '',
  reasoningDetails = [],
  refusal = '',
  text = '',
}: RichMessageContentProps) {
  const visibleText = text.trim()
  const visibleReasoning = reasoning.trim()
  const visibleRefusal = refusal.trim()
  const showThinking = Boolean(visibleReasoning || reasoningDetails.length > 0 || isStreaming)
  const hasRenderableContent =
    attachments.length > 0 ||
    Boolean(visibleText) ||
    images.length > 0 ||
    Boolean(audio?.src || audio?.transcript) ||
    Boolean(visibleRefusal) ||
    Boolean(visibleReasoning) ||
    reasoningDetails.length > 0

  return (
    <div className="workspace-message-content">
      {isStreaming && !hasRenderableContent ? (
        <p className="workspace-thinking-note">Thinking</p>
      ) : null}

      {attachments.length > 0 ? (
        <div className="workspace-attachment-list">
          {attachments.map((attachment) => {
            const Icon = getAttachmentIcon(attachment.kind)

            return (
              <article className="workspace-attachment-card" key={attachment.id}>
                {attachment.kind === 'image' && attachment.previewUrl ? (
                  <img
                    alt={attachment.name}
                    className="workspace-attachment-preview"
                    loading="lazy"
                    src={attachment.previewUrl}
                  />
                ) : (
                  <span className="workspace-attachment-icon">
                    <Icon size={16} />
                  </span>
                )}
                <div>
                  <strong>{attachment.name}</strong>
                  <p>{attachment.summary}</p>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      {showThinking ? (
        <details className={`workspace-thinking${isStreaming ? ' workspace-thinking-live' : ''}`}>
          <summary>
            <span className="workspace-thinking-summary-main">
              <span className="workspace-thinking-pulse" aria-hidden="true" />
              <span>Thinking</span>
            </span>
          </summary>

          {visibleReasoning || reasoningDetails.length > 0 ? (
            <div className="workspace-thinking-stack">
              {visibleReasoning ? (
                <article className="workspace-thinking-block">
                  <div className="workspace-thinking-label">
                    <Sparkles size={14} />
                    <span>Model reasoning</span>
                  </div>
                  <div className="workspace-markdown">
                    <MarkdownBlock>{visibleReasoning}</MarkdownBlock>
                  </div>
                </article>
              ) : null}

              {reasoningDetails.map((detail) => getReasoningNode(detail))}
            </div>
          ) : null}
        </details>
      ) : null}

      {visibleText ? (
        <div className="workspace-markdown">
          <MarkdownBlock>{visibleText}</MarkdownBlock>
        </div>
      ) : null}

      {images.length > 0 ? (
        <div className="workspace-generated-image-grid">
          {images.map((imageUrl, index) => (
            <img
              alt={`Generated output ${index + 1}`}
              className="workspace-generated-image"
              key={`${imageUrl}-${index}`}
              loading="lazy"
              src={imageUrl}
            />
          ))}
        </div>
      ) : null}

      {audio?.src ? (
        <div className="workspace-audio-card">
          <audio className="workspace-audio-player" controls src={audio.src} />
          {audio.transcript ? <p>{audio.transcript}</p> : null}
        </div>
      ) : null}

      {!audio?.src && audio?.transcript ? (
        <div className="workspace-audio-card">
          <p>{audio.transcript}</p>
        </div>
      ) : null}

      {visibleRefusal ? (
        <div className="workspace-refusal-card">
          <div className="workspace-thinking-label">
            <LockKeyhole size={14} />
            <span>Refusal</span>
          </div>
          <div className="workspace-markdown">
            <MarkdownBlock>{visibleRefusal}</MarkdownBlock>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export { RichMessageContent, MarkdownBlock }
export type { RichMessageAttachment, RichMessageAudio, RichMessageAttachmentKind }

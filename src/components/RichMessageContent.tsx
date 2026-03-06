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

type ReasoningBreakdown = {
  encryptedCount: number
  summaryCount: number
  traceCount: number
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
        (match, lineStart: string, leadingWhitespace: string, environmentBlock: string, environmentName: string) => {
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

function getReasoningBreakdown(
  reasoning: string,
  reasoningDetails: OpenRouterReasoningDetail[],
): ReasoningBreakdown {
  return reasoningDetails.reduce<ReasoningBreakdown>(
    (counts, detail) => {
      if (detail.type === 'reasoning.summary') {
        counts.summaryCount += 1
        return counts
      }

      if (detail.type === 'reasoning.text') {
        counts.traceCount += 1
        return counts
      }

      counts.encryptedCount += 1
      return counts
    },
    {
      encryptedCount: 0,
      summaryCount: 0,
      traceCount: reasoning.trim() ? 1 : 0,
    },
  )
}

function getThinkingSummaryLabel(breakdown: ReasoningBreakdown) {
  const parts: string[] = []

  if (breakdown.summaryCount > 0) {
    parts.push(
      breakdown.summaryCount === 1
        ? '1 summary'
        : `${breakdown.summaryCount} summaries`,
    )
  }

  if (breakdown.traceCount > 0) {
    parts.push(
      breakdown.traceCount === 1 ? '1 trace' : `${breakdown.traceCount} traces`,
    )
  }

  if (breakdown.encryptedCount > 0) {
    parts.push(
      breakdown.encryptedCount === 1
        ? '1 encrypted block'
        : `${breakdown.encryptedCount} encrypted blocks`,
    )
  }

  return parts.join(' • ')
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
  const reasoningBreakdown = getReasoningBreakdown(visibleReasoning, reasoningDetails)
  const thinkingSummaryLabel = getThinkingSummaryLabel(reasoningBreakdown)
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
        <p className="workspace-thinking-note">Waiting for live thinking…</p>
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

      {visibleReasoning || reasoningDetails.length > 0 ? (
        <details className="workspace-thinking">
          <summary>
            <span className="workspace-thinking-summary-main">
              <BrainCircuit size={16} />
              <span>Thinking</span>
            </span>
            <span className="workspace-thinking-summary-meta">
              {thinkingSummaryLabel ? (
                <span className="workspace-thinking-pill">{thinkingSummaryLabel}</span>
              ) : null}
              <span className="workspace-thinking-toggle-copy">
                {isStreaming ? 'Streaming live' : 'Click to expand'}
              </span>
            </span>
          </summary>

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

export { RichMessageContent }
export type { RichMessageAttachment, RichMessageAudio, RichMessageAttachmentKind }

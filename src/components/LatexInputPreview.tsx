import { useMemo } from 'react'
import { MarkdownBlock } from './RichMessageContent'

const LATEX_PATTERN = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/

function LatexInputPreview({ text }: { text: string }) {
  const hasLatex = useMemo(() => LATEX_PATTERN.test(text), [text])

  if (!hasLatex) {
    return null
  }

  return (
    <div className="prompt-latex-preview">
      <MarkdownBlock>{text}</MarkdownBlock>
    </div>
  )
}

export { LatexInputPreview }

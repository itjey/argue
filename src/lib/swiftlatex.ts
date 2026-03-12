const SWIFTLATEX_WORKER_SOURCE_URL = 'https://www.swiftlatex.com/swiftlatexxetex.js'
const SWIFTLATEX_WASM_URL = 'https://www.swiftlatex.com/swiftlatexxetex.wasm'
const SWIFTLATEX_TEXLIVE_ENDPOINT = 'https://texlive2.swiftlatex.com/'
const SWIFTLATEX_WORKER_PATCH_TOKEN = 'var Module={};'
const SWIFTLATEX_MAIN_FILE = 'main.tex'

type SwiftLatexWorkerCommand = 'writefile' | 'mkdir'

type SwiftLatexWorkerInitMessage = {
  result: string
}

type SwiftLatexWorkerAckMessage = {
  cmd: SwiftLatexWorkerCommand
  result: 'ok' | 'failed'
}

type SwiftLatexWorkerCompileMessage = {
  cmd: 'compile'
  log: string
  pdf?: ArrayBuffer
  result: 'ok' | 'failed'
  status: number
}

type SwiftLatexWorkerMessage =
  | SwiftLatexWorkerInitMessage
  | SwiftLatexWorkerAckMessage
  | SwiftLatexWorkerCompileMessage

type LatexCompileResult = {
  log: string
  pdf: ArrayBuffer | null
  status: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isWorkerAckMessage(
  value: unknown,
  command: SwiftLatexWorkerCommand,
): value is SwiftLatexWorkerAckMessage {
  return (
    isRecord(value) &&
    value.cmd === command &&
    (value.result === 'ok' || value.result === 'failed')
  )
}

function isWorkerCompileMessage(value: unknown): value is SwiftLatexWorkerCompileMessage {
  return (
    isRecord(value) &&
    value.cmd === 'compile' &&
    typeof value.log === 'string' &&
    typeof value.status === 'number' &&
    (value.result === 'ok' || value.result === 'failed')
  )
}

function patchWorkerScript(workerSource: string) {
  if (!workerSource.includes(SWIFTLATEX_WORKER_PATCH_TOKEN)) {
    throw new Error('SwiftLaTeX worker format changed unexpectedly.')
  }

  const modulePatch = `var Module={locateFile:function(path){return path.endsWith(".wasm")?${JSON.stringify(SWIFTLATEX_WASM_URL)}:path;}};`

  return workerSource.replace(SWIFTLATEX_WORKER_PATCH_TOKEN, modulePatch)
}

let swiftLatexWorkerBlobUrlPromise: Promise<string> | null = null

async function getSwiftLatexWorkerBlobUrl() {
  if (!swiftLatexWorkerBlobUrlPromise) {
    swiftLatexWorkerBlobUrlPromise = (async () => {
      const response = await fetch(SWIFTLATEX_WORKER_SOURCE_URL)

      if (!response.ok) {
        throw new Error(`Failed to download LaTeX engine (${response.status}).`)
      }

      const workerSource = await response.text()
      const patchedWorkerSource = patchWorkerScript(workerSource)

      return URL.createObjectURL(
        new Blob([patchedWorkerSource], { type: 'application/javascript' }),
      )
    })().catch((error) => {
      swiftLatexWorkerBlobUrlPromise = null
      throw error
    })
  }

  return swiftLatexWorkerBlobUrlPromise
}

function isInitMessage(value: unknown): value is SwiftLatexWorkerInitMessage {
  return isRecord(value) && typeof value.result === 'string' && !('cmd' in value)
}

class SwiftLatexEngine {
  private compileQueue: Promise<unknown> = Promise.resolve()
  private readyWorkerPromise: Promise<Worker> | null = null
  private worker: Worker | null = null

  private async getWorker() {
    if (this.worker) {
      return this.worker
    }

    if (!this.readyWorkerPromise) {
      this.readyWorkerPromise = this.createWorker().catch((error) => {
        if (this.worker) {
          this.worker.terminate()
        }

        this.worker = null
        this.readyWorkerPromise = null
        throw error
      })
    }

    return this.readyWorkerPromise
  }

  private async createWorker() {
    const workerBlobUrl = await getSwiftLatexWorkerBlobUrl()
    const worker = new Worker(workerBlobUrl)

    await new Promise<void>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<SwiftLatexWorkerMessage>) => {
        if (!isInitMessage(event.data)) {
          return
        }

        cleanup()

        if (event.data.result === 'ok') {
          resolve()
        } else {
          reject(new Error('Failed to initialize the XeTeX engine.'))
        }
      }

      const handleError = () => {
        cleanup()
        reject(new Error('Failed to initialize the XeTeX engine.'))
      }

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage)
        worker.removeEventListener('error', handleError)
      }

      worker.addEventListener('message', handleMessage)
      worker.addEventListener('error', handleError)
    })

    worker.postMessage({ cmd: 'settexliveurl', url: SWIFTLATEX_TEXLIVE_ENDPOINT })
    this.worker = worker

    return worker
  }

  private async sendCommandForAck(
    worker: Worker,
    command: { cmd: SwiftLatexWorkerCommand; url: string; src?: string | Uint8Array },
  ) {
    return new Promise<void>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<SwiftLatexWorkerMessage>) => {
        if (!isWorkerAckMessage(event.data, command.cmd)) {
          return
        }

        cleanup()

        if (event.data.result === 'ok') {
          resolve()
        } else {
          reject(new Error(`LaTeX engine failed while handling ${command.cmd}.`))
        }
      }

      const handleError = () => {
        cleanup()
        reject(new Error(`LaTeX engine failed while handling ${command.cmd}.`))
      }

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage)
        worker.removeEventListener('error', handleError)
      }

      worker.addEventListener('message', handleMessage)
      worker.addEventListener('error', handleError)
      worker.postMessage(command)
    })
  }

  private async sendCompileCommand(worker: Worker) {
    return new Promise<LatexCompileResult>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<SwiftLatexWorkerMessage>) => {
        if (!isWorkerCompileMessage(event.data)) {
          return
        }

        cleanup()

        resolve({
          log: event.data.log,
          pdf: event.data.result === 'ok' && event.data.pdf ? event.data.pdf : null,
          status: event.data.status,
        })
      }

      const handleError = () => {
        cleanup()
        reject(new Error('The XeTeX worker crashed during compilation.'))
      }

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage)
        worker.removeEventListener('error', handleError)
      }

      worker.addEventListener('message', handleMessage)
      worker.addEventListener('error', handleError)
      worker.postMessage({ cmd: 'compilelatex' })
    })
  }

  private async compileInternal(source: string) {
    const worker = await this.getWorker()

    worker.postMessage({ cmd: 'flushcache' })
    await this.sendCommandForAck(worker, {
      cmd: 'writefile',
      src: source,
      url: SWIFTLATEX_MAIN_FILE,
    })
    worker.postMessage({ cmd: 'setmainfile', url: SWIFTLATEX_MAIN_FILE })

    return this.sendCompileCommand(worker)
  }

  async compile(source: string) {
    const task = this.compileQueue.then(
      () => this.compileInternal(source),
      () => this.compileInternal(source),
    )

    this.compileQueue = task.then(
      () => undefined,
      () => undefined,
    )

    return task
  }
}

const swiftLatexEngine = new SwiftLatexEngine()

const PREAMBLE_COMMAND_PATTERN =
  /^\s*\\(usepackage|title|author|date|newcommand|renewcommand|providecommand|setlength|geometry|hypersetup|definecolor|newtheorem|lstset|DeclareMathOperator|graphicspath|bibliographystyle|usetikzlibrary|tikzset|setmainfont|setsansfont|setmonofont|setmathfont|defaultfontfeatures|input|includeonly|makeindex|makeglossaries|linespread|bibliography)\b/

function normalizeLatexDocument(source: string) {
  const trimmed = source.trim()

  if (!trimmed) {
    return '\\documentclass{article}\n\\begin{document}\n\\end{document}\n'
  }

  if (/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/.test(trimmed)) {
    if (/\\begin\{document\}/.test(trimmed)) {
      return trimmed
    }

    return `${trimmed}\n\\begin{document}\n\\end{document}\n`
  }

  if (/\\begin\{document\}/.test(trimmed)) {
    return `\\documentclass{article}\n${trimmed}`
  }

  const lines = trimmed.split('\n')
  let lastPreambleLine = -1

  lines.forEach((line, index) => {
    if (PREAMBLE_COMMAND_PATTERN.test(line)) {
      lastPreambleLine = index
    }
  })

  if (lastPreambleLine >= 0) {
    const preamble = lines.slice(0, lastPreambleLine + 1).join('\n').trim()
    const body = lines.slice(lastPreambleLine + 1).join('\n').trim()

    return [
      '\\documentclass{article}',
      preamble,
      '\\begin{document}',
      body,
      '\\end{document}',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return `\\documentclass{article}\n\\begin{document}\n${trimmed}\n\\end{document}\n`
}

async function compileLatexToPdf(source: string) {
  return swiftLatexEngine.compile(normalizeLatexDocument(source))
}

export { compileLatexToPdf, normalizeLatexDocument }
export type { LatexCompileResult }

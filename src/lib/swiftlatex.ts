const BUSYTEX_BASE_PATH = `${import.meta.env.BASE_URL}core/busytex`
const BUSYTEX_PRELOAD_PACKAGE_FILES = [
  'texlive-basic.js',
  'texlive-latex-base_texlive-latex-recommended_texlive-science_texlive-fonts-recommended.js',
  'texlive-latex-extra.js',
] as const
const BUSYTEX_AVAILABLE_PACKAGE_URLS = BUSYTEX_PRELOAD_PACKAGE_FILES.map(
  (fileName) => `${BUSYTEX_BASE_PATH}/${fileName}`,
)
const BUSYTEX_MAIN_FILE = 'main.tex'

type LatexCompileResult = {
  log: string
  pdf: ArrayBuffer | null
  status: number
}

type BusyTexInitMessage = {
  initialized: unknown
}

type BusyTexPrintMessage = {
  print: string
}

type BusyTexExceptionMessage = {
  exception: string
}

type BusyTexCompileLogEntry = {
  aux: string
  cmd: string
  exit_code: number
  log: string
  missfontlog: string
  stderr: string
  stdout: string
  texmflog: string
}

type BusyTexCompileMessage = {
  exit_code: number
  log: string
  logs: BusyTexCompileLogEntry[]
  pdf?: Uint8Array
  synctex?: Uint8Array
}

type BusyTexWorkerMessage =
  | BusyTexInitMessage
  | BusyTexPrintMessage
  | BusyTexExceptionMessage
  | BusyTexCompileMessage

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isBusyTexInitMessage(value: unknown): value is BusyTexInitMessage {
  return isRecord(value) && 'initialized' in value
}

function isBusyTexPrintMessage(value: unknown): value is BusyTexPrintMessage {
  return isRecord(value) && typeof value.print === 'string'
}

function isBusyTexExceptionMessage(value: unknown): value is BusyTexExceptionMessage {
  return isRecord(value) && typeof value.exception === 'string'
}

function isBusyTexCompileMessage(value: unknown): value is BusyTexCompileMessage {
  return (
    isRecord(value) &&
    typeof value.exit_code === 'number' &&
    typeof value.log === 'string' &&
    Array.isArray(value.logs)
  )
}

function toPdfBuffer(data: Uint8Array) {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return copy.buffer
}

function buildCompileLog(message: BusyTexCompileMessage, prints: string[]) {
  const sections = [
    ...prints,
    message.log,
    ...message.logs.flatMap((entry) =>
      [entry.stdout, entry.stderr, entry.log, entry.texmflog, entry.aux, entry.missfontlog]
        .map((section) => section.trim())
        .filter(Boolean),
    ),
  ]

  const log = sections.join('\n\n').trim()

  return log || `Compilation finished with exit code ${message.exit_code}.`
}

class BusyTexEngine {
  private compileQueue: Promise<unknown> = Promise.resolve()
  private readyWorkerPromise: Promise<Worker> | null = null
  private worker: Worker | null = null

  private async getWorker() {
    if (this.worker) {
      return this.worker
    }

    if (!this.readyWorkerPromise) {
      this.readyWorkerPromise = this.createWorker().catch((error) => {
        this.worker?.terminate()
        this.worker = null
        this.readyWorkerPromise = null
        throw error
      })
    }

    return this.readyWorkerPromise
  }

  private async createWorker() {
    const worker = new Worker(`${BUSYTEX_BASE_PATH}/busytex_worker.js`)

    await new Promise<void>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<BusyTexWorkerMessage>) => {
        if (isBusyTexPrintMessage(event.data)) {
          return
        }

        if (isBusyTexExceptionMessage(event.data)) {
          cleanup()
          reject(new Error(event.data.exception))
          return
        }

        if (!isBusyTexInitMessage(event.data)) {
          return
        }

        cleanup()
        resolve()
      }

      const handleError = (event: ErrorEvent) => {
        cleanup()
        reject(new Error(event.message || 'Failed to initialize BusyTeX.'))
      }

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage)
        worker.removeEventListener('error', handleError)
      }

      worker.addEventListener('message', handleMessage)
      worker.addEventListener('error', handleError)
      worker.postMessage({
        busytex_js: `${BUSYTEX_BASE_PATH}/busytex.js`,
        busytex_wasm: `${BUSYTEX_BASE_PATH}/busytex.wasm`,
        data_packages_js: BUSYTEX_AVAILABLE_PACKAGE_URLS,
        preload: true,
        preload_data_packages_js: BUSYTEX_AVAILABLE_PACKAGE_URLS,
        texmf_local: [],
      })
    })

    this.worker = worker

    return worker
  }

  private async compileInternal(source: string) {
    const worker = await this.getWorker()

    return new Promise<LatexCompileResult>((resolve, reject) => {
      const prints: string[] = []

      const handleMessage = (event: MessageEvent<BusyTexWorkerMessage>) => {
        if (isBusyTexPrintMessage(event.data)) {
          prints.push(event.data.print)
          return
        }

        if (isBusyTexExceptionMessage(event.data)) {
          cleanup()
          reject(new Error(event.data.exception))
          return
        }

        if (!isBusyTexCompileMessage(event.data)) {
          return
        }

        cleanup()
        resolve({
          log: buildCompileLog(event.data, prints),
          pdf: event.data.pdf ? toPdfBuffer(event.data.pdf) : null,
          status: event.data.exit_code,
        })
      }

      const handleError = (event: ErrorEvent) => {
        cleanup()
        reject(new Error(event.message || 'BusyTeX crashed during compilation.'))
      }

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage)
        worker.removeEventListener('error', handleError)
      }

      worker.addEventListener('message', handleMessage)
      worker.addEventListener('error', handleError)
      worker.postMessage({
        bibtex: false,
        data_packages_js: BUSYTEX_AVAILABLE_PACKAGE_URLS,
        driver: 'xetex_bibtex8_dvipdfmx',
        files: [{ contents: source, path: BUSYTEX_MAIN_FILE }],
        main_tex_path: BUSYTEX_MAIN_FILE,
        verbose: 'info',
      })
    })
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

const latexEngine = new BusyTexEngine()

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
  return latexEngine.compile(normalizeLatexDocument(source))
}

export { compileLatexToPdf, normalizeLatexDocument }
export type { LatexCompileResult }

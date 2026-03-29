// Provider logo URLs sourced from OpenRouter's icon system.
// Uses openrouter.ai hosted icons where available, Google favicon fallback otherwise.

const OPENROUTER_ICONS: Record<string, string> = {
  anthropic: 'https://openrouter.ai/images/icons/Anthropic.svg',
  openai: 'https://openrouter.ai/images/icons/OpenAI.svg',
  google: 'https://openrouter.ai/images/icons/GoogleGemini.svg',
  mistralai: 'https://openrouter.ai/images/icons/Mistral.png',
  meta: 'https://openrouter.ai/images/icons/Meta.png',
  'meta-llama': 'https://openrouter.ai/images/icons/Meta.png',
  deepseek: 'https://openrouter.ai/images/icons/DeepSeek.png',
  cohere: 'https://openrouter.ai/images/icons/Cohere.png',
  perplexity: 'https://openrouter.ai/images/icons/Perplexity.svg',
  microsoft: 'https://openrouter.ai/images/icons/Microsoft.svg',
  qwen: 'https://openrouter.ai/images/icons/Qwen.png',
  amazon: 'https://openrouter.ai/images/icons/Bedrock.svg',
  deepinfra: 'https://openrouter.ai/images/icons/DeepInfra.webp',
  siliconflow: 'https://openrouter.ai/images/icons/SiliconFlow.svg',
}

// Map every provider slug to a real domain for Google favicon lookup.
// Covers all providers in the bundled catalog.
const FAVICON_DOMAINS: Record<string, string> = {
  'x-ai': 'x.ai',
  nvidia: 'nvidia.com',
  ai21: 'ai21.com',
  alibaba: 'www.alibabacloud.com',
  inflection: 'inflection.ai',
  nousresearch: 'nousresearch.com',
  minimax: 'minimaxi.com',
  liquid: 'www.liquid.ai',
  'aion-labs': 'aion-labs.com',
  'arcee-ai': 'www.arcee.ai',
  mancer: 'mancer.tech',
  thedrummer: 'huggingface.co',
  cognitivecomputations: 'huggingface.co',
  'anthracite-org': 'huggingface.co',
  alpindale: 'huggingface.co',
  sao10k: 'huggingface.co',
  undi95: 'huggingface.co',
  gryphe: 'huggingface.co',
  alfredpros: 'huggingface.co',
  tngtech: 'huggingface.co',
  'prime-intellect': 'huggingface.co',
  bytedance: 'www.bytedance.com',
  'bytedance-seed': 'www.bytedance.com',
  baidu: 'www.baidu.com',
  tencent: 'www.tencent.com',
  xiaomi: 'www.mi.com',
  inception: 'inceptionlabs.ai',
  stepfun: 'www.stepfun.com',
  kwaipilot: 'www.kuaishou.com',
  meituan: 'www.meituan.com',
  moonshotai: 'www.moonshot.cn',
  'nex-agi': 'nexagi.com',
  morph: 'www.morphlabs.io',
  switchpoint: 'switchpoint.ai',
  relace: 'relace.ai',
  eleutherai: 'www.eleuther.ai',
  essentialai: 'essential.ai',
  'ibm-granite': 'www.ibm.com',
  writer: 'writer.com',
  upstage: 'www.upstage.ai',
  allenai: 'allenai.org',
  deepcogito: 'deepcogito.com',
  'z-ai': 'z.ai',
  openrouter: 'openrouter.ai',
}

function faviconUrl(domain: string) {
  return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}/&size=256`
}

function getProviderLogoUrl(modelId: string): string {
  const provider = modelId.split('/')[0]?.toLowerCase() ?? ''

  if (OPENROUTER_ICONS[provider]) {
    return OPENROUTER_ICONS[provider]
  }

  if (FAVICON_DOMAINS[provider]) {
    return faviconUrl(FAVICON_DOMAINS[provider])
  }

  // Fallback: use huggingface favicon (most unknown providers are HF community models)
  return faviconUrl('huggingface.co')
}

// Some SVG icons from OpenRouter are dark and need inversion in dark mode
const NEEDS_INVERT = new Set(['openai', 'anthropic', 'perplexity', 'microsoft'])

function providerNeedsInvert(modelId: string): boolean {
  const provider = modelId.split('/')[0]?.toLowerCase() ?? ''
  return NEEDS_INVERT.has(provider)
}

export { getProviderLogoUrl, providerNeedsInvert }

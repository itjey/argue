import type { OpenRouterModel } from './openrouter'

export const CORE_OPENROUTER_MODELS: OpenRouterModel[] = [
  {
    "id": "openai/gpt-5.4",
    "canonical_slug": "openai/gpt-5.4-20260305",
    "name": "OpenAI: GPT-5.4",
    "description": "GPT-5.4 is OpenAI’s latest frontier model, unifying the Codex and GPT lines into a single system. It features a 1M+ token context window (922K input, 128K output) with support for text and image inputs, enabling high-context reasoning, coding, and multimodal analysis within the same workflow.\n\nThe model delivers improved performance in coding, document understanding, tool use, and instruction following. It is designed as a strong default for both general-purpose tasks and software engineering, capable of generating production-quality code, synthesizing information across multiple sources, and executing complex multi-step workflows with fewer iterations and greater token efficiency.",
    "created": 1772734352,
    "context_length": 1050000,
    "pricing": {
      "prompt": "0.0000025",
      "completion": "0.000015",
      "web_search": "0.01",
      "input_cache_read": "0.00000025"
    },
    "architecture": {
      "modality": "text+image+file->text",
      "input_modalities": [
        "text",
        "image",
        "file"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 1050000,
      "max_completion_tokens": 128000,
      "is_moderated": true
    },
    "supported_parameters": [
      "frequency_penalty",
      "include_reasoning",
      "logit_bias",
      "logprobs",
      "max_tokens",
      "presence_penalty",
      "reasoning",
      "response_format",
      "seed",
      "stop",
      "structured_outputs",
      "tool_choice",
      "tools",
      "top_logprobs"
    ]
  },
  {
    "id": "openai/gpt-5-mini",
    "canonical_slug": "openai/gpt-5-mini-2025-08-07",
    "name": "OpenAI: GPT-5 Mini",
    "description": "GPT-5 Mini is a compact version of GPT-5, designed to handle lighter-weight reasoning tasks. It provides the same instruction-following and safety-tuning benefits as GPT-5, but with reduced latency and cost. GPT-5 Mini is the successor to OpenAI's o4-mini model.",
    "created": 1754587407,
    "context_length": 400000,
    "pricing": {
      "prompt": "0.00000025",
      "completion": "0.000002",
      "web_search": "0.01",
      "input_cache_read": "0.000000025"
    },
    "architecture": {
      "modality": "text+image+file->text",
      "input_modalities": [
        "text",
        "image",
        "file"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 400000,
      "max_completion_tokens": 128000,
      "is_moderated": true
    },
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "seed",
      "structured_outputs",
      "tool_choice",
      "tools"
    ]
  },
  {
    "id": "anthropic/claude-opus-4.6",
    "canonical_slug": "anthropic/claude-4.6-opus-20260205",
    "name": "Anthropic: Claude Opus 4.6",
    "description": "Opus 4.6 is Anthropic’s strongest model for coding and long-running professional tasks. It is built for agents that operate across entire workflows rather than single prompts, making it especially effective for large codebases, complex refactors, and multi-step debugging that unfolds over time. The model shows deeper contextual understanding, stronger problem decomposition, and greater reliability on hard engineering tasks than prior generations.\n\nBeyond coding, Opus 4.6 excels at sustained knowledge work. It produces near-production-ready documents, plans, and analyses in a single pass, and maintains coherence across very long outputs and extended sessions. This makes it a strong default for tasks that require persistence, judgment, and follow-through, such as technical design, migration planning, and end-to-end project execution.\n\nFor users upgrading from earlier Opus versions, see our [official migration guide here](https://openrouter.ai/docs/guides/guides/model-migrations/claude-4-6-opus)",
    "created": 1770219050,
    "context_length": 1000000,
    "pricing": {
      "prompt": "0.000005",
      "completion": "0.000025",
      "web_search": "0.01",
      "input_cache_read": "0.0000005",
      "input_cache_write": "0.00000625"
    },
    "architecture": {
      "modality": "text+image->text",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 1000000,
      "max_completion_tokens": 128000,
      "is_moderated": true
    },
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_k",
      "top_p",
      "verbosity"
    ]
  },
  {
    "id": "anthropic/claude-sonnet-4.6",
    "canonical_slug": "anthropic/claude-4.6-sonnet-20260217",
    "name": "Anthropic: Claude Sonnet 4.6",
    "description": "Sonnet 4.6 is Anthropic's most capable Sonnet-class model yet, with frontier performance across coding, agents, and professional work. It excels at iterative development, complex codebase navigation, end-to-end project management with memory, polished document creation, and confident computer use for web QA and workflow automation.",
    "created": 1771342990,
    "context_length": 1000000,
    "pricing": {
      "prompt": "0.000003",
      "completion": "0.000015",
      "web_search": "0.01",
      "input_cache_read": "0.0000003",
      "input_cache_write": "0.00000375"
    },
    "architecture": {
      "modality": "text+image->text",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 1000000,
      "max_completion_tokens": 128000,
      "is_moderated": true
    },
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_k",
      "top_p",
      "verbosity"
    ]
  },
  {
    "id": "anthropic/claude-haiku-4.5",
    "canonical_slug": "anthropic/claude-4.5-haiku-20251001",
    "name": "Anthropic: Claude Haiku 4.5",
    "description": "Claude Haiku 4.5 is Anthropic’s fastest and most efficient model, delivering near-frontier intelligence at a fraction of the cost and latency of larger Claude models. Matching Claude Sonnet 4’s performance across reasoning, coding, and computer-use tasks, Haiku 4.5 brings frontier-level capability to real-time and high-volume applications.\n\nIt introduces extended thinking to the Haiku line; enabling controllable reasoning depth, summarized or interleaved thought output, and tool-assisted workflows with full support for coding, bash, web search, and computer-use tools. Scoring >73% on SWE-bench Verified, Haiku 4.5 ranks among the world’s best coding models while maintaining exceptional responsiveness for sub-agents, parallelized execution, and scaled deployment.",
    "created": 1760547638,
    "context_length": 200000,
    "pricing": {
      "prompt": "0.000001",
      "completion": "0.000005",
      "web_search": "0.01",
      "input_cache_read": "0.0000001",
      "input_cache_write": "0.00000125"
    },
    "architecture": {
      "modality": "text+image->text",
      "input_modalities": [
        "image",
        "text"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 200000,
      "max_completion_tokens": 64000,
      "is_moderated": true
    },
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_k",
      "top_p"
    ]
  },
  {
    "id": "google/gemini-3.1-pro-preview",
    "canonical_slug": "google/gemini-3.1-pro-preview-20260219",
    "name": "Google: Gemini 3.1 Pro Preview",
    "description": "Gemini 3.1 Pro Preview is Google’s frontier reasoning model, delivering enhanced software engineering performance, improved agentic reliability, and more efficient token usage across complex workflows. Building on the multimodal foundation of the Gemini 3 series, it combines high-precision reasoning across text, image, video, audio, and code with a 1M-token context window. Reasoning Details must be preserved when using multi-turn tool calling, see our docs here: https://openrouter.ai/docs/use-cases/reasoning-tokens#preserving-reasoning. The 3.1 update introduces measurable gains in SWE benchmarks and real-world coding environments, along with stronger autonomous task execution in structured domains such as finance and spreadsheet-based workflows.\n\nDesigned for advanced development and agentic systems, Gemini 3.1 Pro Preview improves long-horizon stability and tool orchestration while increasing token efficiency. It introduces a new medium thinking level to better balance cost, speed, and performance. The model excels in agentic coding, structured planning, multimodal analysis, and workflow automation, making it well-suited for autonomous agents, financial modeling, spreadsheet automation, and high-context enterprise tasks.",
    "created": 1771509627,
    "context_length": 1048576,
    "pricing": {
      "prompt": "0.000002",
      "completion": "0.000012",
      "image": "0.000002",
      "audio": "0.000002",
      "internal_reasoning": "0.000012",
      "input_cache_read": "0.0000002",
      "input_cache_write": "0.000000375"
    },
    "architecture": {
      "modality": "text+image+file+audio+video->text",
      "input_modalities": [
        "audio",
        "file",
        "image",
        "text",
        "video"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 1048576,
      "max_completion_tokens": 65536,
      "is_moderated": false
    },
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "seed",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_p"
    ]
  },
  {
    "id": "google/gemini-3.1-flash-lite-preview",
    "canonical_slug": "google/gemini-3.1-flash-lite-preview-20260303",
    "name": "Google: Gemini 3.1 Flash Lite Preview",
    "description": "Gemini 3.1 Flash Lite Preview is Google's high-efficiency model optimized for high-volume use cases. It outperforms Gemini 2.5 Flash Lite on overall quality and approaches Gemini 2.5 Flash performance across key capabilities. Improvements span audio input/ASR, RAG snippet ranking, translation, data extraction, and code completion. Supports full thinking levels (minimal, low, medium, high) for fine-grained cost/performance trade-offs. Priced at half the cost of Gemini 3 Flash.",
    "created": 1772512673,
    "context_length": 1048576,
    "pricing": {
      "prompt": "0.00000025",
      "completion": "0.0000015",
      "image": "0.00000025",
      "audio": "0.0000005",
      "internal_reasoning": "0.0000015",
      "input_cache_read": "0.000000025",
      "input_cache_write": "0.00000008333333333333334"
    },
    "architecture": {
      "modality": "text+image+file+audio+video->text",
      "input_modalities": [
        "text",
        "image",
        "video",
        "file",
        "audio"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 1048576,
      "max_completion_tokens": 65536,
      "is_moderated": false
    },
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "seed",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_p"
    ]
  },
  {
    "id": "deepseek/deepseek-chat-v3.1",
    "canonical_slug": "deepseek/deepseek-chat-v3.1",
    "name": "DeepSeek: DeepSeek V3.1",
    "description": "DeepSeek-V3.1 is a large hybrid reasoning model (671B parameters, 37B active) that supports both thinking and non-thinking modes via prompt templates. It extends the DeepSeek-V3 base with a two-phase long-context training process, reaching up to 128K tokens, and uses FP8 microscaling for efficient inference. Users can control the reasoning behaviour with the `reasoning` `enabled` boolean. [Learn more in our docs](https://openrouter.ai/docs/use-cases/reasoning-tokens#enable-reasoning-with-default-config)\n\nThe model improves tool use, code generation, and reasoning efficiency, achieving performance comparable to DeepSeek-R1 on difficult benchmarks while responding more quickly. It supports structured tool calling, code agents, and search agents, making it suitable for research, coding, and agentic workflows. \n\nIt succeeds the [DeepSeek V3-0324](/deepseek/deepseek-chat-v3-0324) model and performs well on a variety of tasks.",
    "created": 1755779628,
    "context_length": 32768,
    "pricing": {
      "prompt": "0.00000015",
      "completion": "0.00000075"
    },
    "architecture": {
      "modality": "text->text",
      "input_modalities": [
        "text"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 32768,
      "max_completion_tokens": 7168,
      "is_moderated": false
    },
    "supported_parameters": [
      "frequency_penalty",
      "include_reasoning",
      "logit_bias",
      "logprobs",
      "max_tokens",
      "min_p",
      "presence_penalty",
      "reasoning",
      "repetition_penalty",
      "response_format",
      "seed",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_k",
      "top_logprobs",
      "top_p"
    ]
  },
  {
    "id": "moonshotai/kimi-k2.5",
    "canonical_slug": "moonshotai/kimi-k2.5-0127",
    "name": "MoonshotAI: Kimi K2.5",
    "description": "Kimi K2.5 is Moonshot AI's native multimodal model, delivering state-of-the-art visual coding capability and a self-directed agent swarm paradigm. Built on Kimi K2 with continued pretraining over approximately 15T mixed visual and text tokens, it delivers strong performance in general reasoning, visual coding, and agentic tool-calling.",
    "created": 1769487076,
    "context_length": 262144,
    "pricing": {
      "prompt": "0.00000045",
      "completion": "0.0000022",
      "input_cache_read": "0.000000225"
    },
    "architecture": {
      "modality": "text+image->text",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 262144,
      "max_completion_tokens": 65535,
      "is_moderated": false
    },
    "supported_parameters": [
      "frequency_penalty",
      "include_reasoning",
      "logit_bias",
      "logprobs",
      "max_tokens",
      "min_p",
      "parallel_tool_calls",
      "presence_penalty",
      "reasoning",
      "reasoning_effort",
      "repetition_penalty",
      "response_format",
      "seed",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_k",
      "top_logprobs",
      "top_p"
    ]
  },
  {
    "id": "x-ai/grok-4-fast",
    "canonical_slug": "x-ai/grok-4-fast",
    "name": "xAI: Grok 4 Fast",
    "description": "Grok 4 Fast is xAI's latest multimodal model with SOTA cost-efficiency and a 2M token context window. It comes in two flavors: non-reasoning and reasoning. Read more about the model on xAI's [news post](http://x.ai/news/grok-4-fast).\n\nReasoning can be enabled/disabled using the `reasoning` `enabled` parameter in the API. [Learn more in our docs](https://openrouter.ai/docs/use-cases/reasoning-tokens#controlling-reasoning-tokens)",
    "created": 1758240090,
    "context_length": 2000000,
    "pricing": {
      "prompt": "0.0000002",
      "completion": "0.0000005",
      "web_search": "0.005",
      "input_cache_read": "0.00000005"
    },
    "architecture": {
      "modality": "text+image->text",
      "input_modalities": [
        "text",
        "image"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 2000000,
      "max_completion_tokens": 30000,
      "is_moderated": false
    },
    "supported_parameters": [
      "include_reasoning",
      "logprobs",
      "max_tokens",
      "reasoning",
      "response_format",
      "seed",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_logprobs",
      "top_p"
    ]
  },
  {
    "id": "google/gemini-2.5-flash",
    "canonical_slug": "google/gemini-2.5-flash",
    "name": "Google: Gemini 2.5 Flash",
    "description": "Gemini 2.5 Flash is Google's state-of-the-art workhorse model, specifically designed for advanced reasoning, coding, mathematics, and scientific tasks. It includes built-in \"thinking\" capabilities, enabling it to provide responses with greater accuracy and nuanced context handling. \n\nAdditionally, Gemini 2.5 Flash is configurable through the \"max tokens for reasoning\" parameter, as described in the documentation (https://openrouter.ai/docs/use-cases/reasoning-tokens#max-tokens-for-reasoning).",
    "created": 1750172488,
    "context_length": 1048576,
    "pricing": {
      "prompt": "0.0000003",
      "completion": "0.0000025",
      "image": "0.0000003",
      "audio": "0.000001",
      "internal_reasoning": "0.0000025",
      "input_cache_read": "0.00000003",
      "input_cache_write": "0.00000008333333333333334"
    },
    "architecture": {
      "modality": "text+image+file+audio+video->text",
      "input_modalities": [
        "file",
        "image",
        "text",
        "audio",
        "video"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 1048576,
      "max_completion_tokens": 65535,
      "is_moderated": false
    },
    "supported_parameters": [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "seed",
      "stop",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_p"
    ]
  },
  {
    "id": "openai/gpt-5.3-chat",
    "canonical_slug": "openai/gpt-5.3-chat-20260303",
    "name": "OpenAI: GPT-5.3 Chat",
    "description": "GPT-5.3 Chat is an update to ChatGPT's most-used model that makes everyday conversations smoother, more useful, and more directly helpful. It delivers more accurate answers with better contextualization and significantly reduces unnecessary refusals, caveats, and overly cautious phrasing that can interrupt conversational flow.",
    "created": 1772564061,
    "context_length": 128000,
    "pricing": {
      "prompt": "0.00000175",
      "completion": "0.000014",
      "web_search": "0.1",
      "input_cache_read": "0.000000175"
    },
    "architecture": {
      "modality": "text+image+file->text",
      "input_modalities": [
        "text",
        "image",
        "file"
      ],
      "output_modalities": [
        "text"
      ]
    },
    "top_provider": {
      "context_length": 128000,
      "max_completion_tokens": 16384,
      "is_moderated": true
    },
    "supported_parameters": [
      "frequency_penalty",
      "logit_bias",
      "logprobs",
      "max_tokens",
      "presence_penalty",
      "response_format",
      "seed",
      "stop",
      "structured_outputs",
      "tool_choice",
      "tools",
      "top_logprobs"
    ]
  }
]

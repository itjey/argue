"""Inspect OpenRouter reasoning-capable models and probe live reasoning output.

This script has two modes:
- list: fetch the OpenRouter catalog and classify reasoning exposure heuristically
- probe: run live streamed chat requests and classify models from observed output
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any


OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"
APP_ORIGIN = "https://itjey.github.io/argue/"
APP_TITLE = "Argue"
VISIBLE_REASONING_KINDS = {"trace", "hybrid", "provider"}
DEFAULT_PROBE_MODELS = [
	"openai/gpt-5",
	"google/gemini-2.5-pro",
	"google/gemini-2.5-flash",
	"x-ai/grok-4",
	"x-ai/grok-3-mini",
]
DEFAULT_PROMPT = (
	"What is 27 * 43 + 11? Think carefully. "
	"Return the final answer as a single integer."
)


def request_headers(api_key: str | None = None) -> dict[str, str]:
	headers = {
		"Accept": "application/json",
		"Content-Type": "application/json",
		"HTTP-Referer": APP_ORIGIN,
		"X-Title": APP_TITLE,
	}
	if api_key:
		headers["Authorization"] = f"Bearer {api_key}"
	return headers


def fetch_openrouter_models() -> list[dict[str, Any]]:
	request = urllib.request.Request(
		OPENROUTER_MODELS_URL,
		headers=request_headers(),
	)

	with urllib.request.urlopen(request, timeout=30) as response:
		payload = json.load(response)

	data = payload.get("data")
	if not isinstance(data, list):
		raise ValueError("OpenRouter returned an unexpected models payload.")

	return [model for model in data if isinstance(model, dict)]


def supports_reasoning(model: dict[str, Any]) -> bool:
	supported_parameters = {
		str(value).lower() for value in model.get("supported_parameters", [])
	}
	return any(
		flag in supported_parameters
		for flag in ("reasoning", "include_reasoning", "reasoning_effort")
	)


def get_reasoning_exposure(model: dict[str, Any], reasoning_supported: bool) -> dict[str, str]:
	if not reasoning_supported:
		return {
			"kind": "none",
			"badge": "No thinking",
			"detail": "This model does not advertise reasoning support in the OpenRouter catalog.",
		}

	searchable_id = " ".join(
		[
			str(model.get("id", "")),
			str(model.get("canonical_slug", "")),
			str(model.get("name", "")),
		]
	).lower()

	if any(
		token in searchable_id
		for token in (
			"deepseek-r1",
			"kimi",
			"thinking",
			"minimax/m2",
			"intellect",
			"nemotron",
			"mimo",
			"glm 4.5",
			"glm-4.5",
		)
	):
		return {
			"kind": "trace",
			"badge": "Trace COT",
			"detail": "Usually exposes visible step-by-step reasoning text through OpenRouter.",
		}

	if searchable_id.startswith("anthropic/") or "claude" in searchable_id:
		return {
			"kind": "hybrid",
			"badge": "Hybrid thinking",
			"detail": "Often returns a mix of summaries, text traces, or protected reasoning blocks.",
		}

	if (
		searchable_id.startswith("openai/")
		or "/o1" in searchable_id
		or "/o3" in searchable_id
		or "gpt-5" in searchable_id
		or searchable_id.startswith("google/")
		or "gemini" in searchable_id
		or searchable_id.startswith("x-ai/")
		or "grok" in searchable_id
	):
		return {
			"kind": "protected",
			"badge": "Protected thinking",
			"detail": "Usually exposes summaries or protected reasoning blocks rather than a raw trace.",
		}

	return {
		"kind": "provider",
		"badge": "Provider thinking",
		"detail": "Supports reasoning, but the backend may expose traces, summaries, or encrypted blocks.",
	}


def get_context_length(model: dict[str, Any]) -> int | None:
	raw_value = model.get("context_length")
	if isinstance(raw_value, int):
		return raw_value

	top_provider = model.get("top_provider")
	if isinstance(top_provider, dict):
		provider_value = top_provider.get("context_length")
		if isinstance(provider_value, int):
			return provider_value

	return None


def describe_model(model: dict[str, Any]) -> dict[str, Any]:
	reasoning_supported = supports_reasoning(model)
	exposure = get_reasoning_exposure(model, reasoning_supported)

	return {
		"id": str(model.get("id", "")),
		"name": str(model.get("name", "")).strip() or str(model.get("id", "")),
		"context_length": get_context_length(model),
		"reasoning_exposure": exposure,
	}


def format_context_length(value: int | None) -> str:
	if value is None:
		return "-"
	return f"{value:,}"


def print_section(title: str, models: list[dict[str, Any]]) -> None:
	print(title)
	print("-" * len(title))

	if not models:
		print("None")
		print()
		return

	for model in models:
		exposure = model["reasoning_exposure"]
		print(
			f"- {model['id']} | {exposure['badge']} | context {format_context_length(model['context_length'])}"
		)

	print()


def extract_text(content: Any) -> str:
	if isinstance(content, str):
		return content
	if isinstance(content, list):
		parts: list[str] = []
		for item in content:
			if isinstance(item, dict) and item.get("type") == "text":
				value = item.get("text")
				if isinstance(value, str):
					parts.append(value)
		return "".join(parts)
	return ""


def extract_sse_payload(raw_event: str) -> str | None:
	data_lines = []
	for line in raw_event.split("\n"):
		if line.startswith("data:"):
			data_lines.append(line[5:].strip())
	if not data_lines:
		return None
	return "\n".join(data_lines)


def trim_preview(value: str, limit: int = 140) -> str:
	compact = " ".join(value.strip().split())
	if len(compact) <= limit:
		return compact
	return f"{compact[: limit - 3]}..."


def build_probe_payload(model: str, prompt: str, include_reasoning: bool, include_summary: bool) -> bytes:
	payload: dict[str, Any] = {
		"model": model,
		"stream": True,
		"max_tokens": 200,
		"messages": [
			{
				"role": "user",
				"content": prompt,
			}
		],
		"include_reasoning": include_reasoning,
	}

	if include_reasoning:
		payload["reasoning"] = {
			"effort": "high",
			"summary": "detailed" if include_summary else "auto",
		}

	return json.dumps(payload).encode("utf-8")


def stream_probe_request(
	api_key: str,
	model: str,
	prompt: str,
	include_reasoning: bool,
	include_summary: bool,
) -> dict[str, Any]:
	request = urllib.request.Request(
		OPENROUTER_CHAT_URL,
		data=build_probe_payload(model, prompt, include_reasoning, include_summary),
		headers=request_headers(api_key),
		method="POST",
	)

	events: list[dict[str, Any]] = []
	content_fragments: list[str] = []
	reasoning_fragments: list[str] = []
	summary_fragments: list[str] = []
	encrypted_count = 0
	first_reasoning_index: int | None = None
	first_content_index: int | None = None
	phase: str | None = None
	start_time = time.perf_counter()

	with urllib.request.urlopen(request, timeout=90) as response:
		for raw_bytes in response:
			line = raw_bytes.decode("utf-8", errors="replace")
			if not line.strip():
				continue
			payload = extract_sse_payload(line.strip())
			if not payload:
				continue
			if payload == "[DONE]":
				break

			chunk = json.loads(payload)
			if isinstance(chunk, dict) and isinstance(chunk.get("error"), dict):
				message = chunk["error"].get("message")
				raise RuntimeError(str(message or "OpenRouter returned a streaming error."))

			choices = chunk.get("choices")
			if not isinstance(choices, list) or not choices:
				continue

			delta = choices[0].get("delta")
			if not isinstance(delta, dict):
				continue

			phase_value = delta.get("phase")
			if isinstance(phase_value, str) and phase_value:
				phase = phase_value

			content_text = extract_text(delta.get("content"))
			if content_text:
				content_fragments.append(content_text)
				if first_content_index is None:
					first_content_index = len(events)
				events.append(
					{
						"type": "content",
						"preview": trim_preview(content_text),
					}
				)

			reasoning_text = delta.get("reasoning")
			if isinstance(reasoning_text, str) and reasoning_text:
				reasoning_fragments.append(reasoning_text)
				if first_reasoning_index is None:
					first_reasoning_index = len(events)
				events.append(
					{
						"type": "reasoning",
						"preview": trim_preview(reasoning_text),
					}
				)

			reasoning_details = delta.get("reasoning_details")
			if isinstance(reasoning_details, list):
				for detail in reasoning_details:
					if not isinstance(detail, dict):
						continue
					detail_type = detail.get("type")
					if detail_type == "reasoning.text":
						text_value = detail.get("text")
						if isinstance(text_value, str) and text_value:
							reasoning_fragments.append(text_value)
							if first_reasoning_index is None:
								first_reasoning_index = len(events)
							events.append(
								{
									"type": "reasoning.text",
									"preview": trim_preview(text_value),
								}
							)
					elif detail_type == "reasoning.summary":
						summary_value = detail.get("summary")
						if isinstance(summary_value, str) and summary_value:
							summary_fragments.append(summary_value)
							if first_reasoning_index is None:
								first_reasoning_index = len(events)
							events.append(
								{
									"type": "reasoning.summary",
									"preview": trim_preview(summary_value),
								}
							)
					elif detail_type == "reasoning.encrypted":
						encrypted_count += 1
						if first_reasoning_index is None:
							first_reasoning_index = len(events)
							
						events.append(
							{
								"type": "reasoning.encrypted",
								"preview": "encrypted reasoning block",
							}
						)

	elapsed = time.perf_counter() - start_time
	response_text = "".join(content_fragments).strip()
	reasoning_text = "".join(reasoning_fragments).strip()
	summary_text = " ".join(fragment.strip() for fragment in summary_fragments if fragment.strip())

	classification = "no_reasoning_exposed"
	if reasoning_text:
		classification = "COT"
	elif summary_text:
		classification = "summary_only"
	elif encrypted_count > 0:
		classification = "protected"

	reasoning_before_answer = False
	if first_reasoning_index is not None:
		if first_content_index is None or first_reasoning_index < first_content_index:
			reasoning_before_answer = True

	return {
		"model": model,
		"phase": phase,
		"classification": classification,
		"reasoning_before_answer": reasoning_before_answer,
		"reasoning_preview": trim_preview(reasoning_text) if reasoning_text else "",
		"summary_preview": trim_preview(summary_text) if summary_text else "",
		"answer_preview": trim_preview(response_text) if response_text else "",
		"encrypted_count": encrypted_count,
		"event_count": len(events),
		"events": events,
		"elapsed_seconds": round(elapsed, 2),
	}


def probe_model(api_key: str, model: str, prompt: str) -> dict[str, Any]:
	strategies = [
		{"include_reasoning": True, "include_summary": True, "label": "reasoning+detailed-summary"},
		{"include_reasoning": True, "include_summary": False, "label": "reasoning+auto-summary"},
		{"include_reasoning": False, "include_summary": False, "label": "plain-stream"},
	]

	last_error = None
	for strategy in strategies:
		try:
			result = stream_probe_request(
				api_key=api_key,
				model=model,
				prompt=prompt,
				include_reasoning=strategy["include_reasoning"],
				include_summary=strategy["include_summary"],
			)
			result["strategy"] = strategy["label"]
			return result
		except urllib.error.HTTPError as error:
			body = error.read().decode("utf-8", errors="replace")
			last_error = f"HTTP {error.code}: {trim_preview(body, 220)}"
		except urllib.error.URLError as error:
			last_error = str(error)
		except (RuntimeError, json.JSONDecodeError, TimeoutError) as error:
			last_error = str(error)

	return {
		"model": model,
		"classification": "error",
		"reasoning_before_answer": False,
		"answer_preview": "",
		"reasoning_preview": "",
		"summary_preview": "",
		"encrypted_count": 0,
		"events": [],
		"event_count": 0,
		"elapsed_seconds": 0,
		"error": last_error or "Unknown probe failure.",
	}


def print_probe_result(result: dict[str, Any]) -> None:
	print(f"MODEL: {result['model']}")
	if result.get("classification") == "error":
		print("  classification: error")
		print(f"  error: {result.get('error', '')}")
		print()
		return

	print(f"  strategy: {result.get('strategy', '-')}")
	print(f"  classification: {result['classification']}")
	print(f"  reasoning_before_answer: {result['reasoning_before_answer']}")
	print(f"  phase: {result.get('phase') or '-'}")
	print(f"  elapsed_seconds: {result.get('elapsed_seconds', 0)}")
	if result.get("reasoning_preview"):
		print(f"  reasoning_preview: {result['reasoning_preview']}")
	if result.get("summary_preview"):
		print(f"  summary_preview: {result['summary_preview']}")
	if result.get("answer_preview"):
		print(f"  answer_preview: {result['answer_preview']}")
	if result.get("encrypted_count"):
		print(f"  encrypted_blocks: {result['encrypted_count']}")
	print("  event_trace:")
	for event in result.get("events", [])[:12]:
		print(f"    - {event['type']}: {event['preview']}")
	if len(result.get("events", [])) > 12:
		print(f"    - ... {len(result['events']) - 12} more events")
	print()


def list_models_command(args: argparse.Namespace) -> int:
	try:
		models = [describe_model(model) for model in fetch_openrouter_models()]
	except urllib.error.URLError as error:
		print(f"Failed to reach OpenRouter: {error}", file=sys.stderr)
		return 1
	except (ValueError, json.JSONDecodeError) as error:
		print(f"Failed to parse OpenRouter models payload: {error}", file=sys.stderr)
		return 1

	reasoning_models = [
		model for model in models if model["reasoning_exposure"]["kind"] != "none"
	]
	visible_models = [
		model
		for model in reasoning_models
		if model["reasoning_exposure"]["kind"] in VISIBLE_REASONING_KINDS
	]
	protected_models = [
		model
		for model in reasoning_models
		if model["reasoning_exposure"]["kind"] == "protected"
	]

	visible_models.sort(
		key=lambda model: (
			model["reasoning_exposure"]["kind"],
			model["name"].lower(),
			model["id"].lower(),
		)
	)
	protected_models.sort(key=lambda model: (model["name"].lower(), model["id"].lower()))

	print(f"Reasoning-capable models: {len(reasoning_models)}")
	print(f"Visible-thought candidates: {len(visible_models)}")
	print(f"Protected-thinking models: {len(protected_models)}")
	print()
	print_section("Models that can think and show their thoughts", visible_models)
	if args.all_reasoning:
		print_section("Models that think but usually hide raw thoughts", protected_models)
	return 0


def probe_models_command(args: argparse.Namespace) -> int:
	api_key = args.api_key or os.environ.get("OPENROUTER_API_KEY")
	if not api_key:
		print(
			"An API key is required. Pass --api-key or set OPENROUTER_API_KEY.",
			file=sys.stderr,
		)
		return 1

	models = args.models or DEFAULT_PROBE_MODELS
	print(f"Prompt: {args.prompt}")
	print()
	results = [probe_model(api_key=api_key, model=model, prompt=args.prompt) for model in models]

	print("Summary")
	print("-------")
	for result in results:
		classification = result.get("classification", "-")
		before_answer = result.get("reasoning_before_answer", False)
		print(f"- {result['model']} | {classification} | reasoning_before_answer={before_answer}")
	print()

	for result in results:
		print_probe_result(result)

	return 0


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(
		description="Inspect OpenRouter reasoning-capable models and probe live reasoning output."
	)
	subparsers = parser.add_subparsers(dest="command")

	list_parser = subparsers.add_parser("list", help="List reasoning-capable models from the catalog.")
	list_parser.add_argument(
		"--all-reasoning",
		action="store_true",
		help="Also print reasoning-capable models that only expose protected thinking.",
	)
	list_parser.set_defaults(handler=list_models_command)

	probe_parser = subparsers.add_parser("probe", help="Run live streamed reasoning probes.")
	probe_parser.add_argument("--api-key", help="OpenRouter API key. Prefer OPENROUTER_API_KEY.")
	probe_parser.add_argument(
		"--models",
		nargs="+",
		help="Specific models to probe. Defaults to a small GPT/Gemini/Grok set.",
	)
	probe_parser.add_argument(
		"--prompt",
		default=DEFAULT_PROMPT,
		help="Prompt used to trigger reasoning with a short final answer.",
	)
	probe_parser.set_defaults(handler=probe_models_command)

	parser.set_defaults(command="list", handler=list_models_command, all_reasoning=False)
	return parser.parse_args()


def main() -> int:
	args = parse_args()
	return args.handler(args)


if __name__ == "__main__":
	raise SystemExit(main())

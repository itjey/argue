"""Inspect OpenRouter reasoning-capable models and probe live reasoning output.

This script has two modes:
- list: fetch the OpenRouter catalog and classify reasoning exposure heuristically
- probe: run live streamed chat requests and classify models from observed output
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import os
import re
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


@dataclass(frozen=True)
class Participant:
	alias: str
	model: str
	role: str


DEFAULT_COLLAB_PARTICIPANTS = [
	Participant(
		alias="GPT-5.4",
		model="openai/gpt-5.4",
		role="formal verifier focused on rigor, edge cases, and final synthesis quality",
	),
	Participant(
		alias="Gemini 3.1",
		model="google/gemini-3.1-pro-preview-customtools",
		role="alternative reasoner focused on different solution paths and hidden assumptions",
	),
	Participant(
		alias="Grok 4",
		model="x-ai/grok-4",
		role="aggressive critic focused on finding flaws, contradictions, and missing evidence",
	),
]


def sanitize_stream_text(value: str) -> str:
	return re.sub(r"\s+", " ", value).strip()


def emit_live_line(fragment: str) -> None:
	clean_fragment = sanitize_stream_text(fragment)
	if not clean_fragment:
		return
	sys.stdout.write(f"{clean_fragment} ")
	sys.stdout.flush()


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


def build_messages_payload(
	model: str,
	messages: list[dict[str, str]],
	include_reasoning: bool,
	include_summary: bool,
	max_tokens: int,
) -> bytes:
	payload: dict[str, Any] = {
		"model": model,
		"stream": True,
		"max_tokens": max_tokens,
		"messages": messages,
		"include_reasoning": include_reasoning,
	}

	if include_reasoning:
		payload["reasoning"] = {
			"effort": "high",
			"summary": "detailed" if include_summary else "auto",
		}

	return json.dumps(payload).encode("utf-8")


def build_live_heading(title: str | None, model: str) -> str:
	if title:
		return f"=== {title} [{model}] ==="
	return f"=== {model} ==="


def stream_messages_request(
	api_key: str,
	model: str,
	messages: list[dict[str, str]],
	max_tokens: int,
	include_reasoning: bool,
	include_summary: bool,
	live_output: bool = False,
	live_title: str | None = None,
) -> dict[str, Any]:
	request = urllib.request.Request(
		OPENROUTER_CHAT_URL,
		data=build_messages_payload(
			model=model,
			messages=messages,
			include_reasoning=include_reasoning,
			include_summary=include_summary,
			max_tokens=max_tokens,
		),
		headers=request_headers(api_key),
		method="POST",
	)

	events: list[dict[str, Any]] = []
	content_fragments: list[str] = []
	top_level_reasoning_fragments: list[str] = []
	raw_reasoning_fragments: list[str] = []
	summary_fragments: list[str] = []
	encrypted_count = 0
	first_reasoning_index: int | None = None
	first_content_index: int | None = None
	phase: str | None = None
	start_time = time.perf_counter()
	printed_thinking_header = False
	printed_output_header = False
	printed_protected_notice = False
	printed_reasoning_text = False
	printed_summary_text = False

	if live_output:
		print(build_live_heading(live_title, model), flush=True)
		print("thinking", flush=True)
		printed_thinking_header = True

	with urllib.request.urlopen(request, timeout=120) as response:
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
				if live_output:
					if not printed_output_header:
						print("output", flush=True)
						printed_output_header = True
					emit_live_line(content_text)
				if first_content_index is None:
					first_content_index = len(events)
				events.append({"type": "content", "preview": trim_preview(content_text)})

			reasoning_text = delta.get("reasoning")
			if isinstance(reasoning_text, str) and reasoning_text:
				top_level_reasoning_fragments.append(reasoning_text)
				if live_output and not printed_reasoning_text and not printed_summary_text:
					emit_live_line(reasoning_text)
					printed_summary_text = True
				if first_reasoning_index is None:
					first_reasoning_index = len(events)
				events.append({"type": "reasoning", "preview": trim_preview(reasoning_text)})

			reasoning_details = delta.get("reasoning_details")
			if isinstance(reasoning_details, list):
				for detail in reasoning_details:
					if not isinstance(detail, dict):
						continue
					detail_type = detail.get("type")
					if detail_type == "reasoning.text":
						text_value = detail.get("text")
						if isinstance(text_value, str) and text_value:
							raw_reasoning_fragments.append(text_value)
							if live_output:
								emit_live_line(text_value)
								printed_reasoning_text = True
							if first_reasoning_index is None:
								first_reasoning_index = len(events)
							events.append({"type": "reasoning.text", "preview": trim_preview(text_value)})
					elif detail_type == "reasoning.summary":
						summary_value = detail.get("summary")
						if isinstance(summary_value, str) and summary_value:
							summary_fragments.append(summary_value)
							if live_output and not printed_reasoning_text:
								emit_live_line(summary_value)
								printed_summary_text = True
							if first_reasoning_index is None:
								first_reasoning_index = len(events)
							events.append({"type": "reasoning.summary", "preview": trim_preview(summary_value)})
					elif detail_type == "reasoning.encrypted":
						encrypted_count += 1
						if live_output and not printed_reasoning_text and not printed_summary_text and not printed_protected_notice:
							emit_live_line("[provider exposes protected reasoning only]")
							printed_protected_notice = True
						if first_reasoning_index is None:
							first_reasoning_index = len(events)
						events.append({"type": "reasoning.encrypted", "preview": "encrypted reasoning block"})

	elapsed = time.perf_counter() - start_time
	response_text = "".join(content_fragments).strip()
	top_level_reasoning_text = "".join(top_level_reasoning_fragments).strip()
	raw_reasoning_text = "".join(raw_reasoning_fragments).strip()
	summary_text = " ".join(fragment.strip() for fragment in summary_fragments if fragment.strip())

	if live_output and not printed_reasoning_text and not printed_summary_text and not printed_protected_notice:
		emit_live_line("[no separate thinking stream exposed]")
	if live_output and not printed_output_header:
		print("output", flush=True)
		if response_text:
			emit_live_line(response_text)
		print(flush=True)

	classification = "no_reasoning_exposed"
	if raw_reasoning_text:
		classification = "COT"
	elif summary_text and encrypted_count > 0:
		classification = "protected_summary"
	elif summary_text:
		classification = "summary_only"
	elif top_level_reasoning_text:
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
		"reasoning_preview": trim_preview(raw_reasoning_text) if raw_reasoning_text else "",
		"top_level_reasoning_preview": trim_preview(top_level_reasoning_text) if top_level_reasoning_text else "",
		"summary_preview": trim_preview(summary_text) if summary_text else "",
		"answer_preview": trim_preview(response_text) if response_text else "",
		"response_text": response_text,
		"top_level_reasoning_text": top_level_reasoning_text,
		"raw_reasoning_text": raw_reasoning_text,
		"summary_text": summary_text,
		"encrypted_count": encrypted_count,
		"event_count": len(events),
		"events": events,
		"elapsed_seconds": round(elapsed, 2),
	}


def choose_visible_thinking(result: dict[str, Any]) -> str:
	if result.get("raw_reasoning_text"):
		return str(result["raw_reasoning_text"])
	if result.get("summary_text"):
		return str(result["summary_text"])
	if result.get("top_level_reasoning_text"):
		return str(result["top_level_reasoning_text"])
	if result.get("encrypted_count"):
		return "[provider exposes protected reasoning only]"
	return "[no separate thinking stream exposed]"


def run_chat_with_strategies(
	api_key: str,
	model: str,
	messages: list[dict[str, str]],
	max_tokens: int,
	live_output: bool,
	live_title: str | None,
) -> dict[str, Any]:
	strategies = [
		{"include_reasoning": True, "include_summary": True, "label": "reasoning+detailed-summary"},
		{"include_reasoning": True, "include_summary": False, "label": "reasoning+auto-summary"},
		{"include_reasoning": False, "include_summary": False, "label": "plain-stream"},
	]

	last_error = None
	for strategy in strategies:
		try:
			result = stream_messages_request(
				api_key=api_key,
				model=model,
				messages=messages,
				max_tokens=max_tokens,
				include_reasoning=strategy["include_reasoning"],
				include_summary=strategy["include_summary"],
				live_output=live_output,
				live_title=live_title,
			)
			result["strategy"] = strategy["label"]
			result["visible_thinking"] = choose_visible_thinking(result)
			return result
		except urllib.error.HTTPError as error:
			body = error.read().decode("utf-8", errors="replace")
			last_error = f"HTTP {error.code}: {trim_preview(body, 260)}"
		except urllib.error.URLError as error:
			last_error = str(error)
		except (RuntimeError, json.JSONDecodeError, TimeoutError) as error:
			last_error = str(error)

	return {
		"model": model,
		"classification": "error",
		"reasoning_before_answer": False,
		"response_text": "",
		"visible_thinking": "",
		"event_count": 0,
		"events": [],
		"elapsed_seconds": 0,
		"error": last_error or "Unknown chat failure.",
	}


def extract_tag(text: str, tag: str) -> str:
	match = re.search(rf"<{tag}>\s*(.*?)\s*</{tag}>", text, re.IGNORECASE | re.DOTALL)
	if not match:
		return ""
	return match.group(1).strip()


def parse_confidence(text: str, default: int = 50) -> int:
	match = re.search(r"-?\d+", text)
	if not match:
		return default
	return max(0, min(100, int(match.group(0))))


def parse_score(text: str, default: int = 0) -> int:
	match = re.search(r"-?\d+", text)
	if not match:
		return default
	return max(0, min(10, int(match.group(0))))


def parse_json_tag(text: str, tag: str) -> dict[str, Any]:
	raw_value = extract_tag(text, tag)
	if not raw_value:
		return {}
	try:
		parsed = json.loads(raw_value)
		return parsed if isinstance(parsed, dict) else {}
	except json.JSONDecodeError:
		return {}


def participant_system_prompt(participant: Participant) -> str:
	return (
		"You are one participant in a three-model collaboration focused on maximum correctness. "
		f"Your role is: {participant.role}. "
		"Be willing to change your mind when the evidence is against you. "
		"Follow the requested tags exactly. Keep claims explicit and check assumptions."
	)


def build_participants(model_ids: list[str] | None) -> list[Participant]:
	if not model_ids:
		return DEFAULT_COLLAB_PARTICIPANTS

	default_by_model = {participant.model: participant for participant in DEFAULT_COLLAB_PARTICIPANTS}
	participants: list[Participant] = []
	for index, model_id in enumerate(model_ids, start=1):
		if model_id in default_by_model:
			participants.append(default_by_model[model_id])
			continue
		alias = model_id.split("/", 1)[-1]
		participants.append(
			Participant(
				alias=f"Model {index}: {alias}",
				model=model_id,
				role="general debater focused on correctness and critical review",
			)
		)
	return participants


def build_independent_round_prompt(question: str) -> str:
	return f"""
Question:
{question}

Work independently first. Do not assume the other models are correct.

Return exactly these tags:
<draft_answer>the best answer you can currently justify</draft_answer>
<confidence>0-100</confidence>
<key_points>key evidence, derivation, or reasoning steps</key_points>
<uncertainties>open risks, assumptions, or possible failure points</uncertainties>
""".strip()


def build_self_critique_prompt(question: str, draft_text: str) -> str:
	return f"""
Question:
{question}

Your previous draft:
{draft_text}

Critique your own answer aggressively. Look for incorrect assumptions, arithmetic errors, missing edge cases, unsupported leaps, and ambiguity.

Return exactly these tags:
<self_critique>your strongest critique of your own draft</self_critique>
<confidence_after_self_critique>0-100</confidence_after_self_critique>
<repair_plan>how you would fix or strengthen the draft</repair_plan>
""".strip()


def format_peer_bundle(records: list[dict[str, Any]], answer_tag: str, critique_tag: str | None = None) -> str:
	chunks: list[str] = []
	for record in records:
		participant = record["participant"]
		parsed = record["parsed"]
		answer = parsed.get(answer_tag, "")
		chunks.append(f"{participant.alias} ({participant.model})")
		chunks.append(f"answer: {answer or record['raw_output']}")
		confidence = parsed.get("confidence") or parsed.get("confidence_after_self_critique")
		if confidence:
			chunks.append(f"confidence: {confidence}")
		if critique_tag:
			critique = parsed.get(critique_tag, "")
			if critique:
				chunks.append(f"critique: {critique}")
		chunks.append("")
	return "\n".join(chunks).strip()


def build_candidate_bundle(records: list[dict[str, Any]], answer_tag: str) -> tuple[str, dict[str, dict[str, Any]]]:
	lines: list[str] = []
	mapping: dict[str, dict[str, Any]] = {}
	for index, record in enumerate(records, start=1):
		candidate_id = f"C{index}"
		participant = record["participant"]
		answer = record["parsed"].get(answer_tag) or record.get("raw_output", "")
		mapping[candidate_id] = {
			"participant": participant,
			"record": record,
		}
		lines.append(f"{candidate_id}: {participant.alias} ({participant.model})")
		lines.append(f"answer: {answer}")
		confidence = record["parsed"].get("confidence")
		if confidence:
			lines.append(f"confidence: {confidence}")
		lines.append("")
	return "\n".join(lines).strip(), mapping


def build_cross_critique_prompt(
	question: str,
	participant: Participant,
	own_record: dict[str, Any],
	all_drafts: list[dict[str, Any]],
	self_critique: dict[str, Any],
) -> str:
	peer_records = [record for record in all_drafts if record["participant"].model != participant.model]
	peer_bundle = format_peer_bundle(peer_records, "draft_answer")
	return f"""
Question:
{question}

Your draft:
{own_record['raw_output']}

Your self-critique:
{self_critique['raw_output']}

Peer drafts:
{peer_bundle}

Critique the peer drafts. Focus on factual mistakes, flawed assumptions, missing cases, weak justifications, and places where a peer is stronger than you.

Return exactly these tags:
<peer_critique>your critique of the peer drafts</peer_critique>
<best_peer>one participant alias that currently has the strongest draft, or NONE</best_peer>
<what_you_missed>what the peers noticed that you may have missed</what_you_missed>
""".strip()


def build_revision_prompt(
	question: str,
	own_draft: dict[str, Any],
	self_critique: dict[str, Any],
	peer_critiques: list[dict[str, Any]],
) -> str:
	peer_bundle = format_peer_bundle(peer_critiques, "peer_critique")
	return f"""
Question:
{question}

Your original draft:
{own_draft['raw_output']}

Your self-critique:
{self_critique['raw_output']}

Peer feedback:
{peer_bundle}

Revise your answer for maximum correctness. Preserve good parts, remove bad parts, and resolve disagreements explicitly.

Return exactly these tags:
<revised_answer>your revised best answer</revised_answer>
<confidence>0-100</confidence>
<why_better>why this revised answer is stronger than your original draft</why_better>
""".strip()


def build_vote_prompt(question: str, revised_records: list[dict[str, Any]], audit_summary_text: str) -> str:
	revised_bundle, candidate_map = build_candidate_bundle(revised_records, "revised_answer")
	participant_names = " | ".join(candidate_map.keys())
	return f"""
Question:
{question}

Revised candidate answers:
{revised_bundle}

Audit summary:
{audit_summary_text}

Choose the strongest candidate answer, or choose MERGED if the best final answer should combine multiple candidates.

Valid selected_candidate values:
{participant_names} | MERGED

Return exactly these tags:
<selected_candidate>participant alias or MERGED</selected_candidate>
<final_answer>the answer you would ship to the user now</final_answer>
<confidence>0-100</confidence>
<rationale>why this candidate or merge is strongest</rationale>
""".strip()


def build_audit_prompt(question: str, revised_records: list[dict[str, Any]]) -> str:
	revised_bundle, candidate_map = build_candidate_bundle(revised_records, "revised_answer")
	candidate_list = ", ".join(candidate_map.keys())
	return f"""
Question:
{question}

Revised candidate answers:
{revised_bundle}

Audit every candidate independently. Score each one from 0 to 10 on:
- correctness
- completeness
- robustness

If you see a fatal flaw, say what it is. If not, use NONE.

Return exactly these tags:
<scorecard>{{"C1":{{"correctness":0,"completeness":0,"robustness":0,"fatal_flaw":"NONE"}},"C2":{{...}},"C3":{{...}}}}</scorecard>
<winner>one of {candidate_list}</winner>
<audit_summary>short explanation of which candidate is strongest and why</audit_summary>
""".strip()


def build_synthesis_prompt(
	question: str,
	revised_records: list[dict[str, Any]],
	audit_summary_text: str,
	vote_records: list[dict[str, Any]],
) -> str:
	revised_bundle = format_peer_bundle(revised_records, "revised_answer")
	vote_bundle = format_peer_bundle(vote_records, "final_answer")
	return f"""
Question:
{question}

Final revised answers:
{revised_bundle}

Audit summary:
{audit_summary_text}

Final votes:
{vote_bundle}

Produce the best final answer. Do not average weak answers together. Use the strongest supported reasoning, resolve conflicts, and be explicit if uncertainty remains.

Return exactly these tags:
<final_answer>best final answer for the user</final_answer>
<confidence>0-100</confidence>
<why_this_wins>why this final answer beats the alternatives</why_this_wins>
""".strip()


def parse_round_output(text: str, expected_tags: list[str]) -> dict[str, Any]:
	parsed: dict[str, Any] = {}
	for tag in expected_tags:
		parsed[tag] = extract_tag(text, tag)

	if "confidence" in parsed:
		parsed["confidence"] = parse_confidence(str(parsed["confidence"] or ""))
	if "confidence_after_self_critique" in parsed:
		parsed["confidence_after_self_critique"] = parse_confidence(
			str(parsed["confidence_after_self_critique"] or "")
		)
	if "winner" in parsed:
		parsed["winner"] = str(parsed["winner"] or "").strip().upper()
	if "selected_candidate" in parsed:
		parsed["selected_candidate"] = str(parsed["selected_candidate"] or "").strip().upper()
	if "scorecard" in expected_tags:
		parsed["scorecard"] = parse_json_tag(text, "scorecard")

	return parsed


def run_participant_round(
	api_key: str,
	participant: Participant,
	round_title: str,
	user_prompt: str,
	max_tokens: int,
	expected_tags: list[str],
	live_output: bool,
) -> dict[str, Any]:
	messages = [
		{"role": "system", "content": participant_system_prompt(participant)},
		{"role": "user", "content": user_prompt},
	]
	result = run_chat_with_strategies(
		api_key=api_key,
		model=participant.model,
		messages=messages,
		max_tokens=max_tokens,
		live_output=live_output,
		live_title=f"{round_title} / {participant.alias}",
	)
	result["participant"] = participant
	result["raw_output"] = result.get("response_text", "")
	result["parsed"] = parse_round_output(result.get("response_text", ""), expected_tags)
	return result


def summarize_round(round_name: str, records: list[dict[str, Any]], answer_key: str) -> None:
	print(round_name)
	print("-" * len(round_name))
	for record in records:
		participant = record["participant"]
		parsed = record["parsed"]
		answer = parsed.get(answer_key) or trim_preview(record.get("raw_output", ""), 180)
		confidence = parsed.get("confidence") or parsed.get("confidence_after_self_critique") or "-"
		print(f"- {participant.alias} | confidence={confidence} | {trim_preview(str(answer), 180)}")
	print()


def score_candidate_entry(entry: dict[str, Any]) -> int:
	correctness = parse_score(str(entry.get("correctness", "0")))
	completeness = parse_score(str(entry.get("completeness", "0")))
	robustness = parse_score(str(entry.get("robustness", "0")))
	fatal_flaw = str(entry.get("fatal_flaw", "")).strip().upper()
	penalty = 6 if fatal_flaw and fatal_flaw != "NONE" else 0
	return correctness * 3 + completeness * 2 + robustness * 2 - penalty


def aggregate_audit_scores(
	audit_records: list[dict[str, Any]],
	revised_records: list[dict[str, Any]],
) -> tuple[dict[str, int], dict[str, list[str]], str]:
	candidate_bundle, candidate_map = build_candidate_bundle(revised_records, "revised_answer")
	_ = candidate_bundle
	totals = {candidate_id: 0 for candidate_id in candidate_map}
	fatal_flaws = {candidate_id: [] for candidate_id in candidate_map}

	for record in audit_records:
		scorecard = record["parsed"].get("scorecard", {})
		if not isinstance(scorecard, dict):
			continue
		for candidate_id, entry in scorecard.items():
			if candidate_id not in totals or not isinstance(entry, dict):
				continue
			totals[candidate_id] += score_candidate_entry(entry)
			fatal_flaw = str(entry.get("fatal_flaw", "")).strip()
			if fatal_flaw and fatal_flaw.upper() != "NONE":
				fatal_flaws[candidate_id].append(fatal_flaw)

	best_candidate = max(totals, key=lambda key: totals[key]) if totals else "UNKNOWN"
	lines = ["Aggregated audit scores:"]
	for candidate_id, total in sorted(totals.items(), key=lambda item: item[1], reverse=True):
		participant = candidate_map[candidate_id]["participant"]
		lines.append(f"- {candidate_id} ({participant.alias}): {total}")
		if fatal_flaws[candidate_id]:
			lines.append(f"  fatal_flaws: {' | '.join(fatal_flaws[candidate_id][:3])}")
	lines.append(f"Best audit candidate: {best_candidate}")
	return totals, fatal_flaws, "\n".join(lines)


def determine_vote_winner(vote_records: list[dict[str, Any]]) -> tuple[str, dict[str, int]]:
	vote_counts: dict[str, int] = {}
	for record in vote_records:
		selected = str(record["parsed"].get("selected_candidate", "")).strip() or "UNKNOWN"
		vote_counts[selected] = vote_counts.get(selected, 0) + 1

	best_choice = "UNKNOWN"
	best_count = -1
	for choice, count in vote_counts.items():
		if count > best_count:
			best_choice = choice
			best_count = count

	return best_choice, vote_counts


def collab_command(args: argparse.Namespace) -> int:
	api_key = args.api_key or os.environ.get("OPENROUTER_API_KEY")
	if not api_key:
		print(
			"An API key is required. Pass --api-key or set OPENROUTER_API_KEY.",
			file=sys.stderr,
		)
		return 1

	participants = build_participants(args.models)
	question = args.prompt
	candidate_bundle_preview, candidate_map = build_candidate_bundle(
		[{"participant": participant, "parsed": {"revised_answer": "[pending]"}, "raw_output": ""} for participant in participants],
		"revised_answer",
	)
	_ = candidate_bundle_preview
	judge_model = args.judge_model or participants[0].model
	judge_participant = Participant(
		alias="Final Judge",
		model=judge_model,
		role="final synthesis judge focused on selecting the most correct answer from the debate",
	)

	print("Collaboration Method")
	print("--------------------")
	print("1. Independent draft")
	print("2. Self-critique")
	print("3. Cross-critique")
	print("4. Revision")
	print("5. Adversarial audit")
	print("6. Final vote")
	print("7. Judge synthesis")
	print()
	print("Candidate IDs")
	print("-------------")
	for candidate_id, candidate_info in candidate_map.items():
		participant = candidate_info["participant"]
		print(f"- {candidate_id}: {participant.alias} [{participant.model}]")
	print()

	draft_records = [
		run_participant_round(
			api_key=api_key,
			participant=participant,
			round_title="Round 1 Independent Draft",
			user_prompt=build_independent_round_prompt(question),
			max_tokens=700,
			expected_tags=["draft_answer", "confidence", "key_points", "uncertainties"],
			live_output=True,
		)
		for participant in participants
	]
	summarize_round("Round 1 Summary", draft_records, "draft_answer")

	self_critique_records = [
		run_participant_round(
			api_key=api_key,
			participant=participant,
			round_title="Round 2 Self Critique",
			user_prompt=build_self_critique_prompt(question, draft_record["raw_output"]),
			max_tokens=500,
			expected_tags=["self_critique", "confidence_after_self_critique", "repair_plan"],
			live_output=True,
		)
		for participant, draft_record in zip(participants, draft_records, strict=False)
	]
	summarize_round("Round 2 Summary", self_critique_records, "self_critique")

	cross_critique_records = [
		run_participant_round(
			api_key=api_key,
			participant=participant,
			round_title="Round 3 Cross Critique",
			user_prompt=build_cross_critique_prompt(
				question=question,
				participant=participant,
				own_record=draft_record,
				all_drafts=draft_records,
				self_critique=self_record,
			),
			max_tokens=650,
			expected_tags=["peer_critique", "best_peer", "what_you_missed"],
			live_output=True,
		)
		for participant, draft_record, self_record in zip(
			participants,
			draft_records,
			self_critique_records,
			strict=False,
		)
	]
	summarize_round("Round 3 Summary", cross_critique_records, "peer_critique")

	revised_records = [
		run_participant_round(
			api_key=api_key,
			participant=participant,
			round_title="Round 4 Revision",
			user_prompt=build_revision_prompt(
				question=question,
				own_draft=draft_record,
				self_critique=self_record,
				peer_critiques=cross_critique_records,
			),
			max_tokens=800,
			expected_tags=["revised_answer", "confidence", "why_better"],
			live_output=True,
		)
		for participant, draft_record, self_record in zip(
			participants,
			draft_records,
			self_critique_records,
			strict=False,
		)
	]
	summarize_round("Round 4 Summary", revised_records, "revised_answer")

	audit_records = [
		run_participant_round(
			api_key=api_key,
			participant=participant,
			round_title="Round 5 Adversarial Audit",
			user_prompt=build_audit_prompt(question, revised_records),
			max_tokens=900,
			expected_tags=["scorecard", "winner", "audit_summary"],
			live_output=True,
		)
		for participant in participants
	]
	summarize_round("Round 5 Summary", audit_records, "audit_summary")
	audit_totals, audit_fatal_flaws, audit_summary_text = aggregate_audit_scores(
		audit_records,
		revised_records,
	)
	print("Audit Tally")
	print("-----------")
	print(audit_summary_text)
	print()

	vote_records = [
		run_participant_round(
			api_key=api_key,
			participant=participant,
			round_title="Round 6 Final Vote",
			user_prompt=build_vote_prompt(question, revised_records, audit_summary_text),
			max_tokens=650,
			expected_tags=["selected_candidate", "final_answer", "confidence", "rationale"],
			live_output=True,
		)
		for participant in participants
	]
	summarize_round("Round 6 Summary", vote_records, "final_answer")

	vote_winner, vote_counts = determine_vote_winner(vote_records)
	print("Vote Tally")
	print("----------")
	for candidate, count in vote_counts.items():
		print(f"- {candidate}: {count}")
	print()

	judge_record = run_participant_round(
		api_key=api_key,
		participant=judge_participant,
		round_title="Round 7 Judge Synthesis",
		user_prompt=build_synthesis_prompt(question, revised_records, audit_summary_text, vote_records),
		max_tokens=900,
		expected_tags=["final_answer", "confidence", "why_this_wins"],
		live_output=True,
	)

	print("Final Answer")
	print("------------")
	print(f"judge_model: {judge_model}")
	print(f"best_audit_candidate: {max(audit_totals, key=lambda key: audit_totals[key]) if audit_totals else 'UNKNOWN'}")
	print(f"vote_winner: {vote_winner}")
	print(f"confidence: {judge_record['parsed'].get('confidence', '-')}")
	print(judge_record["parsed"].get("final_answer") or judge_record.get("raw_output", ""))
	print()
	print("Why This Won")
	print("------------")
	print(judge_record["parsed"].get("why_this_wins") or "")

	return 0


def stream_probe_request(
	api_key: str,
	model: str,
	prompt: str,
	include_reasoning: bool,
	include_summary: bool,
	live_output: bool = False,
) -> dict[str, Any]:
	request = urllib.request.Request(
		OPENROUTER_CHAT_URL,
		data=build_probe_payload(model, prompt, include_reasoning, include_summary),
		headers=request_headers(api_key),
		method="POST",
	)

	events: list[dict[str, Any]] = []
	content_fragments: list[str] = []
	top_level_reasoning_fragments: list[str] = []
	raw_reasoning_fragments: list[str] = []
	summary_fragments: list[str] = []
	encrypted_count = 0
	first_reasoning_index: int | None = None
	first_content_index: int | None = None
	phase: str | None = None
	start_time = time.perf_counter()
	printed_thinking_header = False
	printed_output_header = False
	printed_protected_notice = False
	printed_reasoning_text = False
	printed_summary_text = False
	if live_output:
		print(f"=== {model} ===", flush=True)
		print("thinking", flush=True)
		printed_thinking_header = True

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
				if live_output:
					if not printed_output_header:
						print("output", flush=True)
						printed_output_header = True
					emit_live_line(content_text)
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
				top_level_reasoning_fragments.append(reasoning_text)
				if live_output:
					if not printed_thinking_header:
						print("thinking", flush=True)
						printed_thinking_header = True
					if not printed_reasoning_text and not printed_summary_text:
						emit_live_line(reasoning_text)
						printed_summary_text = True
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
							raw_reasoning_fragments.append(text_value)
							if live_output:
								if not printed_thinking_header:
									print("thinking", flush=True)
									printed_thinking_header = True
								emit_live_line(text_value)
								printed_reasoning_text = True
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
							if live_output:
								if not printed_thinking_header:
									print("thinking", flush=True)
									printed_thinking_header = True
								if not printed_reasoning_text:
									emit_live_line(summary_value)
									printed_summary_text = True
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
						if live_output:
							if not printed_thinking_header:
								print("thinking", flush=True)
								printed_thinking_header = True
							if not printed_reasoning_text and not printed_summary_text and not printed_protected_notice:
								emit_live_line("[provider exposes protected reasoning only]")
								printed_protected_notice = True
						if first_reasoning_index is None:
							first_reasoning_index = len(events)
						events.append(
							{
								"type": "reasoning.encrypted",
								"preview": "encrypted reasoning block",
							}
						)

	elapsed = time.perf_counter() - start_time
	if live_output and not printed_reasoning_text and not printed_summary_text and not printed_protected_notice:
		emit_live_line("[no separate thinking stream exposed]")
	if live_output and not printed_output_header:
		print("output", flush=True)
		if response_text := "".join(content_fragments).strip():
			emit_live_line(response_text)
	print(flush=True) if live_output else None

	response_text = "".join(content_fragments).strip()
	top_level_reasoning_text = "".join(top_level_reasoning_fragments).strip()
	raw_reasoning_text = "".join(raw_reasoning_fragments).strip()
	summary_text = " ".join(fragment.strip() for fragment in summary_fragments if fragment.strip())

	classification = "no_reasoning_exposed"
	if raw_reasoning_text:
		classification = "COT"
	elif summary_text and encrypted_count > 0:
		classification = "protected_summary"
	elif summary_text:
		classification = "summary_only"
	elif top_level_reasoning_text:
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
		"reasoning_preview": trim_preview(raw_reasoning_text) if raw_reasoning_text else "",
		"top_level_reasoning_preview": trim_preview(top_level_reasoning_text)
		if top_level_reasoning_text
		else "",
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
				live_output=False,
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


def live_model(api_key: str, model: str, prompt: str) -> dict[str, Any]:
	strategies = [
		{"include_reasoning": True, "include_summary": True, "label": "reasoning+detailed-summary"},
		{"include_reasoning": True, "include_summary": False, "label": "reasoning+auto-summary"},
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
				live_output=True,
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
		"error": last_error or "Unknown live probe failure.",
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
	if result.get("top_level_reasoning_preview"):
		print(f"  top_level_reasoning_preview: {result['top_level_reasoning_preview']}")
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


def live_models_command(args: argparse.Namespace) -> int:
	api_key = args.api_key or os.environ.get("OPENROUTER_API_KEY")
	if not api_key:
		print(
			"An API key is required. Pass --api-key or set OPENROUTER_API_KEY.",
			file=sys.stderr,
		)
		return 1

	models = args.models or DEFAULT_PROBE_MODELS
	results: list[dict[str, Any]] = []
	for model in models:
		result = live_model(api_key=api_key, model=model, prompt=args.prompt)
		results.append(result)
		print_probe_result(result)

	print("Summary")
	print("-------")
	for result in results:
		print(
			f"- {result['model']} | {result.get('classification', '-')} | reasoning_before_answer={result.get('reasoning_before_answer', False)}"
		)
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

	live_parser = subparsers.add_parser("live", help="Stream reasoning and answer text live to the terminal.")
	live_parser.add_argument("--api-key", help="OpenRouter API key. Prefer OPENROUTER_API_KEY.")
	live_parser.add_argument(
		"--models",
		nargs="+",
		help="Specific models to stream live.",
	)
	live_parser.add_argument(
		"--prompt",
		default=DEFAULT_PROMPT,
		help="Prompt used to trigger reasoning with a short final answer.",
	)
	live_parser.set_defaults(handler=live_models_command)

	collab_parser = subparsers.add_parser(
		"collab",
		help="Run a multi-round debate across three models and synthesize a final answer.",
	)
	collab_parser.add_argument("--api-key", help="OpenRouter API key. Prefer OPENROUTER_API_KEY.")
	collab_parser.add_argument(
		"--models",
		nargs="+",
		help="Optional custom participant model IDs. Defaults to GPT-5.4, Gemini 3.1, and Grok 4.",
	)
	collab_parser.add_argument(
		"--judge-model",
		help="Optional final synthesis model. Defaults to the first participant model.",
	)
	collab_parser.add_argument(
		"--prompt",
		required=True,
		help="The user question or task for the collaboration run.",
	)
	collab_parser.set_defaults(handler=collab_command)

	parser.set_defaults(command="list", handler=list_models_command, all_reasoning=False)
	return parser.parse_args()


def main() -> int:
	args = parse_args()
	return args.handler(args)


if __name__ == "__main__":
	raise SystemExit(main())

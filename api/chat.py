"""
Vela — Wave 3: Claude API real com SSE streaming
Decision 0089: zero retention (sem logar prompts/responses)
Decision 0085: desktop-only (sem validações mobile)
"""
import json
import os
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler

import anthropic

# ---------------------------------------------------------------------------
# Env vars (injetadas pelo Vercel em runtime)
# ---------------------------------------------------------------------------
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
VELA_CLAUDE_MODEL = os.environ.get("VELA_CLAUDE_MODEL", "claude-haiku-4-5-20251001")
ANTHROPIC_MAX_TOKENS = int(os.environ.get("ANTHROPIC_MAX_TOKENS", "1024"))

# ---------------------------------------------------------------------------
# System prompts condensados por project_id (~400 tokens cada)
# Derivados dos MANDATOs Norte + Manifesto Comunicação v1.2 Seção VIII
# HARDCODED enum — sem LLM classifier (zero custo extra, zero latência)
# ---------------------------------------------------------------------------
_BASE_NORTE = """Você é Vela, assistente de projetos Norte.
Norte é uma holding de produtos digitais (alerta-imoveis, simples-report, preco-alerta, isenção IR, Vela).
Regras de comunicação obrigatórias (Manifesto Norte v1.2):
- Plain language T1: sem jargão técnico, sem inglês desnecessário, sem siglas sem definir
- Tom adulto: sem "Ótima pergunta!", sem elogios vazios, sem enrolação
- Conciso: responda o que foi perguntado, pare quando terminar
- Transparente: se não souber, diga. Nunca invente dados, métricas ou decisões
- Glossário obrigatório: PR = "atualização de código", commit = não mencionar, Phase 1 = "execução autônoma", NSM = "número de cadastros", smoke = "teste rápido"
- Decisões referem-se ao sistema Norte (ex: "Decision 0089 = decisão de não guardar conversas no servidor")
"""

SYSTEM_PROMPTS = {
    "ada": _BASE_NORTE + """
Competência: Operações e Segurança (você é Ada).
Foco: saúde técnica de produtos, deploy, CI/CD, segurança de dependências, QA automatizado, endpoints HTTP, tracking de engajamento.
Você sabe ler erros de código, propor correções precisas, e explicar problemas técnicos em linguagem simples.
Limites: não toca em copy/conteúdo (Leo), não decide sprint/produto (Max), não valida finanças (Val).
""",

    "leo": _BASE_NORTE + """
Competência: Crescimento e Comunicação (você é Leo).
Foco: copy, SEO, conteúdo editorial, tom de voz, landing pages, blog, manifesto Norte, conformidade Provimento 205 OAB.
Você ajuda a escrever textos que convertem sem enganar, usando dados reais e linguagem clara.
Limites: não toca em infraestrutura (Ada), não decide produto (Max), não valida finanças (Val).
""",

    "max": _BASE_NORTE + """
Competência: Produto e Decisões (você é Max).
Foco: planejamento de sprints, priorização, killing review de experimentos, decisões táticas, coordenação entre agentes.
Você ajuda a definir o que fazer, quando fazer, e o que abandonar com base em dados reais.
Limites: não toca em infraestrutura (Ada), não escreve copy (Leo), não valida finanças (Val).
""",

    "val": _BASE_NORTE + """
Competência: Qualidade e Validação (você é Val).
Foco: QA, testes, métricas, killing review quantitativa, detecção de drift, validação de experimentos, anti-Goodhart.
Você mede o que importa, detecta quando algo não está funcionando, e propõe critérios de sucesso verificáveis.
Limites: não toca em infraestrutura (Ada), não escreve copy (Leo), não decide produto (Max).
""",

    "default-norte": _BASE_NORTE + """
Você responde como Vela, assistente geral do Norte, sem persona específica de agente.
Ajuda com qualquer dúvida sobre os projetos Norte, decisões, produtos, ou operação.
Se a pergunta for muito técnica (Ada), editorial (Leo), estratégica (Max), ou de validação (Val),
mencione qual agente seria mais adequado — mas responda o que puder agora.
""",
}

# ---------------------------------------------------------------------------
# Token usage logger — Decision 0084 pattern
# Zero retention: loga SOMENTE metadados, NUNCA conteúdo de prompts/responses
# ---------------------------------------------------------------------------
_LOG_PATH = "/tmp/vela_token_usage.jsonl"  # /tmp no Vercel serverless (ephemeral)


def _log_usage(model: str, input_tokens: int, output_tokens: int) -> None:
    try:
        entry = {
            "ts": datetime.utcnow().isoformat() + "Z",
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }
        with open(_LOG_PATH, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass  # never crash on logging


# ---------------------------------------------------------------------------
# Vercel serverless handler
# ---------------------------------------------------------------------------
class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Parse body
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            self._json_error(400, "body JSON inválido")
            return

        message = (body.get("message") or "").strip()
        history = body.get("history_last_n") or []
        project_id = (body.get("project_id") or "default-norte").strip()

        if not message:
            self._json_error(400, "message obrigatório")
            return

        if not ANTHROPIC_API_KEY:
            self._json_error(500, "ANTHROPIC_API_KEY não configurada")
            return

        # Resolve system prompt
        system_prompt = SYSTEM_PROMPTS.get(project_id, SYSTEM_PROMPTS["default-norte"])

        # Build messages: history (last 20) + user message
        messages = []
        for m in history[-20:]:
            role = m.get("role", "")
            text = m.get("text", "")
            if role in ("user", "assistant") and text:
                messages.append({"role": role, "content": text})
        messages.append({"role": "user", "content": message})

        # SSE headers
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        input_tokens = 0
        output_tokens = 0

        try:
            with client.messages.stream(
                model=VELA_CLAUDE_MODEL,
                max_tokens=ANTHROPIC_MAX_TOKENS,
                system=system_prompt,
                messages=messages,
            ) as stream:
                for text_chunk in stream.text_stream:
                    self._sse_write("chunk", text_chunk)

                # Capture usage after stream completes
                final = stream.get_final_message()
                if final and final.usage:
                    input_tokens = final.usage.input_tokens
                    output_tokens = final.usage.output_tokens

            self._sse_write("done", "")
        except anthropic.APIStatusError as e:
            self._sse_write("error", str(e.message)[:200])
        except Exception as e:
            self._sse_write("error", "Erro interno. Tente novamente.")

        _log_usage(VELA_CLAUDE_MODEL, input_tokens, output_tokens)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _sse_write(self, event: str, data: str) -> None:
        try:
            payload = f"event: {event}\ndata: {json.dumps(data)}\n\n"
            self.wfile.write(payload.encode("utf-8"))
            self.wfile.flush()
        except Exception:
            pass

    def _json_error(self, status: int, msg: str) -> None:
        body = json.dumps({"error": msg}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

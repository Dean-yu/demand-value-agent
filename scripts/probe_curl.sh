#!/bin/bash
# 用 curl 探测 idealab：固定 prompt 大小 + 不同 max_tokens / response_format，看什么会触发 "Prompt is too long"
set -u

API_KEY="$(grep '^LLM_API_KEY' /Users/dean/demand-value-agent/.env.local | cut -d= -f2)"
BASE_URL="https://idealab.alibaba-inc.com/api/openai/v1/chat/completions"
MODEL="claude-opus-4-7"

probe() {
  local label="$1"
  local prompt_chars="$2"
  local with_json_fmt="$3"
  local max_tokens="$4"

  # 在 python 里造一个大 prompt（一定要有合法 JSON，否则也会失败）
  local prompt_text
  prompt_text=$(python3 -c "import sys; n=$prompt_chars; print('请输出 JSON {\"ok\":true}\\n' + '评测PU'*((n-30)//4))")

  local body
  if [ "$with_json_fmt" = "1" ]; then
    body=$(python3 -c "
import json,sys
print(json.dumps({
  'model': '$MODEL',
  'messages': [
    {'role':'system','content':'请严格输出 JSON。'},
    {'role':'user','content': sys.stdin.read()}
  ],
  'max_tokens': $max_tokens,
  'response_format': {'type':'json_object'}
}, ensure_ascii=False))
" <<< "$prompt_text")
  else
    body=$(python3 -c "
import json,sys
print(json.dumps({
  'model': '$MODEL',
  'messages': [
    {'role':'system','content':'请严格输出 JSON。'},
    {'role':'user','content': sys.stdin.read()}
  ],
  'max_tokens': $max_tokens
}, ensure_ascii=False))
" <<< "$prompt_text")
  fi

  printf "[probe] %-25s chars=%-7d jsonFmt=%s max_tokens=%-6d -> " "$label" "$prompt_chars" "$with_json_fmt" "$max_tokens"
  local resp
  resp=$(curl -s -X POST "$BASE_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d "$body")
  # 看是不是返回了错误（error / message:"... too long"）
  if echo "$resp" | grep -q '"error"'; then
    echo "ERROR: $(echo "$resp" | head -c 250)"
  elif echo "$resp" | grep -qi 'too long\|prompt is too\|context length\|max.*tokens'; then
    echo "LENGTH: $(echo "$resp" | head -c 250)"
  else
    local usage
    usage=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('usage',{}))" 2>/dev/null || echo "n/a")
    echo "OK usage=$usage"
  fi
}

probe "tiny+no-fmt"      200    0 1000
probe "tiny+json"        200    1 1000
probe "5k+json"          5000   1 1000
probe "10k+json"         10000  1 1000
probe "20k+json"         20000  1 1000
probe "10k+json+8k-out"  10000  1 8000
probe "30k+json"         30000  1 1000
probe "60k+json"         60000  1 1000
probe "120k+json"        120000 1 1000
probe "200k+json"        200000 1 1000

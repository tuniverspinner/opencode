#!/usr/bin/env bash
set -euo pipefail
# Boot benchmark — measures CYF cold-start time.
# Without SSH:  CYF_BIN=~/.local/bin/cyf ./script/boot-bench.sh
# With SSH:     ./script/boot-bench.sh                    (uses shell wrapper via zsh -l -c 'cyf')

CYF_CMD="${CYF_BIN:-cyf}"
MODEL="${CYF_BENCH_MODEL:-deepseek/deepseek-v4-flash}"
RUNS="${CYF_BENCH_RUNS:-5}"
WARMUP="${CYF_BENCH_WARMUP:-2}"
TIMES=""

if [[ "$CYF_CMD" == /* ]]; then
  echo "boot-bench: raw binary (no shell wrapper)"
  SHELL_CMD='exec "$1" run --agent build --format json --pure -m "$2" "reply: ok"'
else
  echo "boot-bench: via shell wrapper (includes key bridge)"
  SHELL_CMD='cyf run --agent build --format json --pure -m "$2" "reply: ok"'
fi
echo "model: $MODEL  warmup: $WARMUP  runs: $RUNS"
echo ""

for ((i=1; i<=WARMUP+RUNS; i++)); do
  prefix="warmup"; if [ $i -gt $WARMUP ]; then prefix="run"; fi
  label="$prefix $(( i > WARMUP ? i-WARMUP : i ))/$(( i > WARMUP ? RUNS : WARMUP ))"

  start=$(python3 -c "import time; print(int(time.time()*1000))")
  step=$(
    if [[ "$CYF_CMD" == /* ]]; then
      exec "$CYF_CMD" run --agent build --format json --pure -m "$MODEL" "reply: ok" 2>/dev/null | head -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['timestamp'])"
    else
      zsh -l -c 'cyf run --agent build --format json --pure -m '"'$MODEL'"' "reply: ok" 2>/dev/null' | head -1 | python3 -c "import sys,json; print(json.load(sys.stdin)['timestamp'])"
    fi
  )
  boot=$((step - start))
  echo "  $label  ${boot}ms"
  if [ $i -gt $WARMUP ]; then TIMES="$TIMES $boot"; fi
  sleep 0.5
done

echo ""
python3 -c "
t=sorted([int(x) for x in '$TIMES'.split()])
n=len(t)
if n<3: exit('need >=3 runs')
print(f'  avg: {sum(t)//n}ms  min: {min(t)}ms  max: {max(t)}ms  median: {t[n//2]}ms  n={n}')
"

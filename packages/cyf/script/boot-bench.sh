#!/usr/bin/env bash
set -euo pipefail
# Boot benchmark — measures CYF cold-start time.
# Measures wall-clock start → first step_start JSON event timestamp.
# Model latency is excluded (process is killed as soon as the first line arrives).
#
# Env vars:
#   CYF_BIN   path to cyf binary  (default: ~/.local/bin/cyf)
#   MODEL     model id            (default: deepseek/deepseek-v4-flash)
#   RUNS      measured runs       (default: 5)
#   WARMUP    warmup runs         (default: 2)
#   SSH_RUNS  shell-wrapper runs  (default: 3)
#   CYF_MODE  phase selection     (default: raw)
#             raw — only raw binary phase (warmup + measured runs)
#             ssh — only shell wrapper phase (no warmup, cold key-bridge cost)
#             all — both phases in one run

CYF_BIN="${CYF_BIN:-$HOME/.local/bin/cyf}"
MODEL="${MODEL:-deepseek/deepseek-v4-flash}"
RUNS="${RUNS:-5}"
WARMUP="${WARMUP:-2}"
SSH_RUNS="${SSH_RUNS:-3}"
CYF_MODE="${CYF_MODE:-raw}"

python3 - "$CYF_BIN" "$MODEL" "$RUNS" "$WARMUP" "$SSH_RUNS" "$CYF_MODE" <<'PYEOF'
import sys, os, subprocess, time, json, signal, select, statistics, shlex

cyf_bin  = os.path.expanduser(sys.argv[1])
model    = sys.argv[2]
runs     = int(sys.argv[3])
warmup   = int(sys.argv[4])
ssh_runs = int(sys.argv[5])
mode     = sys.argv[6]

if mode not in ("raw", "ssh", "all"):
    print(f"error: invalid CYF_MODE={mode!r} (expected: raw, ssh, all)", file=sys.stderr)
    sys.exit(1)

if mode in ("raw", "all") and not os.path.isfile(cyf_bin):
    print(f"error: cyf binary not found: {cyf_bin}", file=sys.stderr)
    sys.exit(1)

TIMEOUT_SEC    = 30
POLL_INTERVAL  = 0.01   # 10 ms
KILL_GRACE_SEC = 5


def kill_proc(proc):
    """Terminate the process group, then reap. SIGTERM → SIGKILL fallback."""
    if proc.poll() is not None:
        return
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.terminate()
        except OSError:
            pass
    try:
        proc.wait(timeout=KILL_GRACE_SEC)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.kill()
        except OSError:
            pass
    try:
        proc.wait(timeout=KILL_GRACE_SEC)
    except subprocess.TimeoutExpired:
        pass


def run_once(cmd):
    """Start a fresh process with the given command, capture first JSON line's
    timestamp.

    Returns boot_ms = first_event_timestamp - wall_clock_start_ms.
    """
    start_ms = int(time.time() * 1000)

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        start_new_session=True,   # own process group → clean kill of children
    )

    try:
        fd         = proc.stdout.fileno()
        buf        = b""
        first_line = None
        deadline   = time.time() + TIMEOUT_SEC

        while time.time() < deadline:
            remaining = deadline - time.time()
            if remaining <= 0:
                break

            readable, _, _ = select.select([fd], [], [],
                                            min(POLL_INTERVAL, remaining))

            if readable:
                try:
                    chunk = os.read(fd, 8192)
                except OSError:
                    chunk = b""
                if chunk:
                    buf += chunk
                    nl = buf.find(b"\n")
                    if nl >= 0:
                        first_line = buf[:nl].decode("utf-8", errors="replace").strip()
                        break
                else:
                    # EOF — stdout closed
                    if buf:
                        first_line = buf.decode("utf-8", errors="replace").strip()
                    break

            elif proc.poll() is not None:
                # Process exited between polls — drain remaining output
                try:
                    chunk = os.read(fd, 8192)
                except OSError:
                    chunk = b""
                if chunk:
                    buf += chunk
                if buf:
                    first_line = buf.decode("utf-8", errors="replace").split("\n")[0].strip()
                break

        if not first_line:
            raise RuntimeError("process produced no output within timeout")

        event = json.loads(first_line)
        if "timestamp" not in event:
            raise RuntimeError(
                f"first JSON event has no 'timestamp' field (type={event.get('type', '?')})"
            )
        return event["timestamp"] - start_ms

    finally:
        kill_proc(proc)
        try:
            proc.stdout.close()
        except Exception:
            pass


def run_phase(name, cmd, n_warmup, n_runs):
    """Run warmup + measured runs for one phase. Returns list of measured boot_ms."""
    bar = "─" * max(0, 64 - len(name))
    print(f"── {name} {bar}")
    times = []
    total = n_warmup + n_runs
    for i in range(1, total + 1):
        is_warmup = i <= n_warmup
        label     = f"warmup {i}/{n_warmup}" if is_warmup else f"run {i - n_warmup}/{n_runs}"

        try:
            boot = run_once(cmd)
            print(f"  {label}  {boot}ms")
            sys.stdout.flush()
            if not is_warmup:
                times.append(boot)
        except Exception as e:
            print(f"  {label}  ERROR: {e}", file=sys.stderr)
            sys.stderr.flush()

        time.sleep(0.3)

    print()
    return times


def summarize(name, times):
    if not times:
        print(f"  [{name}] no valid runs")
        return False
    avg = sum(times) // len(times)
    mn  = min(times)
    mx  = max(times)
    med = int(statistics.median(times))
    print(f"  [{name}] avg: {avg}ms  min: {mn}ms  max: {mx}ms  median: {med}ms  n={len(times)}")
    return True


# ── Command builders ──────────────────────────────────────────────────
raw_cmd = [cyf_bin, "run", "--agent", "build", "--format", "json", "--pure",
           "-m", model, "reply: ok"]

ssh_cmd_str = (f"cyf run --agent build --format json --pure "
               f"-m {shlex.quote(model)} {shlex.quote('reply: ok')}")
ssh_cmd = ["zsh", "-l", "-c", ssh_cmd_str]

# ── Main ──────────────────────────────────────────────────────────────
do_raw = mode in ("raw", "all")
do_ssh = mode in ("ssh", "all")

print(f"boot-bench  mode={mode}  model={model}")
if do_raw:
    print(f"  raw phase:  warmup={warmup}  runs={runs}  bin={cyf_bin}")
if do_ssh:
    print(f"  ssh phase:  runs={ssh_runs}  (no warmup — cold key-bridge cost)")
print()

phases = []

if do_raw:
    times = run_phase("Phase 1 — Raw binary", raw_cmd, warmup, runs)
    phases.append(("Raw binary", times))

if do_ssh:
    if do_raw:
        print()
    times = run_phase("Phase 2 — Shell wrapper (zsh -l -c)", ssh_cmd, 0, ssh_runs)
    phases.append(("Shell wrapper", times))

# ── Summary ───────────────────────────────────────────────────────────
print("══ Summary " + "═" * 53)
any_valid = False
for name, times in phases:
    any_valid = summarize(name, times) or any_valid

if not any_valid:
    print("  no valid runs in any phase", file=sys.stderr)
    sys.exit(1)
PYEOF

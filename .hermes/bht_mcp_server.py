#!/usr/bin/env python3
"""
BHT Supabase MCP Server — zero-dependency, pure stdlib.
Implements MCP JSON-RPC 2.0 over stdio.

Configure in ~/.hermes/config.yaml:
  mcp_servers:
    bht:
      command: "python3"
      args: ["/root/workspace/bht/.hermes/bht_mcp_server.py"]
      env:
        BHT_SUPABASE_URL: "https://<your-project>.supabase.co"
        BHT_SUPABASE_ANON_KEY: "<your-anon-key>"
        BHT_USER: "<driver-email>"
        BHT_PASSWORD: "<driver-password>"
"""

import sys, os, json, urllib.request, urllib.error, time

# ── Config ──────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("BHT_SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("BHT_SUPABASE_ANON_KEY", "")
BHT_USER = os.environ.get("BHT_USER", "")
BHT_PASSWORD = os.environ.get("BHT_PASSWORD", "")

# ── Auth cache ──────────────────────────────────────────────────
_access_token: str = ""
_token_expires: float = 0


def _login() -> str:
    global _access_token, _token_expires
    now = time.time()
    if _access_token and now < _token_expires - 60:
        return _access_token
    if not BHT_USER or not BHT_PASSWORD:
        return SUPABASE_ANON_KEY
    req = urllib.request.Request(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        data=json.dumps({"email": BHT_USER, "password": BHT_PASSWORD}).encode(),
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read())
        _access_token = data["access_token"]
        _token_expires = now + data.get("expires_in", 3600)
    except Exception:
        _access_token = SUPABASE_ANON_KEY
    return _access_token


# ── API helper ──────────────────────────────────────────────────
def _supabase(path: str, method: str = "GET", body: dict = None) -> dict:
    token = _login()
    headers = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        content = resp.read().decode()
        return {"ok": True, "data": json.loads(content) if content else []}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"HTTP {e.code}: {e.read().decode()[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


# ── Tool definitions ────────────────────────────────────────────
TOOLS = [
    {
        "name": "bht_drivers",
        "description": "列出所有司机及其信息（姓名、电话、状态、欠款等）",
        "inputSchema": {"type": "object", "properties": {"limit": {"type": "integer", "default": 50}}},
    },
    {
        "name": "bht_transactions",
        "description": "列出交易记录。可按司机ID、日期范围筛选。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "driver_id": {"type": "string"},
                "from_date": {"type": "string", "description": "ISO日期，如 2026-05-01"},
                "to_date": {"type": "string"},
                "limit": {"type": "integer", "default": 50},
            },
        },
    },
    {
        "name": "bht_settlements",
        "description": "列出日结算记录。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "driver_id": {"type": "string"},
                "limit": {"type": "integer", "default": 20},
            },
        },
    },
    {
        "name": "bht_payrolls",
        "description": "列出月工资单。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "driver_id": {"type": "string"},
                "limit": {"type": "integer", "default": 20},
            },
        },
    },
    {
        "name": "bht_locations",
        "description": "列出所有点位/机器。",
        "inputSchema": {"type": "object", "properties": {"limit": {"type": "integer", "default": 50}}},
    },
    {
        "name": "bht_profiles",
        "description": "列出用户档案。可按角色筛选。",
        "inputSchema": {
            "type": "object",
            "properties": {
                "role": {"type": "string", "description": "driver, agent, admin"},
                "limit": {"type": "integer", "default": 20},
            },
        },
    },
    {
        "name": "bht_stats",
        "description": "获取系统统计概览：司机数、交易数、点位数的汇总。",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "bht_raw_query",
        "description": "执行原始 Supabase REST 查询。参数 path 追加到 /rest/v1/ 后面。",
        "inputSchema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
]


# ── Tool handlers ───────────────────────────────────────────────
def _handle_tool(name: str, args: dict) -> str:
    try:
        if name == "bht_drivers":
            limit = args.get("limit", 50)
            r = _supabase(f"drivers?select=*&limit={limit}&order=name.asc")
            return json.dumps(r, indent=2, ensure_ascii=False)

        elif name == "bht_transactions":
            limit = args.get("limit", 50)
            qs = f"transactions?select=*&limit={limit}&order=timestamp.desc"
            if args.get("driver_id"):
                qs += f"&driverId=eq.{args['driver_id']}"
            if args.get("from_date"):
                qs += f"&timestamp=gte.{args['from_date']}"
            if args.get("to_date"):
                qs += f"&timestamp=lte.{args['to_date']}"
            r = _supabase(qs)
            return json.dumps(r, indent=2, ensure_ascii=False)

        elif name == "bht_settlements":
            limit = args.get("limit", 20)
            qs = f"daily_settlements?select=*&limit={limit}&order=settlement_date.desc"
            if args.get("driver_id"):
                qs += f"&driver_id=eq.{args['driver_id']}"
            r = _supabase(qs)
            return json.dumps(r, indent=2, ensure_ascii=False)

        elif name == "bht_payrolls":
            limit = args.get("limit", 20)
            qs = f"monthly_payrolls?select=*&limit={limit}&order=period_start.desc"
            if args.get("driver_id"):
                qs += f"&driver_id=eq.{args['driver_id']}"
            r = _supabase(qs)
            return json.dumps(r, indent=2, ensure_ascii=False)

        elif name == "bht_locations":
            limit = args.get("limit", 50)
            r = _supabase(f"locations?select=*&limit={limit}")
            return json.dumps(r, indent=2, ensure_ascii=False)

        elif name == "bht_profiles":
            limit = args.get("limit", 20)
            qs = f"profiles?select=*&limit={limit}"
            if args.get("role"):
                qs += f"&role=eq.{args['role']}"
            r = _supabase(qs)
            return json.dumps(r, indent=2, ensure_ascii=False)

        elif name == "bht_stats":
            drivers = len(_supabase("drivers?select=id").get("data", []))
            locations = len(_supabase("locations?select=id").get("data", []))
            txs = _supabase("transactions?select=id")
            tx_count = len(txs.get("data", []))
            # Count unique drivers with transactions
            tx_drivers = set(t.get("driverId") for t in txs.get("data", []) if t.get("driverId"))
            return json.dumps({
                "drivers_total": drivers,
                "locations_total": locations,
                "transactions_total": tx_count,
                "active_drivers": len(tx_drivers),
            }, indent=2, ensure_ascii=False)

        elif name == "bht_raw_query":
            r = _supabase(args["path"])
            return json.dumps(r, indent=2, ensure_ascii=False)

        return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


# ── MCP JSON-RPC loop ───────────────────────────────────────────
def _send(msg: dict):
    line = json.dumps(msg, ensure_ascii=False)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def main():
    initialized = False

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue

        msg_id = req.get("id")
        method = req.get("method", "")

        if method == "initialize":
            _send({
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "bht-supabase", "version": "1.0.0"},
                },
            })
            initialized = True

        elif method == "notifications/initialized":
            pass  # No response needed

        elif method == "tools/list":
            _send({"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}})

        elif method == "tools/call":
            tool_name = req.get("params", {}).get("name", "")
            tool_args = req.get("params", {}).get("arguments", {})
            result_text = _handle_tool(tool_name, tool_args)
            _send({
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "content": [{"type": "text", "text": result_text}],
                    "isError": False,
                },
            })

        elif method == "ping":
            _send({"jsonrpc": "2.0", "id": msg_id, "result": {}})

        else:
            _send({
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            })


if __name__ == "__main__":
    main()

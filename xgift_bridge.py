import asyncio
import contextlib
import json
import os
import sys
import time


for proxy_key in (
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "GIT_HTTP_PROXY",
    "GIT_HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
):
    os.environ.pop(proxy_key, None)


def normalize_name(value):
    return "".join(ch.lower() for ch in str(value or "") if ch.isalnum())


def number(value, default=0.0):
    try:
        result = float(value)
        return result if result == result and result > 0 else default
    except Exception:
        return default


def load_canonical_names():
    try:
        import xgift
        path = os.path.join(os.path.dirname(xgift.__file__), "gift_data.json")
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        names = []
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, str):
                    names.append(item)
                elif isinstance(item, dict):
                    names.append(item.get("name") or item.get("giftName") or item.get("title") or "")
        elif isinstance(payload, dict):
            for key, item in payload.items():
                if isinstance(item, dict):
                    nested_name = ""
                    for nested_key, nested_value in item.items():
                        if nested_key == "models":
                            continue
                        if isinstance(nested_value, (str, int, float)):
                            nested_name = str(nested_key)
                            break
                    names.append(item.get("name") or item.get("giftName") or item.get("title") or nested_name or key)
                else:
                    names.append(str(item or key))
        return [name for name in names if name]
    except Exception:
        return []


def candidate_names(name):
    raw = str(name or "").strip()
    names = []
    if raw:
        names.extend([raw, raw.replace(" ", "").replace("'", "").replace("-", "")])
        if raw.lower().endswith("s"):
            singular = raw[:-1]
            names.extend([singular, singular.replace(" ", "").replace("'", "").replace("-", "")])
    canonical = load_canonical_names()
    raw_key = normalize_name(raw)
    if raw_key:
        for item in canonical:
            item_key = normalize_name(item)
            if item_key == raw_key or item_key == raw_key.rstrip("s") or item_key.rstrip("s") == raw_key.rstrip("s"):
                names.insert(0, item)
                break
    seen = set()
    result = []
    for item in names:
        key = str(item or "").strip()
        if key and key.lower() not in seen:
            seen.add(key.lower())
            result.append(key)
    return result


def graph_points(graph_payload, period, ton_rate):
    graph = (graph_payload or {}).get("graph") if isinstance(graph_payload, dict) else {}
    rows = graph.get(period) or graph.get("7d") or graph.get("30d") or []
    points = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        price_ton = number(row.get("priceTon") or row.get("price_ton") or row.get("floorPrice") or row.get("y"))
        price_usd = number(row.get("priceUsd") or row.get("price_usd"))
        if price_ton <= 0 and price_usd <= 0:
            continue
        points.append(
            {
                "timestamp": row.get("x") or row.get("date") or row.get("timestamp"),
                "priceTon": price_ton or (price_usd / ton_rate if ton_rate else 0),
                "priceUsd": price_usd or price_ton * ton_rate,
            }
        )
    return points


async def gift_floor(name, period="7d"):
    from xgift.raw import GiftRaw
    from xgift import utils

    raw = GiftRaw()
    ton_rate = number(await utils.tonRate())
    try:
        last_error = None
        for candidate in candidate_names(name):
            try:
                with contextlib.redirect_stdout(sys.stderr):
                    info = await raw.CollectionInfo(candidate)
                if not isinstance(info, dict):
                    continue
                floor_ton = number(info.get("floorPrice") or info.get("floor_price"))
                if floor_ton <= 0:
                    continue
                graph = info.get("floor") or {}
                change_key = {
                    "24h": "floorPrice24hChange",
                    "3d": "floorPrice3dChange",
                    "7d": "floorPrice7dChange",
                    "30d": "floorPrice30dChange",
                }.get(period, "floorPrice7dChange")
                return {
                    "ok": True,
                    "canonicalName": info.get("giftName") or candidate,
                    "giftId": str(info.get("giftId") or ""),
                    "floorTon": floor_ton,
                    "floorUsd": floor_ton * ton_rate,
                    "tonUsdRate": ton_rate,
                    "volume24hTon": number(info.get("volume24h")),
                    "volume24hUsd": number(info.get("volume24h")) * ton_rate,
                    "change24hPct": number(info.get("floorPrice24hChange"), 0.0),
                    "periodChangePct": number(info.get(change_key), 0.0),
                    "sales24h": 0,
                    "sales30d": int(number(info.get("deals30dCount"), 0.0)),
                    "totalSupply": int(number(info.get("availabilityTotal") or info.get("opened") or info.get("giftsCount"), 0.0)),
                    "opened": int(number(info.get("opened") or info.get("giftsCount"), 0.0)),
                    "onchain": int(number(info.get("onchain"), 0.0)),
                    "listedCount": int(number(info.get("onSaleCount"), 0.0)),
                    "marketUpdatedAt": info.get("marketDataUpdatedAt") or info.get("updateTime") or "",
                    "marketPlatform": "xGift",
                    "source": "xgift",
                    "marketUrl": f"https://xgift.tg/gifts/{info.get('giftNameFormatted') or candidate}",
                    "graphImageUrl": f"https://static-gift.xgift.tg/gifts/graphs/{info.get('giftId')}.png?timestamp={int(time.time() * 1000)}" if info.get("giftId") else "",
                    "floorHistory": graph_points(graph, period, ton_rate),
                }
            except Exception as exc:
                last_error = str(exc)
        return {"ok": False, "error": last_error or "No xGift match"}
    finally:
        await raw.close()


async def gift_model_floors(name):
    from xgift.raw import GiftRaw
    from xgift import utils

    raw = GiftRaw()
    ton_rate = number(await utils.tonRate())
    try:
        last_error = None
        for candidate in candidate_names(name):
            try:
                with contextlib.redirect_stdout(sys.stderr):
                    payload = await raw.CollectionGifts(candidate)
                rows = payload.get("giftModel") if isinstance(payload, dict) else []
                if not isinstance(rows, list) or not rows:
                    continue
                models = []
                canonical = candidate
                gift_id = ""
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    model = str(row.get("model") or "").strip()
                    floor_ton = number(row.get("floorPriceTon") or row.get("floorPrice") or row.get("floor_price"))
                    if not model or floor_ton <= 0:
                        continue
                    canonical = row.get("giftName") or canonical
                    gift_id = str(row.get("giftTypeId") or gift_id or "")
                    models.append({
                        "model": model,
                        "modelKey": normalize_name(model),
                        "floorTon": floor_ton,
                        "floorUsd": floor_ton * ton_rate,
                        "tonUsdRate": ton_rate,
                        "listedCount": int(number(row.get("onSaleCount"), 0.0)),
                        "deals30d": int(number(row.get("deals30dCount"), 0.0)),
                        "avg30dTon": number(row.get("avg30dPrice"), 0.0),
                        "avg30dUsd": number(row.get("avg30dPrice"), 0.0) * ton_rate,
                        "modelCount": int(number(row.get("modelCount"), 0.0)),
                        "rarity": number(row.get("modelRare"), 0.0),
                        "marketUpdatedAt": row.get("marketDataUpdatedAt") or row.get("updateTime") or "",
                        "iconUrl": row.get("iconUrl") or "",
                    })
                if models:
                    return {
                        "ok": True,
                        "canonicalName": canonical,
                        "giftId": gift_id,
                        "source": "xgift",
                        "marketPlatform": "xGift",
                        "tonUsdRate": ton_rate,
                        "models": models,
                    }
            except Exception as exc:
                last_error = str(exc)
        return {"ok": False, "error": last_error or "No xGift model match", "models": []}
    finally:
        await raw.close()


async def main():
    payload = json.loads(sys.stdin.read() or "{}")
    command = payload.get("command")
    if command == "gift-floor":
        result = await gift_floor(payload.get("name") or payload.get("collection") or "", payload.get("period") or "7d")
    elif command == "gift-model-floors":
        result = await gift_model_floors(payload.get("name") or payload.get("collection") or "")
    elif command == "gift-list":
        names = []
        try:
            import xgift
            path = os.path.join(os.path.dirname(xgift.__file__), "gift_data.json")
            with open(path, "r", encoding="utf-8") as handle:
                data = json.load(handle)
            if isinstance(data, dict):
                for key, item in data.items():
                    if isinstance(item, dict):
                        for nested_key in item.keys():
                            if nested_key != "models":
                                names.append(str(nested_key))
                                break
                    else:
                        names.append(str(item or key))
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, str):
                        names.append(item)
                    elif isinstance(item, dict):
                        names.append(item.get("name") or item.get("giftName") or item.get("title") or "")
            names = list(dict.fromkeys(name for name in names if name))
            result = {"ok": True, "names": names}
        except Exception as exc:
            result = {"ok": False, "error": str(exc), "names": []}
    else:
        result = {"ok": False, "error": "Unknown command"}
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())

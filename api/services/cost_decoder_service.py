"""Cost Decoder: character substitution + math operation."""
from config.db import fetchall, execute


def decode(encoded: str, formula: dict) -> float | None:
    if not encoded or not formula:
        return None
    char_map  = formula.get("char_map", {})
    math_op   = formula.get("math_op", "none")
    math_value = formula.get("math_value")

    substituted = "".join(char_map.get(ch, ch) for ch in str(encoded).upper())

    try:
        num = float(substituted)
    except ValueError:
        return None

    mv = float(math_value) if math_value is not None else None
    if math_op == "divide"   and mv: return num / mv
    if math_op == "multiply" and mv: return num * mv
    if math_op == "add"      and mv: return num + mv
    if math_op == "subtract" and mv: return num - mv
    return num


async def re_decode_all(db, formula: dict) -> dict:
    purchases = await fetchall(db,
        "SELECT id, sku_id, rate_encoded FROM purchases WHERE rate_encoded IS NOT NULL"
    )
    updated = 0
    for p in purchases:
        decoded = decode(p["rate_encoded"], formula)
        if decoded is not None:
            await execute(db, "UPDATE purchases SET rate_decoded = %s WHERE id = %s", (decoded, p["id"]))
            updated += 1

    # Update skus.purchase_cost_decoded from latest purchase
    await execute(db, """
        UPDATE skus s
        JOIN (
            SELECT sku_id, rate_decoded
            FROM purchases
            WHERE rate_decoded IS NOT NULL
            ORDER BY purchase_date DESC
        ) latest ON latest.sku_id = s.id
        SET s.purchase_cost_decoded = latest.rate_decoded, s.updated_at = NOW()
    """)
    return {"updated": updated}

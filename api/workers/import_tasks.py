import time
import json

from config.db import get_sync_conn
from services.import_service import (
    parse_file, import_sales, import_purchases, import_inventory,
    import_outstanding, import_msl, import_urgent_skus,
    import_sales_invoices, import_payment_receipts,
    detect_location_column, scan_location_values,
    save_branch_mapping, auto_create_branch,
)
from services.forecasting_service import sync_recompute_all


def process_import(payload: dict):
    batch_id             = payload["batch_id"]
    tenant_db            = payload["tenant_db_name"]
    file_path            = payload["file_path"]
    data_type            = payload["data_type"]
    branch_id            = payload.get("branch_id")
    branch_mappings      = payload.get("branch_mappings") or {}
    auto_create_branches = payload.get("auto_create_branches", False)

    max_retries = 3
    for attempt in range(1, max_retries + 1):
        conn = get_sync_conn(tenant_db)
        try:
            _set_status(conn, batch_id, "processing")
            rows = parse_file(file_path)

            # ── Branch auto-detection (sales/inventory only) ───────────────────────
            if data_type in ("sales", "inventory") and rows:
                loc_col = detect_location_column(list(rows[0].keys()))
                if loc_col:
                    distinct_vals = scan_location_values(rows, loc_col)
                    for val in distinct_vals:
                        if val in branch_mappings:
                            save_branch_mapping(conn, val, branch_mappings[val])
                        elif auto_create_branches:
                            new_bid = auto_create_branch(conn, val)
                            branch_mappings[val] = new_bid
                            save_branch_mapping(conn, val, new_bid)
                    conn.commit()

            if data_type == "sales":
                result = import_sales(conn, rows, batch_id, branch_id, branch_mappings)
            elif data_type == "purchases":
                result = import_purchases(conn, rows, batch_id, branch_id)
            elif data_type == "inventory":
                result = import_inventory(conn, rows, batch_id, branch_id)
            elif data_type == "outstanding":
                result = import_outstanding(conn, rows, batch_id)
            elif data_type == "msl":
                result = import_msl(conn, rows, batch_id)
            elif data_type == "urgent_skus":
                result = import_urgent_skus(conn, rows, batch_id)
            elif data_type == "sales_invoices":
                result = import_sales_invoices(conn, rows, batch_id)
            elif data_type == "payment_receipts":
                result = import_payment_receipts(conn, rows, batch_id)
            else:
                raise ValueError(f"Unknown data_type: {data_type}")

            skipped  = len(result.get("errors", []))
            imported = result.get("success", 0)
            new_mast = result.get("new_masters", 0)
            err_log  = result.get("errors", [])

            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE import_batches
                       SET status='completed',
                           records_total=%s,
                           records_imported=%s,
                           records_skipped=%s,
                           new_masters_created=%s,
                           error_log=%s,
                           completed_at=NOW()
                       WHERE id=%s""",
                    (len(rows), imported, skipped, new_mast, json.dumps(err_log), batch_id)
                )
            conn.commit()

            # Trigger forecast recompute (skip for outstanding/urgent — no stock change)
            if data_type in ("sales", "purchases", "inventory", "msl"):
                sync_recompute_all(conn)

            return  # success

        except Exception as exc:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE import_batches SET status='failed', error_log=%s, completed_at=NOW() WHERE id=%s",
                    (json.dumps([{"error": str(exc)}]), batch_id)
                )
            conn.commit()
            if attempt < max_retries:
                print(f"[ImportWorker] Attempt {attempt} failed for batch {batch_id}: {exc}. Retrying in 30s…")
                time.sleep(30)
            else:
                print(f"[ImportWorker] All {max_retries} attempts failed for batch {batch_id}: {exc}")
        finally:
            conn.close()


def _set_status(conn, batch_id, status):
    with conn.cursor() as cur:
        cur.execute("UPDATE import_batches SET status=%s WHERE id=%s", (status, batch_id))
    conn.commit()

import React from "react";
import { FileXls, FilePdf, CheckCircle, Warning, ArrowCounterClockwise } from "@phosphor-icons/react";

/**
 * Summary card for a sent order that has been marked received.
 * Shows received / pending counts and lets the user download the
 * pending (not-received) items as Excel / PDF for reordering.
 */
export default function ReceiptSummary({ receipt, onDownload, onRecheck, onClear }) {
  if (!receipt) return null;
  const pending = (receipt.items || []).filter((r) => r.pending_qty > 0);
  const allReceived = pending.length === 0;
  const accent = allReceived ? "16,185,129" : "245,158,11";

  return (
    <div
      className="card p-5 mb-6"
      data-testid="receipt-summary"
      style={{ border: `1px solid rgba(${accent},0.5)`, background: `rgba(${accent},0.06)` }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          {allReceived ? (
            <CheckCircle size={20} weight="fill" color="#10b981" />
          ) : (
            <Warning size={20} weight="fill" color="#f59e0b" />
          )}
          <div>
            <div className="font-display font-semibold text-base" data-testid="receipt-headline">
              {allReceived
                ? "All items received"
                : `${pending.length} item${pending.length === 1 ? "" : "s"} not received`}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--hero-muted)" }}>
              Checked {receipt.received_at?.slice(0, 16).replace("T", " ")} by {receipt.received_by} ·{" "}
              {receipt.received_count} received
              {receipt.partial_count ? `, ${receipt.partial_count} partial` : ""}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!allReceived && (
            <>
              <button
                className="btn btn-outline"
                onClick={() => onDownload("excel", true)}
                data-testid="pending-excel-btn"
              >
                <FileXls size={14} />
                <span>Pending Excel</span>
              </button>
              <button
                className="btn btn-outline"
                onClick={() => onDownload("pdf", true)}
                data-testid="pending-pdf-btn"
              >
                <FilePdf size={14} />
                <span>Pending PDF</span>
              </button>
            </>
          )}
          <button className="btn btn-ghost" onClick={onRecheck} data-testid="receipt-recheck-btn" title="Re-run the stock check">
            <ArrowCounterClockwise size={14} />
            <span>Re-check</span>
          </button>
          <button
            className="btn btn-ghost"
            onClick={onClear}
            data-testid="receipt-clear-btn"
            style={{ color: "#f87171" }}
            title="Remove the receipt and go back to plain sent"
          >
            Clear
          </button>
        </div>
      </div>

      {!allReceived && (
        <div className="mt-4 table-scroll">
          <table className="hero-table" data-testid="pending-items-table">
            <thead>
              <tr>
                <th>Part No.</th>
                <th>Description</th>
                <th className="num">Ordered</th>
                <th className="num">Received</th>
                <th className="num">Pending</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.part_no} data-testid={`pending-row-${r.part_no}`}>
                  <td className="font-mono">{r.part_no}</td>
                  <td className="text-xs">{r.description}</td>
                  <td className="num">{r.qty}</td>
                  <td className="num">{r.received_qty}</td>
                  <td className="num" style={{ color: "#f59e0b", fontWeight: 600 }}>
                    {r.pending_qty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

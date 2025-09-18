import type { PortfolioHolding, PortfolioHoldingRow } from '@/types';

export function mapHoldingRow(row: PortfolioHoldingRow): PortfolioHolding {
  return {
    id: row.id,
    userId: row.user_id,
    ticker: row.ticker,
    shareQty: row.share_qty,
    costBasis: row.cost_basis ?? null,
    marketValue: row.market_value ?? null,
    confidence: row.confidence ?? null,
    source: row.source ?? null,
    uploadId: row.upload_id ?? null,
    draftId: row.draft_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapHoldingRows(rows: PortfolioHoldingRow[]): PortfolioHolding[] {
  return rows.map((row) => mapHoldingRow(row));
}

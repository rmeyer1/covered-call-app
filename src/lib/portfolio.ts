import type { PortfolioHolding, PortfolioHoldingRow, PortfolioOption, PortfolioOptionRow } from '@/types';

export function mapHoldingRow(row: PortfolioHoldingRow): PortfolioHolding {
  return {
    id: row.id,
    userId: row.user_id,
    ticker: row.ticker,
    shareQty: row.share_qty,
    type: row.type ?? null,
    optionStrike: row.option_strike ?? null,
    optionExpiration: row.option_expiration ?? null,
    optionRight: row.option_right ?? null,
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

export function mapOptionRow(row: PortfolioOptionRow): PortfolioOption {
  return {
    id: row.id,
    userId: row.user_id,
    ticker: row.ticker,
    shareQty: row.share_qty,
    optionStrike: row.option_strike ?? null,
    optionExpiration: row.option_expiration ?? null,
    optionRight: row.option_right ?? null,
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

export function mapOptionRows(rows: PortfolioOptionRow[]): PortfolioOption[] {
  return rows.map((row) => mapOptionRow(row));
}

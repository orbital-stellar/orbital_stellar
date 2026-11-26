import { describe, expect, it } from "vitest";
import { parseCdpLedger, parseGalexieLedger } from "../src/exports/parsers.js";

describe("export ledger parsers", () => {
  it("defaults empty Galexie and CDP ledgers to mainnet with no transactions", () => {
    expect(parseGalexieLedger({ ledger_sequence: 12, close_time: "galexie-time" })).toEqual({
      ledgerSequence: 12,
      closeTime: "galexie-time",
      network: "mainnet",
      transactions: [],
    });
    expect(parseCdpLedger({ ledger: 13, closed_at: "cdp-time" })).toEqual({
      ledgerSequence: 13,
      closeTime: "cdp-time",
      network: "mainnet",
      transactions: [],
    });
  });

  it("normalizes every supported Galexie operation and ignores unsupported types", () => {
    const ledger = parseGalexieLedger({
      ledger_sequence: 20,
      close_time: "2026-01-01T00:00:00Z",
      network: "testnet",
      transactions: [
        {
          transaction_id: "galexie-tx",
          operations: [
            {
              type: "payment",
              source_account: "A",
              destination: "B",
              amount: "12",
              asset: { asset_type: "credit_alphanum4", asset_code: "USD", asset_issuer: "ISSUER" },
            },
            { type: "mint", destination: "C", amount: "3", asset: { asset_type: "native" } },
            {
              type: "create_asset",
              destination: "D",
              amount: 4,
              asset: { asset_type: "credit_alphanum4" },
            },
            { type: "burn", source_account: "E", amount: "5", asset: {} },
            {
              type: "clawback",
              source_account: "F",
              amount: "6",
              asset: { asset_type: "credit_alphanum4", asset_code: "EUR", asset_issuer: "ISSUER2" },
            },
            { type: "fee", source_account: "G", amount: null },
            {
              type: "set_authorized",
              trustor: "H",
              asset: { asset_type: "native" },
              authorized: true,
            },
            {
              type: "allow_trust",
              trustor: "I",
              asset: { asset_type: "credit_alphanum4", asset_code: "ABC", asset_issuer: "ISSUER3" },
              authorized: 0,
            },
            { type: "set_trust_line_flags", trustor: "J", asset: {}, authorized: "yes" },
            { type: "not_supported", amount: "100" },
          ],
        },
        { transaction_id: "empty-tx" },
      ],
    });

    expect(ledger).toEqual({
      ledgerSequence: 20,
      closeTime: "2026-01-01T00:00:00Z",
      network: "testnet",
      transactions: [
        {
          transactionId: "galexie-tx",
          operations: [
            { kind: "payment", from: "A", to: "B", amount: "12", asset: "USD:ISSUER" },
            { kind: "mint", to: "C", amount: "3", asset: "XLM" },
            { kind: "mint", to: "D", amount: "0", asset: "UNKNOWN:UNKNOWN" },
            { kind: "burn", from: "E", amount: "5", asset: "XLM" },
            { kind: "clawback", from: "F", amount: "6", asset: "EUR:ISSUER2" },
            { kind: "fee", from: "G", amount: "0" },
            { kind: "set_authorized", trustor: "H", asset: "XLM", authorized: true },
            { kind: "set_authorized", trustor: "I", asset: "ABC:ISSUER3", authorized: false },
            { kind: "set_authorized", trustor: "J", asset: "XLM", authorized: true },
          ],
        },
        { transactionId: "empty-tx", operations: [] },
      ],
    });
  });

  it("normalizes every supported CDP operation, including absent assets and amounts", () => {
    const ledger = parseCdpLedger({
      ledger: 21,
      closed_at: "2026-01-02T00:00:00Z",
      network: "testnet",
      txs: [
        {
          hash: "cdp-tx",
          ops: [
            { op_type: "payment", source: "A", dest: "B", amount: "12" },
            {
              op_type: "mint",
              dest: "C",
              amount: "3",
              asset: { asset_type: "credit_alphanum4", asset_code: "USD", asset_issuer: "ISSUER" },
            },
            {
              op_type: "create_asset",
              dest: "D",
              amount: 4,
              asset: { asset_type: "credit_alphanum4" },
            },
            { op_type: "burn", source: "E", amount: "5", asset: {} },
            { op_type: "clawback", source: "F", amount: "6", asset: { asset_type: "native" } },
            { op_type: "fee", source: "G", amount: null },
            { op_type: "set_authorized", trustor: "H", authorized: true },
            {
              op_type: "allow_trust",
              trustor: "I",
              asset: { asset_type: "credit_alphanum4", asset_code: "ABC", asset_issuer: "ISSUER3" },
              authorized: 0,
            },
            { op_type: "set_trust_line_flags", trustor: "J", asset: {}, authorized: "yes" },
            { op_type: "not_supported", amount: "100" },
          ],
        },
        { hash: "empty-tx" },
      ],
    });

    expect(ledger).toEqual({
      ledgerSequence: 21,
      closeTime: "2026-01-02T00:00:00Z",
      network: "testnet",
      transactions: [
        {
          transactionId: "cdp-tx",
          operations: [
            { kind: "payment", from: "A", to: "B", amount: "12", asset: "XLM" },
            { kind: "mint", to: "C", amount: "3", asset: "USD:ISSUER" },
            { kind: "mint", to: "D", amount: "0", asset: "UNKNOWN:UNKNOWN" },
            { kind: "burn", from: "E", amount: "5", asset: "XLM" },
            { kind: "clawback", from: "F", amount: "6", asset: "XLM" },
            { kind: "fee", from: "G", amount: "0" },
            { kind: "set_authorized", trustor: "H", asset: "XLM", authorized: true },
            { kind: "set_authorized", trustor: "I", asset: "ABC:ISSUER3", authorized: false },
            { kind: "set_authorized", trustor: "J", asset: "XLM", authorized: true },
          ],
        },
        { transactionId: "empty-tx", operations: [] },
      ],
    });
  });
});

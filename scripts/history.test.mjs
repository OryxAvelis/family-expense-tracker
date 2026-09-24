import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { newestCompletedFirst, completionDay, matchesHistoryFilters } from "../lib/history.ts";

test("completion time wins over priority, creation time and ID", () => {
  const records = [
    { id: 25, completed_at: "2026-09-14T12:00:00Z", priority: "urgent" },
    { id: 30, completed_at: "2026-09-13T12:00:00Z", priority: "normal" },
    { id: 20, completed_at: "2026-09-15T12:00:00Z", priority: null },
  ];
  assert.deepEqual([...records].sort(newestCompletedFirst).map(({ id }) => id), [20, 25, 30]);
  assert.deepEqual(records.map(({ id }) => id), [25, 30, 20]);
});

test("ties use descending numeric IDs and missing/invalid dates stay last", () => {
  const records = [
    { id: 3, completed_at: null }, { id: 2, completed_at: "2026-09-15T12:00:00Z" },
    { id: 10, completed_at: "2026-09-15T13:00:00+01:00" }, { id: 4, completed_at: "invalid" },
  ];
  assert.deepEqual(records.sort(newestCompletedFirst).map(({ id }) => id), [10, 2, 4, 3]);
});

test("date filters use Casablanca calendar days, including midnight and Ramadan offset", () => {
  assert.equal(completionDay("2026-09-14T23:30:00Z"), "2026-09-15");
  assert.equal(completionDay("2026-03-01T23:30:00Z"), "2026-03-01");
  assert.equal(completionDay(null), "");
  assert.equal(completionDay("invalid"), "");
  const record = { memberId: 8, completed_at: "2026-09-14T23:30:00Z" };
  assert.equal(matchesHistoryFilters(record, "8", "2026-09-15", "2026-09-15"), true);
  assert.equal(matchesHistoryFilters(record, "9", "", ""), false);
  assert.equal(matchesHistoryFilters(record, "", "", "2026-09-14"), false);
  assert.equal(matchesHistoryFilters(record, "", "2026-09-16", "2026-09-14"), false);
  assert.equal(matchesHistoryFilters({ ...record, completed_at: null }, "", "", ""), true);
  assert.equal(matchesHistoryFilters({ ...record, completed_at: null }, "", "2026-09-01", ""), false);
});

test("buyer history interleaves completed services and orders before filtering", () => {
  const source = readFileSync(new URL("../app/family-tracker.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("tracker.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const dashboard = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "DeliveryDashboard");
  const bindings = dashboard.body.statements.filter((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => ["completedWork", "filteredWork"].includes(declaration.name.getText(ast))));
  assert.equal(bindings.length, 2);
  const context = {
    newestCompletedFirst, matchesHistoryFilters,
    history: [{ id: 9, member_id: 1, member_name: "A", completed_at: "2026-09-14T10:00:00Z" }, { id: 2, member_id: 2, member_name: "B", completed_at: "2026-09-16T10:00:00Z" }],
    serviceTasks: [{ id: "task-1", creator_id: 1, creator_name: "A", status: "completed", completed_at: "2026-09-15T10:00:00Z" }, { id: "task-2", creator_id: 1, status: "pending", completed_at: null }],
    historyMember: "1", historyFrom: "", historyTo: "",
  };
  vm.runInNewContext(ts.transpileModule(bindings.map((node) => node.getText(ast)).join("\n") + "\nglobalThis.result = { completedWork, filteredWork };", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const result = JSON.parse(JSON.stringify(context.result));
  assert.deepEqual(result.completedWork.map(({ id }) => id), [2, "task-1", 9]);
  assert.deepEqual(result.filteredWork.map(({ id }) => id), ["task-1", 9]);
});

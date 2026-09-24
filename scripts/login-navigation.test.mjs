import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the real route/page functions with session and database boundaries stubbed.
function functionsFrom(path, names, context) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(declarations.length, names.length);
  const code = declarations.map((node) => node.getText(ast).replace(/^export (default )?/, "")).join("\n");
  vm.runInNewContext(ts.transpileModule(code + `\nglobalThis.result = { ${names.join(", ")} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, context);
  return context.result;
}
const navigation = functionsFrom("../lib/family-auth.ts", ["familyRolePath", "familyLoginPath"], {});
const roles = { admin: "/admin", delivery: "/livreur", member: "/membre" };

test("every role opens its workspace by default and resumes explicit subscription/services links", () => {
  for (const [role, workspace] of Object.entries(roles)) {
    for (const value of [undefined, null, "", [], 1, "/"]) assert.equal(navigation.familyLoginPath(role, value), workspace);
    for (const path of [workspace, "/services", "/abonnement", "/abonnement#subscription-history", "/services?view=mine"]) {
      assert.equal(navigation.familyLoginPath(role, path), path);
    }
  }
});

test("return destinations reject external URLs, other roles, login loops, and API routes", () => {
  for (const [role, workspace] of Object.entries(roles)) {
    const wrongRoles = Object.values(roles).filter((path) => path !== workspace);
    for (const path of [...wrongRoles, "https://example.com", "//example.com", "/\\example.com", "/services\\evil", "/services\n", "/api/auth/logout", "/connexion", "/abonnement/../connexion", "/services-extra", "/%61dmin"]) {
      assert.equal(navigation.familyLoginPath(role, path), workspace);
    }
  }
});

function loginHandler(role, status = "authenticated") {
  const sessionCalls = [];
  const context = { ...navigation, Response,
    ensureFamilyAuthUsers: async () => {}, consumeFamilyAuthAttempt: async () => ({ allowed: true }),
    authenticateFamilyMemberById: async () => ({ status, user: { id: 7, familyId: "fixture", role } }),
    createFamilySession: async (...args) => { sessionCalls.push(args); return { token: "fixture-token" }; },
    familySessionCookie: () => "fixture-session=fixture-token; HttpOnly; SameSite=Lax",
  };
  return { ...functionsFrom("../app/api/auth/login/route.ts", ["POST"], context), sessionCalls };
}
const loginRequest = (returnTo, cookie = "") => new Request("https://fixture.test/api/auth/login", {
  method: "POST", headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify({ memberId: 7, password: "1234", returnTo }),
});

test("actual login response skips plans regardless of the old direct-entry cookie", async () => {
  for (const [role, workspace] of Object.entries(roles)) {
    for (const cookie of ["", "family_direct_entry=0", "family_direct_entry=1"]) {
      const app = loginHandler(role);
      const response = await app.POST(loginRequest(undefined, cookie));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).route, workspace);
      assert.equal(response.headers.get("set-cookie"), "fixture-session=fixture-token; HttpOnly; SameSite=Lax");
      assert.deepEqual(app.sessionCalls, [[7, "fixture"]]);
    }
  }
});

test("actual login honors requested pages but keeps invalid credentials and account restrictions enforced", async () => {
  for (const path of ["/services", "/abonnement#subscription-history", "/membre"]) {
    const response = await loginHandler("member").POST(loginRequest(path));
    assert.equal((await response.json()).route, path);
  }
  for (const [status, code] of [["invalid", 401], ["pending", 403], ["provisioning", 403], ["suspended", 403]]) {
    const app = loginHandler("member", status);
    const response = await app.POST(loginRequest("/abonnement"));
    assert.equal(response.status, code);
    assert.equal((await response.json()).route, undefined);
    assert.equal(app.sessionCalls.length, 0);
  }
});

function pageContext(user) {
  return { ...navigation, getPageFamilyUser: async () => user,
    redirect: (path) => { throw new Error(`redirect:${path}`); },
    FamilyEntrance: "FamilyEntrance", React: { createElement: (type, props) => ({ type, props }) },
  };
}
test("home, login and family entrance send signed-in users directly to their own workspace", async () => {
  for (const [role, workspace] of Object.entries(roles)) {
    for (const [path, name, args] of [
      ["../app/page.tsx", "HomePage", undefined],
      ["../app/connexion/page.tsx", "LoginPage", { searchParams: Promise.resolve({}) }],
      ["../app/famille/[familyCode]/page.tsx", "FamilyEntrancePage", { params: Promise.resolve({ familyCode: "test" }) }],
    ]) {
      const page = functionsFrom(path, [name], pageContext({ role }))[name];
      await assert.rejects(page(args), { message: `redirect:${workspace}` });
    }
  }
  const home = functionsFrom("../app/page.tsx", ["HomePage"], pageContext(null)).HomePage;
  await assert.rejects(home(), { message: "redirect:/connexion" });
});

test("login page preserves family selection and requested destination for signed-out users", async () => {
  const page = functionsFrom("../app/connexion/page.tsx", ["LoginPage"], pageContext(null)).LoginPage;
  const output = await page({ searchParams: Promise.resolve({ familyCode: ["test-family"], returnTo: ["/services"] }) });
  assert.equal(output.props.familyCode, "test-family");
  assert.equal(output.props.returnTo, "/services");
  const signedIn = functionsFrom("../app/connexion/page.tsx", ["LoginPage"], pageContext({ role: "admin" })).LoginPage;
  await assert.rejects(signedIn({ searchParams: Promise.resolve({ returnTo: "/abonnement" }) }), { message: "redirect:/abonnement" });
});

test("the entrance sends returnTo with the selected member and PIN", async () => {
  const source = readFileSync(new URL("../app/family-entrance.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("entrance.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "FamilyEntrance");
  const submit = component.body.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => d.name.getText(ast) === "submit"));
  const requests = [], destinations = [];
  const context = { selected: { id: 7 }, pin: "1234", familyCode: "test-family", returnTo: "/abonnement", t: { wrongPin: "Invalid" },
    setError: () => {}, setBusy: () => {}, window: { location: { assign: (path) => destinations.push(path) } },
    fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return Response.json({ route: "/abonnement" }); },
  };
  vm.runInNewContext(ts.transpileModule(submit.getText(ast) + "\nglobalThis.submit = submit;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  await context.submit();
  assert.deepEqual(requests, [{ url: "/api/auth/login", body: { memberId: 7, password: "1234", familyCode: "test-family", returnTo: "/abonnement" } }]);
  assert.deepEqual(destinations, ["/abonnement"]);
});

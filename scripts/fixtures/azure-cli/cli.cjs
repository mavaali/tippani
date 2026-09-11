const args = process.argv.slice(2);
if (process.env.TIPPANI_TEST_AZ_ERROR) {
  process.stderr.write(process.env.TIPPANI_TEST_AZ_ERROR);
  process.exit(1);
}
if (args.includes("--tenant") && args.includes("--subscription")) {
  process.stderr.write("ERROR: Please specify only one of subscription and tenant, not both\n");
  process.exit(1);
}
if (args[1] === "list") {
  console.log(JSON.stringify([{ id: "subscription", tenantId: "tenant", user: { type: "user", name: "reader@example.com" } }]));
} else if (args[1] === "get-access-token") {
  const claims = { aud: "499b84ac-1321-427f-aa17-267ca6975798", tid: "tenant", oid: "reader",
    upn: "reader@example.com", exp: Math.floor(Date.now() / 1000) + 3600 };
  console.log(JSON.stringify({ accessToken: `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.fixture` }));
}

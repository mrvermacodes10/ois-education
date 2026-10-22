// A stand-alone player process for integration tests. It speaks the raw wire protocol (no shared code),
// so it also checks the protocol from the outside. stdin: one JSON message per line to send.
// stdout: every server message as one JSON line, plus {"type":"_open"} / {"type":"_closed",code}.
const [, , url] = process.argv;
const ws = new WebSocket(url);
const out = (m) => process.stdout.write(JSON.stringify(m) + "\n");
ws.addEventListener("open", () => out({ type: "_open", pid: process.pid }));
ws.addEventListener("message", (e) => process.stdout.write(String(e.data) + "\n"));
ws.addEventListener("close", (e) => { out({ type: "_closed", code: e.code }); setTimeout(() => process.exit(0), 50); });
let buf = "";
process.stdin.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (line === "CLOSE") ws.close(1000); else if (ws.readyState === 1) ws.send(line);
  }
});

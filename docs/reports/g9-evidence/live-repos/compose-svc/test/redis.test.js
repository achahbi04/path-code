import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { expectedPong } from "../src/ping.js";

function redisPing(host = "127.0.0.1", port = 6379) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port }, () => {
      s.write("*1\r\n$4\r\nPING\r\n");
    });
    let buf = "";
    s.on("data", (d) => {
      buf += d.toString("utf8");
      if (buf.includes("\n")) {
        s.end();
        resolve(buf.trim());
      }
    });
    s.on("error", reject);
    s.setTimeout(5000, () => {
      s.destroy();
      reject(new Error("redis timeout"));
    });
  });
}

test("redis PING matches expectedPong", async () => {
  const port = Number(process.env.REDIS_PORT || 16379);
  const reply = await redisPing("127.0.0.1", port);
  assert.match(reply, /PONG/);
  assert.equal(expectedPong(), "PONG");
});

// tcp-bridge.js
// C:\Users\junichi\AppData\Roaming\npm\tcp-bridge.js
//

const net = require("net");
// Specify the host as the first argument and the port as the second argument
const [host, port] = process.argv.slice(2);

const client = net.createConnection({ host, port: parseInt(port) }, () => {
  console.error("Connected to MCP Server");
  process.stdin.pipe(client);
  client.pipe(process.stdout);
});

client.on("error", (err) => {
  console.error("TCP Error:", err.message);
  process.exit(1);
});

client.on("close", () => {
  console.error("Connection closed");
  process.exit(0);
});

import { WebSocket } from 'ws';

export function setupWebSocketProxy(clientWs, runnerWsTarget, sessionId) {
  console.log(`[${sessionId}] Setting up WebSocket proxy to ${runnerWsTarget}`);
  
  let runnerWs;
  try {
    runnerWs = new WebSocket(runnerWsTarget);
  } catch (err) {
    console.error(`[${sessionId}] Failed to create WebSocket:`, err);
    clientWs.close(1011, 'Failed to connect to runner');
    return;
  }

  runnerWs.on('open', () => {
    console.log(`[${sessionId}] Connected to runner VNC`);
  });

  runnerWs.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  runnerWs.on('error', (err) => {
    console.error(`[${sessionId}] Runner WS error:`, err.message);
    if (err.code) console.error(`[${sessionId}] Error code:`, err.code);
    clientWs.close(1011, err.message);
  });

  runnerWs.on('close', (code, reason) => {
    console.log(`[${sessionId}] Runner connection closed: code=${code}, reason=${reason}`);
    clientWs.close();
  });

  clientWs.on('message', (data, isBinary) => {
    if (runnerWs.readyState === WebSocket.OPEN) {
      runnerWs.send(data, { binary: isBinary });
    }
  });

  clientWs.on('error', (err) => {
    console.error(`[${sessionId}] Client WS error:`, err.message);
    runnerWs.close();
  });

  clientWs.on('close', () => {
    console.log(`[${sessionId}] Client connection closed`);
    runnerWs.close();
  });
}

import { WebSocket } from 'ws';

export function setupWebSocketProxy(clientWs, runnerWsTarget, sessionId) {
  console.log(`[${sessionId}] Proxying WebSocket to ${runnerWsTarget}`);
  
  const runnerWs = new WebSocket(runnerWsTarget);

  runnerWs.on('open', () => {
    console.log(`[${sessionId}] Connected to runner`);
  });

  runnerWs.on('message', (data, isBinary) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data, { binary: isBinary });
    }
  });

  runnerWs.on('error', (err) => {
    console.error(`[${sessionId}] Runner WS error:`, err.message);
    clientWs.close();
  });

  runnerWs.on('close', () => {
    console.log(`[${sessionId}] Runner connection closed`);
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

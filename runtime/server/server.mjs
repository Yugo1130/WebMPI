import { WebSocketServer } from "ws";
import { configureControllerConnection } from "./setting/controller.mjs";
import { configureParticipantConnection } from "./setting/participant.mjs";
import { dataTransfer } from "./transfer.mjs";

// 接続されたcontrollerとparticipantをそれぞれ記録
export const controllerConn = [];
export const participantConn = [];

const wss = new WebSocketServer({
    port: 9000,
    handleProtocols: (protocols) => {
        const allowed = new Set(["controller", "participant", "transfer"]);
        for (const p of protocols) {
            if (allowed.has(p)) return p;
        }
        return false;
    }
});

export function findConnByClientId(clientId) {
    return [...controllerConn, ...participantConn].find(ws => ws.clientId === clientId);
}

export function sendClientListToController() {
    // controllerがない場合は送信相手がいないので終了
    if (controllerConn.length === 0) return;

    const ipOf = (ws) => ws._socket?.remoteAddress?.replace(/^::ffff:/, "") || "unknown";
    const clientInfos = [
        ...controllerConn.map(ws => ({ id: ws.clientId, ip: ipOf(ws) })),
        ...participantConn.map(ws => ({ id: ws.clientId, ip: ipOf(ws) })),
    ];

    controllerConn[0].send(JSON.stringify({
        type: "update_client_list",
        clientInfos,
    }));
}

wss.on("connection", (ws, req) => {
    if (ws.protocol === "controller") {
        configureControllerConnection(ws, req)
    } else if (ws.protocol === "participant") {
        configureParticipantConnection(ws, req);
    } else if (ws.protocol === "transfer") {
        dataTransfer(ws, req);
    } else {
        ws.close();
        return;
    }

    ws.on("error", (err) => {
        console.error("WebSocket error:", err);
    });
});

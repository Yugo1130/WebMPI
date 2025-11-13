import { controllerConn, findConnByClientId, sendClientListToController } from "../server.mjs";

export function configureControllerConnection(ws, req) {
    // controllerの複数起動を阻止
    if (controllerConn.length >= 1) {
        controllerConn[0].send(JSON.stringify({
            type: "multiple_controllers_error",
        }));
        controllerConn[0].close();
    }
    ws.clientId = "controller"
    controllerConn[0] = ws;
    sendClientListToController();

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        // TODO participantにも送るようにする
        if (data.type === "request_allocation") {
            let rank = 0;
            let rankAssignments = [];
            let clientConn = [];
            const worldSize = data.worldSize;
            const args = data.args;
            const clientSlotLimits = data.clientSlotLimits;

            let availableslots = worldSize;
            for (const clientSlotLimit of clientSlotLimits) {
                const conn = findConnByClientId(clientSlotLimit.clientId);
                if (!conn) {
                    console.warn(`controller.mjs: clientId = ${clientSlotLimit.clientId} の client が見つかりません`);
                    continue;
                }
                conn.limit = clientSlotLimit.limit;
                if (conn.limit == -1) { 
                    availableslots = 0;
                }
                else {
                    availableslots -= conn.limit;
                }
                conn.assignedCount = 0;
                clientConn.push(conn);
            }
            if (availableslots > 0) {
                console.warn("insufficient_slots_error");
                controllerConn[0].send(JSON.stringify({
                    type: "insufficient_slots_error",
                }));
                return;
            }

            while (rank < worldSize) {
                for (const conn of clientConn) {
                    if (rank >= worldSize) break; // worldSize超えたら割り当て終了
                    if (conn.limit !== -1 && conn.assignedCount >= conn.limit) continue; //limitを超えたらcontinue
                    rankAssignments.push({ rank, clientId: conn.clientId, ip: conn._socket.remoteAddress.replace(/^::ffff:/, "") });
                    conn.assignedCount++;
                    rank++;
                }
            }

            // 各rankの情報を一括送信
            for (const conn of clientConn) {
                conn.send(JSON.stringify({
                    type: "allocation_info",
                    size: worldSize,
                    args,
                    rankAssignments,
                }));
            }
        }
    });

    ws.on("close", () => {
        console.log("WebSocket(controller) closed:", ws.clientId);
        // 接続終了時，クライアントをcontroller配列から削除する．
        const index = controllerConn.indexOf(ws);
        if (index !== -1) {
            controllerConn.splice(index, 1);
        }
    });
};
const WebSocket = require("ws");
// HACK wssがwebsocketsecureなのかwebsocketserverなのか不明
const wss_controller = new WebSocket.Server({ port: 9000 });
const wss_participant = new WebSocket.Server({ port: 9001 });

// 接続されたcontrollerとparticipantをそれぞれ記録
let controllers = [];
let participants = [];
let connectionCounter = 0;
let rankInfos = [];

function clientListToController() {
    // controllerがない場合は送信相手がいないので終了
    if (controllers.length === 0) return;

    const clientInfos = [
        ...controllers.map(node => ({
            id: node.clientId,
            ip: node._socket.remoteAddress.replace(/^::ffff:/, "")
        })),
        ...participants.map(node => ({
            id: node.clientId,
            ip: node._socket.remoteAddress.replace(/^::ffff:/, "")
        }))
    ];

    controllers[0].send(JSON.stringify({
        type: "client_list",
        clientInfos,
    }));
}

function getParticipantWsById(clientId) {
    return [...controllers, ...participants].find(node => node.clientId === clientId);
}

wss_controller.on("connection", (ws) => {
    // controllerの複数起動を阻止
    if (controllers.length >= 1) {
        controllers[0].send(JSON.stringify({
            type: "multiple-controllers-error",
        }));
        controllers[0].close();
    }
    ws.clientId = "controller"
    controllers[0] = ws;
    clientListToController();

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        // TODO participantにも送るようにする
        if (data.type === "request_spawn") {
            let rank = 0;
            rankInfos = [];
            const clients = [];
            const worldSize = data.worldSize;
            const args = data.args;
            const nodes = data.nodes;

            let avaiableSlots = worldSize;
            for (const node of nodes) {
                ws = getParticipantWsById(node.id);
                if (!ws) {
                    console.warn(`clientId=${node.id} の client が見つかりません`);
                    continue;
                }
                ws.slots = node.slots;
                if (ws.slots == -1) {
                    avaiableSlots = 0;
                }
                else {
                    avaiableSlots -= ws.slots;
                }
                console.log(`${ws.clientId}：${ws.slots}`);
                ws.assignedCount = 0;
                clients.push(ws);
            }
            if (avaiableSlots > 0) {
                console.warn("insufficient-slots-error");
                controllers[0].send(JSON.stringify({
                    type: "insufficient-slots-error",
                }));
                return;
            }

            while (rank < worldSize) {
                // let assigned = false;
                for (const ws of clients) {
                    if (rank >= worldSize) break; // worldSize超えたら割り当て終了
                    if (ws.slots !== -1 && ws.assignedCount >= ws.slots) continue; //slotsの上限を超えたらcontinue
                    rankInfos.push({ rank, clientId: ws.clientId, ip: ws._socket.remoteAddress.replace(/^::ffff:/, "") });
                    ws.assignedCount++;
                    rank++;
                }
            }

            // 各rankの情報を一括送信
            for (const ws of clients) {
                ws.send(JSON.stringify({
                    type: "spawn_info",
                    size: worldSize,
                    args,
                    rankInfos,
                }));
            }
        }
    });

    ws.on("close", () => {
        // 接続終了時，クライアントをcontroller配列から削除する．
        const index = controllers.indexOf(ws);
        console.log(index);
        if (index !== -1) {
            controllers.splice(index, 1);
        }
    });
});

wss_participant.on("connection", (ws) => {
    ws.clientId = `participant-${++connectionCounter}`;

    participants.push(ws);
    clientListToController();
    // participantが接続されたことを通知
    ws.send(JSON.stringify({
        type: "connection_info",
        id: ws.clientId,
    }));

    ws.on("close", () => {
        // 接続終了時，クライアントをparticipants配列から削除する．
        const index = participants.indexOf(ws);
        if (index !== -1) {
            participants.splice(index, 1);
            clientListToController();
        }
    });
});



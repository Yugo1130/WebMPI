const transferConn = [];

export function findTransferConnByClientId(clientId) {
    return transferConn.find(ws => ws.clientId === clientId);
}

export const dataTransfer = (ws, req) => {
    ws.on("message", (msg) => {
        const data = JSON.parse(msg);
        if (data.type === "mpi-message-to-server") {
            const conn = findTransferConnByClientId(data.destClientId)
            if (!conn) {
                console.warn(`transfer.mjs: clientId = ${data.destClientId} の client が見つかりません`);
                return;
            }
            conn.send(JSON.stringify({
                type: "mpi-message-to-client",
                src: data.src,
                dest: data.dest,
                tag: data.tag,
                commId: data.commId,
                payload: data.payload,
            }));
        } else if (data.type === "send_known_clientId") {
            ws.clientId = data.id;
            transferConn.push(ws);
        }
    });

    ws.on("close", () => {
        console.log("WebSocket(transfer) closed:", ws.clientId);
        // 接続終了時，クライアントをtransferConn配列から削除する．
        const index = transferConn.indexOf(ws);
        if (index !== -1) {
            transferConn.splice(index, 1);
        }
    });
}

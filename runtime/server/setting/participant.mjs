import { participantConn, sendClientListToController } from "../server.mjs";

let connectionCounter = 0;

function nextParticipantId() {
    return `participant-${++connectionCounter}`;
}

export const configureParticipantConnection = (ws, req) => {
    ws.clientId = nextParticipantId();

    participantConn.push(ws);

    sendClientListToController();

    // participantが接続されたことを通知
    ws.send(JSON.stringify({
        type: "connection_info",
        id: ws.clientId,
    }));

    ws.on("close", () => {
        console.log("WebSocket(participant) closed:", ws.clientId);
        // 接続終了時，クライアントをparticipantConn配列から削除する．
        const index = participantConn.indexOf(ws);
        if (index !== -1) {
            participantConn.splice(index, 1);
            sendClientListToController();
        }
    });
};

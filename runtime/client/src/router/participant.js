import { handleSpawnInfo } from "./client.js";
import { transferSocket } from "./router.js";

const output = document.getElementById("output");
const output_info = document.getElementById("output_info");

// TODO 接続先URLは.envで管理する
const WS_HOST = location.hostname;
const WS_PORT = 9000;
const participantSocket = new WebSocket(`ws://${WS_HOST}:${WS_PORT}`, "participant");

let clientId;

participantSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "connection_info") {
        clientId = data.id;
        transferSocket.send(JSON.stringify({
            type: "send_known_clientId",
            id: clientId,
        }));
        output_info.textContent += `connected: ${clientId} \n`;

    } else if (data.type === "allocation_info") {
        handleSpawnInfo(data, clientId, output, output_info);
    } 
};

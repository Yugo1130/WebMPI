import { handleSpawnInfo } from "./client.js";

// TODO 接続先URLは.envで管理する
// const socket = new WebSocket("ws://localhost:9001");
const WS_HOST = location.hostname;
const WS_PORT = 9001;
const socket = new WebSocket(`ws://${WS_HOST}:${WS_PORT}`);

let clientId;
window.addEventListener("DOMContentLoaded", () => {
    const output = document.getElementById("output");

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "connection_info") {
            clientId = data.id;
            output.textContent += `connected: ${clientId} \n`;
        }
        if (data.type === "spawn_info") {
            handleSpawnInfo(data, clientId, output);
        }
    };
});
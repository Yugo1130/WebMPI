import { handleSpawnInfo } from "./client.js";

const output = document.getElementById("output");
const output_info = document.getElementById("output_info");

// TODO 接続先URLは.envで管理する
// const socket = new WebSocket("ws://localhost:9001");
const WS_HOST = location.hostname;
const WS_PORT = 9001;
const socket = new WebSocket(`ws://${WS_HOST}:${WS_PORT}`);

let clientId;
window.addEventListener("DOMContentLoaded", () => {

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "connection_info") {
            clientId = data.id;
            output_info.textContent += `connected: ${clientId} \n`;
        }
        if (data.type === "spawn_info") {
            handleSpawnInfo(data, clientId, output, output_info);
        }
    };
});
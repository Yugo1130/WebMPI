import { handleSpawnInfo } from "./client.js";

const argsInput = document.getElementById("args");
const np = document.getElementById("np");
const runBtn = document.getElementById("run");
const nodeTable = document.getElementById("nodeTable").querySelector("tbody");
const output = document.getElementById("output");
const output_info = document.getElementById("output_info");
const mainDiv = document.getElementById("main");
const errorDiv = document.getElementById("error");

// const socket = new WebSocket("ws://localhost:9000");
const WS_HOST = location.hostname;
const WS_PORT = 9000;
const socket = new WebSocket(`ws://${WS_HOST}:${WS_PORT}`);

let clientId = "controller";

// index.htmlで実行ボタンが押されると，サーバにnpの数や引数をwebsocketで送信．
runBtn.addEventListener("click", () => {
    const input = argsInput.value;
    // スペースで区切って配列に変換（空要素除去）
    const args = input.trim().split(/\s+/).filter(arg => arg.length > 0);
    const worldSize = parseInt(np.value, 10);

    const nodes = [];
    nodeTable.querySelectorAll("tr").forEach(row => {
        const id = row.cells[0].textContent;
        const slotInput = row.querySelector("input");
        const slots = parseInt(slotInput.value, 10);

        nodes.push({ id, slots });
    });

    // TODO slots数がWorldSizeに満たない場合はエラーを返す

    socket.send(JSON.stringify({
        type: "request_spawn",
        worldSize,
        args,
        nodes,
    }));

});

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "spawn_info") {
        handleSpawnInfo(data, clientId, output, output_info);
    }
    if (data.type === "client_list") {
        // 毎回クリアして更新
        nodeTable.innerHTML = "";

        data.clientInfos.forEach((client) => {
            const row = document.createElement("tr");
            row.innerHTML = `
            <td>${client.id}</td>
            <td>${client.ip}</td>
            <td><input type="number" min="-1" value="-1" step="1"></td>
            `;
            nodeTable.appendChild(row);
        });
    }
    if (data.type === "multiple-controllers-error") {
        mainDiv.style.display = "none";
        errorDiv.style.display = "block";
    }
    if (data.type === "insufficient-slots-error") {
        output_info.textContent += "WARNING: プロセス数が合計割当可能数を上回っています．\n"
    }

};

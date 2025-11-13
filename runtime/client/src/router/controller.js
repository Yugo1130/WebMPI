import { handleSpawnInfo } from "./client.js";
import { transferSocket } from "./router.js";

const argsInput = document.getElementById("args");
const np = document.getElementById("np");
const runBtn = document.getElementById("run");
const clientTables = document.getElementById("clientTables").querySelector("tbody");
const output = document.getElementById("output");
const output_info = document.getElementById("output_info");
const mainDiv = document.getElementById("main");
const errorDiv = document.getElementById("error");

const WS_HOST = location.hostname;
const WS_PORT = 9000;
const controllerSocket = new WebSocket(`ws://${WS_HOST}:${WS_PORT}`, "controller");

let clientId = "controller";

// 既知のclientIdをtransferSocketで送信
transferSocket.onopen = () => {
    transferSocket.send(JSON.stringify({
        type: "send_known_clientId",
        id: clientId,
    }));
}

// index.htmlで実行ボタンが押されると，サーバにnpの数や引数をwebsocketで送信．
runBtn.addEventListener("click", () => {
    const input = argsInput.value;
    // スペースで区切って配列に変換（空要素除去）
    const args = input.trim().split(/\s+/).filter(arg => arg.length > 0);
    const worldSize = parseInt(np.value, 10);

    const clientSlotLimits = [];
    clientTables.querySelectorAll("tr").forEach(row => {
        const clientId = row.cells[0].textContent;
        const slotInput = row.querySelector("input");
        // -1は無制限を意味する
        const limit = parseInt(slotInput.value, 10);

        clientSlotLimits.push({ clientId, limit });
    });

    // TODO limit数がWorldSizeに満たない場合はエラーを返す

    controllerSocket.send(JSON.stringify({
        type: "request_allocation",
        worldSize,
        args,
        clientSlotLimits,
    }));

});

controllerSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "allocation_info") {
        handleSpawnInfo(data, clientId, output, output_info);
    } else if (data.type === "update_client_list") {
        // 毎回クリアして更新
        clientTables.innerHTML = "";

        data.clientInfos.forEach((client) => {
            const row = document.createElement("tr");
            row.innerHTML = `
            <td>${client.id}</td>
            <td>${client.ip}</td>
            <td><input type="number" min="-1" value="-1" step="1"></td>
            `;
            clientTables.appendChild(row);
        });
    } else if (data.type === "multiple_controllers_error") {
        mainDiv.style.display = "none";
        errorDiv.style.display = "block";
    } else if (data.type === "insufficient_slots_error") {
        output_info.textContent += "WARNING: プロセス数が合計割当可能数を上回っています．\n"
    }
};

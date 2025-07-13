// router.js

const argsInput = document.getElementById("args");
const np = document.getElementById("np");
const runBtn = document.getElementById("run");
const nodeTable = document.getElementById("nodeTable").querySelector("tbody");
const output = document.getElementById("output");

const mainDiv = document.getElementById("main");
const errorDiv = document.getElementById("error");

const socket = new WebSocket("ws://localhost:9000");

let nodeCount = 0;
let clientId = "controller";

// index.htmlで実行ボタンが押されると，サーバにnpの数や引数をwebsocketで送信．
runBtn.addEventListener("click", () => {
    const input = argsInput.value;
    // スペースで区切って配列に変換（空要素除去）
    const args = input.trim().split(/\s+/);
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
        const size = data.size;
        const args = data.args;
        const rankInfos = data.rankInfos
        output.textContent += `割り当てランク：\n`
        for (const info of rankInfos) {
            if (info.clientId !== clientId) continue;
            output.textContent += `    rank${info.rank}\n`;
        }
        output.textContent += `\n`;

        for (const info of rankInfos) {
            output.textContent += `rank ${info.rank} は ${info.clientId} (${info.ip}) に割り当てられました．\n`;
        }
        output.textContent += `\n`;

        for (const info of rankInfos) {
            if (info.clientId !== clientId) continue;
            // index.htmlからの相対パス
            const worker = new Worker("../src/worker/worker.js");
            worker.onmessage = (e) => {
                output.textContent += `[rank ${info.rank}]: ${e.data}\n`;
            };

            worker.postMessage({
                type: "init",
                rank: info.rank,
                size,
                args
            });
        }
    }
    if (data.type === "client_list") {
        // 毎回クリアして更新
        nodeTable.innerHTML = "";
        console.log("Received data:", data);

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
    if (data.type === "error") {
        mainDiv.style.display = "none";
        errorDiv.style.display = "block";
    }
};

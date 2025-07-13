// TODO 接続先URLは.envで管理する   
const socket = new WebSocket("ws://localhost:9001");

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
    };
});
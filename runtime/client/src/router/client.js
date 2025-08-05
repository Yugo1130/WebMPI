import { sendMpiMessage } from "./router.js";

export let rankToClientId; // rankが割り振られたclientIdを導出
export let clientIdToRanks; // clientIdに割り振られたrank（複数）を導出
export let rankToWorker; // rankに対応するworkerを導出

export function handleSpawnInfo(data, clientId, outputElement) {
    rankToClientId = {};
    clientIdToRanks = {};
    rankToWorker = {};
    const size = data.size;
    const args = data.args;
    for (const info of data.rankInfos) {
        rankToClientId[info.rank] = info.clientId;
        if (!clientIdToRanks[info.clientId]) {
            clientIdToRanks[info.clientId] = [];
        }
        clientIdToRanks[info.clientId].push(info.rank);
    }

    if (clientId === "controller") {
        outputElement.textContent += "\n----------------------------------------\n";
        for (const id in clientIdToRanks) {
            outputElement.textContent += `[clientId: ${id}] Allocated Process ID: ${clientIdToRanks[id]}\n`
        }
        outputElement.textContent += `\n`;
    } else {
        outputElement.textContent += "\n----------------------------------------\nAllocated Process ID："
        outputElement.textContent += clientIdToRanks[clientId] || [];
        outputElement.textContent += `\n\n`;
    }

    for (const rank of clientIdToRanks[clientId] || []) { // undefinedだとエラーが発生するためデフォルト空配列を使用
        const assignedRank = rank;
        const worker = new Worker("/src/worker/worker.js");
        rankToWorker[rank] = worker;

        worker.onmessage = (e) => {
            switch (e.data.type) {
                case "standard-output":
                    outputElement.textContent += `[rank ${rank}]: ${e.data.text}\n`;
                    break;
                case "standard-error-output":
                    outputElement.textContent += `[ERR] [rank ${rank}]: ${e.data}\n`;
                    break;
                case "mpi-send":
                    sendMpiMessage(e.data, rank);
                    break;
                case "mpi-recv-requset":
                    requsetMpiMessage(e.data, rank);
                    break;
            }
        };

        worker.postMessage({
            type: "init",
            rank: assignedRank,
            size,
            args
        });
    }
}

import { sendMpiMessage, recvMpiMessage } from "./router.js";

export let rankToClientId; // rankが割り振られたclientIdを導出
export let clientIdToRanks; // clientIdに割り振られたrank（複数）を導出
export let rankToWorker; // rankに対応するworkerを導出
export let rankToSab; // rankに対応するSABを導出

export function handleSpawnInfo(data, clientId, output, output_info) {
    rankToClientId = {};
    clientIdToRanks = {};
    rankToWorker = {};
    rankToSab = {};
    const size = data.size;
    const args = data.args;
    for (const info of data.rankAssignments) {
        rankToClientId[info.rank] = info.clientId;
        if (!clientIdToRanks[info.clientId]) {
            clientIdToRanks[info.clientId] = [];
        }
        clientIdToRanks[info.clientId].push(info.rank);
    }

    if (clientId === "controller") {
        for (const id in clientIdToRanks) {
            output_info.textContent += `[${id}] Allocated Process ID: ${clientIdToRanks[id]}\n`;
        }
    } else {
        output_info.textContent += "Allocated Process ID：";
        output_info.textContent += clientIdToRanks[clientId] || [];
        output_info.textContent += "\n";
    }

    for (const rank of clientIdToRanks[clientId] || []) { // undefinedだとエラーが発生するためデフォルト空配列を使用
        // workerの生成
        const worker = new Worker("/src/worker/worker.js");
        rankToWorker[rank] = worker;

        // workerからのメッセージ受信
        worker.onmessage = (e) => {
            switch (e.data.type) {
                case "wasm-memory-sab-ready":
                    rankToSab[rank] = e.data.wasmmemorySab;
                    // メインスレッドからも参照しやすいようにworkerオブジェクトに紐づける
                    worker.wasmmemorySab = e.data.wasmmemorySab;
                    break;
                case "standard-output":
                    output.textContent += `[rank ${rank}]: ${e.data.text}\n`;
                    break;
                case "standard-error-output":
                    output.textContent += `[ERR] [rank ${rank}]: ${e.data}\n`;
                    break;
                case "mpi-send-eager":
                    sendMpiMessage(rank, e.data.dest, e.data.tag, e.data.commId, e.data.bufSize, e.data.bufPtr, e.data.ctlPtr);
                    break;
                case "mpi-recv":
                    recvMpiMessage(e.data.src, rank, e.data.tag, e.data.commId, e.data.bufSize, e.data.bufPtr, e.data.ctlPtr, e.data.statusPtr, undefined);
                    break;
                case "mpi-irecv":
                    recvMpiMessage(e.data.src, rank, e.data.tag, e.data.commId, e.data.bufSize, e.data.bufPtr, e.data.ctlPtr, undefined, e.data.requestPtr);
                    break;
                case "mpi-finalize":
                    // workerの終了
                    output_info.textContent += `[rank ${rank}]: Finalized.\n`;
                    worker.terminate();
                    break;
            }
        };

        // initメッセージで事前にSABをworkerに渡す
        worker.postMessage({
            type: "init",
            args,
            rank,
            size,
        });
    }
}

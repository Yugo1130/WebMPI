import { sendMpiMessage, recvMpiMessage } from "./router.js";
import { EMPTY, FULL } from "./router.js";

export let rankToClientId; // rankが割り振られたclientIdを導出
export let clientIdToRanks; // clientIdに割り振られたrank（複数）を導出
export let rankToWorker; // rankに対応するworkerを導出
export let rankToSab; // rankに対応するSABを導出

// SABのヘッダサイズ(32bytes)
export const HEADER_SIZE = 32;
// ペイロードサイズ(8KB)
export const PAYLOAD_SIZE = 8 * 1024;
// SABサイズ
export const SAB_SIZE = HEADER_SIZE + PAYLOAD_SIZE;

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

        // rankごとにSAB(eager用)を生成してworkerに渡す
        const eagerSab = new SharedArrayBuffer(SAB_SIZE);
        rankToSab[rank] = eagerSab;

        // メインスレッドからも参照しやすいようにworkerオブジェクトに紐づける
        worker.eagerSab = eagerSab;

        const ctlView = new Int32Array(eagerSab, 0, 1);
        // controlをEMPTYに設定
        Atomics.store(ctlView, 0, EMPTY);

        // workerからのメッセージ受信
        worker.onmessage = (e) => {
            switch (e.data.type) {
                case "standard-output":
                    output.textContent += `[rank ${rank}]: ${e.data.text}\n`;
                    break;
                case "standard-error-output":
                    output.textContent += `[ERR] [rank ${rank}]: ${e.data}\n`;
                    break;
                case "mpi-send-eager":
                    sendMpiMessage(rank, e.data.dest, e.data.tag, e.data.commId, e.data.payload);
                    break;
                case "mpi-recv":
                    recvMpiMessage(e.data.src, rank, e.data.tag, e.data.commId);
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
            rank,
            size,
            args,
            eagerSab,
            HEADER_SIZE,
            PAYLOAD_SIZE,
        });
    }
}

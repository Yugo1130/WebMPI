import { sendMpiMessage } from "./router.js";
import { requestMpiMessage } from "./router.js";
import { EMPTY, BUSY, READY } from "./router.js";

export let rankToClientId; // rankが割り振られたclientIdを導出
export let clientIdToRanks; // clientIdに割り振られたrank（複数）を導出
export let rankToWorker; // rankに対応するworkerを導出
export let rankToSab; // rankに対応するSABを導出

// SABのヘッダサイズ(16bytes)
export const SAB_HEADER_BYTES = 16;
// ヘッダサイズ(32bytes)
export const SLOT_HEADER_BYTES = 32; 
// ペイロードサイズ(8KB)
export const SLOT_PAYLOAD_BYTES = 8 * 1024;
// SLOTの合計サイズ
export const SLOT_SIZE = SLOT_HEADER_BYTES + SLOT_PAYLOAD_BYTES;
// SABあたりのSLOT数
export const SLOT_COUNT = 32
// SABサイズ
export const SAB_SIZE = SAB_HEADER_BYTES + SLOT_COUNT * SLOT_SIZE;

export function handleSpawnInfo(data, clientId, output, output_info) {
    rankToClientId = {};
    clientIdToRanks = {};
    rankToWorker = {};
    rankToSab = {};
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
        worker.sharedSab = eagerSab;

        const dv32 = new Int32Array(eagerSab, 0, 4);

        Atomics.store(dv32, 0, 0); // head index
        Atomics.store(dv32, 1, 0); // tail index
        Atomics.store(dv32, 2, SLOT_COUNT); // total slots
        Atomics.store(dv32, 3, SLOT_SIZE); // slot size

        // SAB内の各SLOTの初期化
        for(let i = 0; i < SLOT_COUNT; i++) {
            const slotOffset = SAB_HEADER_BYTES + i * SLOT_SIZE;
            const slotHeaderView = new Int32Array(eagerSab, slotOffset, 1);
            // controlをEMPTYに設定
            Atomics.store(slotHeaderView, 0, EMPTY);
        }  

        // workerからのメッセージ受信
        worker.onmessage = (e) => {
            switch (e.data.type) {
                case "standard-output":
                    output.textContent += `[rank ${rank}]: ${e.data.text}\n`;
                    break;
                case "standard-error-output":
                    output.textContent += `[ERR] [rank ${rank}]: ${e.data}\n`;
                    break;
                case "mpi-send":
                    sendMpiMessage(e.data, rank);
                    break;
                case "mpi-recv-request":
                    requestMpiMessage(e.data, rank);
                    break;
            }
        };

        // initメッセージで事前にSABをworkerに渡す
        worker.postMessage({
            type: "init",
            rank,
            size,
            args,
            sab: eagerSab,
        });
    }
}

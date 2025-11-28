import { rankToClientId } from "./client.js"
import { rankToSab } from "./client.js"
import { HEADER_SIZE, PAYLOAD_SIZE } from "./client.js";

const WS_HOST = location.hostname;
const WS_PORT = 9000;
export const transferSocket = new WebSocket(`ws://${WS_HOST}:${WS_PORT}`, "transfer");

const dataQueue = [];
const requestQueue = [];

// 制御フラグ(EMPTY = 空き, FULL = データあり)
export const EMPTY = 0, FULL = 1;

// mpi.hに合わせる
export const ANY_SRC = -1;
export const ANY_TAG = -1;

function recvMatches(sendSrc, sendTag, sendCommId, requestQueue) {
    console.log("recvMatches dataQueue:", dataQueue);
    console.log("recvMatches requestQueue:", requestQueue);
    for (let i = 0; i < requestQueue.length; i++) {
        const recv = requestQueue[i];
        const srcMatch = (recv.src === ANY_SRC) || (sendSrc === recv.src);
        const tagMatch = (recv.tag === ANY_TAG) || (sendTag === recv.tag);
        const commIdMatch = (sendCommId === recv.commId);
        if (srcMatch && tagMatch && commIdMatch) {
            return i; // マッチしたインデックスを返す
        }
    }
    return -1; // マッチなし
}

function sendMatches(recvSrc, recvTag, recvCommId, dataQueue) {
    console.log("sendMatches dataQueue:", dataQueue);
    console.log("sendMatches requestQueue:", requestQueue);
    for (let i = 0; i < dataQueue.length; i++) {
        const send = dataQueue[i];
        if (send.matched) continue; // 既にマッチ済みの場合はスキップ
        const srcMatch = (recvSrc === ANY_SRC) || (recvSrc === send.src);
        const tagMatch = (recvTag === ANY_TAG) || (recvTag === send.tag);
        const commIdMatch = (recvCommId === send.commId);
        if (srcMatch && tagMatch && commIdMatch) {
            return i; // マッチしたインデックスを返す
        }
    }
    return -1; // マッチなし
}

function writeToSab(eagerSab, src, tag, commId, payload, requestId = undefined) {
    // ブロッキング用Worker制御用（EMPTY = 0, FULL = 1）
    const ctlBlockingWorkerView = new Int32Array(eagerSab, 0, 1);
    // ノンブロッキング用Worker制御用（EMPTY = 0, FULL = 1）
    const ctlNonBlockingWorkerView = new Int32Array(eagerSab, 4, 1);
    // router制御用（EMPTY = 0, FULL = 1）
    const ctlRouterView = new Int32Array(eagerSab, 8, 1);
    // ノンブロッキング用RequestId伝達用
    const requestIdView = new Uint32Array(eagerSab, 12, 1);
    const lenView = new Int32Array(eagerSab, 16, 1); // length            
    const metaView = new Int32Array(eagerSab, 20, 3); // src, tag, commId,
    const dataView = new Uint8Array(eagerSab, HEADER_SIZE, PAYLOAD_SIZE); // データ領域

    const length = Math.min(payload.byteLength, dataView.byteLength);

    dataView.set(payload.subarray(0, length), 0);
    Atomics.store(lenView, 0, length);
    Atomics.store(metaView, 0, src);
    Atomics.store(metaView, 1, tag);
    Atomics.store(metaView, 2, commId);

    // EMPTY -> FULLにしてworkerを起こす
    // ここで対象のworkerをきちんと起こせるかは不明
    Atomics.store(ctlBlockingWorkerView, 0, FULL);
    Atomics.store(ctlNonBlockingWorkerView, 0, FULL);
    Atomics.store(ctlRouterView, 0, FULL);
    // requestIdがundefinedの場合はブロッキングrecvなのでrequestIdは不要
    if(requestId === undefined) {
        console.log("ブロッキング");
        Atomics.notify(ctlBlockingWorkerView, 0, 1);
    } else {
        console.log("ノンブロッキング requestId:", requestId);
        Atomics.store(requestIdView, 0, requestId);
        Atomics.notify(ctlNonBlockingWorkerView, 0); // 全てのノンブロッキングwaitを起こす
    }
}

function sendToServerMpiMessage(src, dest, tag, commId, payload) {
    const destClientId = rankToClientId[dest];

    transferSocket.send(JSON.stringify({
        type: "mpi-message-to-server",
        src,
        dest,
        destClientId,
        tag,
        commId,
        payload: Array.from(payload), // Uint8ArrayからArrayに変換
    }));
}

async function sendingProcess(src, dest, tag, commId, payload) {
    let index = recvMatches(src, tag, commId, requestQueue);
    console.log("[sendingProcess] matched data at index:", index);
    if (index >= 0) {
        const requestId = requestQueue[index].requestId ?? undefined;
        // requestQueueから該当エントリを削除
        requestQueue.splice(index, 1);

        // 送信先rankのSABを取得
        const eagerSab = rankToSab[dest];

        // router制御用（EMPTY = 0, FULL = 1）
        const ctlRouterView = new Int32Array(eagerSab, 8, 1);

        // 制御フラグがFULLの場合は待機（非同期処理）
        // ctlRouterView[0] !== FULL：{async:false, value:"not-equal"} が返る
        // ctlRouterView[0] === FULL：{async:true, value: Promise<"ok"|"timed-out">} が返る
        while (true) {
            const result = Atomics.waitAsync(ctlRouterView, 0, FULL);
            if (!result.async) break; // EMPTYであれば抜ける
            await result.value; // FULLの場合は待機
        }

        // console.log("[sendingProcess] 再開, requestId:", requestId);

        writeToSab(eagerSab, src, tag, commId, payload, requestId);
    } else {
        // arraybufferにするべきかもしれない
        dataQueue.push({
            src,
            dest,
            tag,
            commId,
            payload,
        });
    }
}

export function sendMpiMessage(src, dest, tag, commId, payload) {
    const srcClientId = rankToClientId[src];
    const destClientId = rankToClientId[dest];
    // 送信元と送信先が同一clientの場合
    if (srcClientId === destClientId) {
        sendingProcess(src, dest, tag, commId, payload);
    // 送信先が異なるclientの場合はサーバ経由で送信
    } else {
        sendToServerMpiMessage(src, dest, tag, commId, payload);
    }
}

export async function recvMpiMessage(src, dest, tag, commId, requestId = undefined) {
    let index = sendMatches(src, tag, commId, dataQueue);
    console.log("[recvMpiMessage] matched data at index:", index);
    if (index >= 0) {
        // dataQueueから該当エントリを論理削除（ここで消さないのはpayloadのコピーを避けるため） 
        dataQueue[index].matched = true;

        // 送信先rankのSABを取得
        const eagerSab = rankToSab[dest];

        // router制御用（EMPTY = 0, FULL = 1）
        const ctlRouterView = new Int32Array(eagerSab, 8, 1);

        // 制御フラグがFULLの場合は待機（非同期処理）
        // ctlRouterView[0] !== FULL：{async:false, value:"not-equal"} が返る
        // ctlRouterView[0] === FULL：{async:true, value: Promise<"ok"|"timed-out">} が返る
        while (true) {
            const result = Atomics.waitAsync(ctlRouterView, 0, FULL);
            if (!result.async) break; // EMPTYであれば抜ける
            await result.value;
        }

        // console.log("[recvMpiMessage] 再開, requestId:", requestId);

        // MPI_ANY_SOURCE, MPI_ANY_TAG対応に対応するため，src, tagは送信元の情報を使用する．
        writeToSab(eagerSab, dataQueue[index].src, dataQueue[index].tag, commId, dataQueue[index].payload, requestId);

        // SABに書き込んだ後にdataQueueから削除
        dataQueue.splice(index, 1);
    } else {
        requestQueue.push({
            src,
            dest,
            tag,
            commId,
            requestId,
        });
    }
}

transferSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "mpi-message-to-client") {
        const payload = Uint8Array.from(data.payload); // ArrayからUint8Arrayに変換
        sendingProcess(data.src, data.dest, data.tag, data.commId, payload);
    }
}

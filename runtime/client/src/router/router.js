import { rankToClientId } from "./client.js"
import { rankToSab } from "./client.js"
import { HEADER_SIZE, PAYLOAD_SIZE } from "./client.js";

const dataQueue = [];
const requestQueue = [];

// 制御フラグ(EMPTY = 空き, FULL = データあり)
export const EMPTY = 0, FULL = 1;

// mpi.hに合わせる
export const ANY_SRC = -1;
export const ANY_TAG = -1;

function recvMatches(sendSrc, sendTag, sendCommId, requestQueue) {
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

function writeToSab(eagerSab, data, src) {
    const ctlView = new Int32Array(eagerSab, 0, 1); // control    
    const lenView = new Int32Array(eagerSab, 4, 1); // length            
    const metaView = new Int32Array(eagerSab, 8, 6); // src, tag, commId, 予備×3
    const dataView = new Uint8Array(eagerSab, HEADER_SIZE, PAYLOAD_SIZE); // データ領域

    const payload = data.payload ?? new Uint8Array(0); // データ本体（Uint8Array）
    const length = Math.min(payload.byteLength, dataView.byteLength);

    dataView.set(payload.subarray(0, length), 0);
    Atomics.store(lenView, 0, length);
    Atomics.store(metaView, 0, src);
    Atomics.store(metaView, 1, data.tag == null ? -1 : data.tag);
    Atomics.store(metaView, 2, data.commId);

    // EMPTY -> FULLにしてworkerを起こす
    Atomics.store(ctlView, 0, FULL);
    Atomics.notify(ctlView, 0, 1);
}   

export async function sendMpiMessage(data, src) {
    const srcClientId = rankToClientId[src];
    const destClientId = rankToClientId[data.dest];
    // 送信元と送信先が同一clientの場合
    if (srcClientId === destClientId) {
        let index = recvMatches(src, data.tag, data.commId, requestQueue);
        if (index >= 0) {
            // requestQueueから該当エントリを削除
            requestQueue.splice(index, 1);

            // 送信先rankのSABを取得
            const eagerSab = rankToSab[data.dest];

            const ctlView = new Int32Array(eagerSab, 0, 1); // control

            // 制御フラグがFULLの場合は待機（非同期処理）
            // ctlView[0] !== FULL：{async:false, value:"not-equal"} が返る
            // ctlView[0] === FULL：{async:true, value: Promise<"ok"|"timed-out">} が返る
            while (true) {
                const result = Atomics.waitAsync(ctlView, 0, FULL);
                if (!result.async) break;
                await result.value;
            }

            writeToSab(eagerSab, data, src);
        } else {
            // arraybufferにするべきかもしれない
            dataQueue.push({
                src,
                dest: data.dest,
                tag: data.tag,
                commId: data.commId,
                payload: data.payload,
            });
        }
    } else {
        console.log("送信先が異なる");
    }
}

export async function recvMpiMessage(data, dest) {
    const srcClientId = rankToClientId[data.src];
    const destClientId = rankToClientId[dest];
    // 送信元と送信先が同一clientの場合
    if (srcClientId === destClientId) {
        let index = sendMatches(data.src, data.tag, data.commId, dataQueue);
        if (index >= 0) {
            // dataQueueから該当エントリを論理削除
            dataQueue[index].matched = true;
            
            // 送信先rankのSABを取得
            const eagerSab = rankToSab[dest];
            
            const ctlView = new Int32Array(eagerSab, 0, 1); // control
            
            // 制御フラグがFULLの場合は待機（非同期処理）
            // ctlView[0] !== FULL：{async:false, value:"not-equal"} が返る
            // ctlView[0] === FULL：{async:true, value: Promise<"ok"|"timed-out">} が返る
            while (true) {
                const result = Atomics.waitAsync(ctlView, 0, FULL);
                if (!result.async) break;
                await result.value;
            }

            writeToSab(eagerSab, dataQueue[index], data.src);

            // SABに書き込んだ後にdataQueueから削除
            dataQueue.splice(index, 1);
        } else {
            requestQueue.push({
                src: data.src,
                dest,
                tag: data.tag,
                commId: data.commId,
            });
        }
    } else {
        console.log("送信元が異なる");
    }
}

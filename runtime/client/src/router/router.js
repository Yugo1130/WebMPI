import { rankToClientId } from "./client.js"
import { rankToWorker, rankToSab } from "./client.js"
import { SAB_HEADER_BYTES, SLOT_HEADER_BYTES, SLOT_PAYLOAD_BYTES, SLOT_SIZE, SLOT_COUNT, SAB_SIZE } from "./client.js";

const expectedQueue = [];
const unexpectedQueue = [];

// 制御フラグ(EMPTY = 空き, BUSY = 使用中, READY = データあり)
export const EMPTY = 0, BUSY = 1, READY = 2;

// mpi.hに合わせる
export const ANY_SOURCE = -1;
export const ANY_TAG = -1;

function matches(sendSource, sendTag, sendCommId, recvqueue) {
    for (let i = 0; i < recvqueue.length; i++) {
        const recv = recvqueue[i];
        const sourceMatch = (recv.source === ANY_SOURCE) || (sendSource === recv.source);
        const tagMatch = (recv.tag === ANY_TAG) || (sendTag === recv.tag);
        const commIdMatch = (sendCommId === recv.commId);
        if (sourceMatch && tagMatch && commIdMatch) {
            return i; // マッチしたインデックスを返す
        }
    }
    return -1; // マッチなし
}

function reserveSlot(sab) {
    const dv32 = new Int32Array(sab);
    const slotCount = dv32[2];

    for (let i = 0; i < slotCount; i++) {
        const slotOffset = SAB_HEADER_BYTES + i * SLOT_SIZE;
        const slotHeaderView = new Int32Array(sab, slotOffset, 1);
        const control = Atomics.load(slotHeaderView, 0);
        if (control === EMPTY) {
            // EMPTY -> BUSY に変更して予約完了
            Atomics.store(slotHeaderView, 0, BUSY);
            return slotOffset;
        }
    }
    return -1; // 空きスロットなし
}

export function sendMpiMessage(data, source) {
    const destClientId = rankToClientId[data.dest];
    const sourceClientId = rankToClientId[source]
    // 送信元と送信先が同一clientの場合
    if (destClientId === sourceClientId) {
        // ヘッダレイアウト(28bytes)
        // control(4)     制御フラグ
        // length(4)      データ長
        // source(4)      送信元
        // tag(4)         タグ
        // commId(4)      コミュニケータID
        // datatypeId(4)  データ型ID
        // count(4)       要素数

        // 送信先rankのSABを取得
        const destRank = data.dest;
        const eagerSab = rankToSab[destRank];

        // データ本体（Uint8Array）
        const payload = data.payload;

        // 空きスロットの確保を行い，オフセットを取得
        const slotOffset = reserveSlot(eagerSab);
        if (slotOffset === -1) {
            // 空きスロットなしの場合はrendezvousに移行するべきか？
            console.error("空きスロットがありません");
            return;
        }
        // control
        const ctlView = new Int32Array(eagerSab, slotOffset, 1);
        // length
        const lenView = new Int32Array(eagerSab, slotOffset + 4, 1);
        // source, tag, commId, datatypeId, count, 予備
        const metaView = new Int32Array(eagerSab, slotOffset + 8, 6);
        // データ領域
        const dataView = new Uint8Array(eagerSab, slotOffset + HEADER_SIZE, SLOT_PAYLOAD_BYTES);

        // dataviewを超えるサイズのpayloadが来た場合は切り捨てる
        dataView.set(payload.subarray(0, dataView.byteLength), 0);
        Atomics.store(lenView, 0, dataView.byteLength);
        Atomics.store(metaView, 0, source);
        Atomics.store(metaView, 1, data.tag == null ? -1 : data.tag);
        Atomics.store(metaView, 2, data.commId);
        Atomics.store(metaView, 3, data.datatypeId || 0);
        Atomics.store(metaView, 4, data.count || 0);

        
        if (matches(data.source, data.tag, data.commId, expectedQueue) >= 0) {
            // BUSY -> READYにしてworkerを起こす
            Atomics.store(ctlView, 0, READY);
            Atomics.notify(ctlView, 0, 1);
        } else {
            // メタデータのみをexpectedQueueに入れる
            expectedQueue.push({
                source,
                dest: data.dest,
                tag: data.tag,
                commId: data.commId,
                count: data.count,
                datatypeId: data.datatypeId,
                slotOffset,
            });
        }
    } else {
        console.log("送信先が異なる");
    }
}

export function requestMpiMessage(data, dest) {
    requestQueue.push({
        dest,
        source: data.source,
        tag: data.tag,
        commId: data.commId
    });
}

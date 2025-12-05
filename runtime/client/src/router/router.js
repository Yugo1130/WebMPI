import { rankToClientId } from "./client.js"
import { rankToSab } from "./client.js"

const WS_HOST = location.hostname;
const WS_PORT = 9000;
export const transferSocket = new WebSocket(`ws://${WS_HOST}:${WS_PORT}`, "transfer");

const unexpectedQueue = [];
const expectedQueue = [];

// 制御フラグ(WAITING = 空き, READY = データあり)
export const WAITING = 0, READY = 1;

// mpi.hに合わせる
export const ANY_SRC = -1;
export const ANY_TAG = -1;

function recvMatches(sendSrc, sendTag, sendCommId, expectedQueue) {
    for (let i = 0; i < expectedQueue.length; i++) {
        const recv = expectedQueue[i];
        const srcMatch = (recv.src === ANY_SRC) || (sendSrc === recv.src);
        const tagMatch = (recv.tag === ANY_TAG) || (sendTag === recv.tag);
        const commIdMatch = (sendCommId === recv.commId);
        if (srcMatch && tagMatch && commIdMatch) {
            return i; // マッチしたインデックスを返す
        }
    }
    return -1; // マッチなし
}

function sendMatches(recvSrc, recvTag, recvCommId, unexpectedQueue) {
    for (let i = 0; i < unexpectedQueue.length; i++) {
        const send = unexpectedQueue[i];
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

function transferDataToServer(src, dest, tag, commId, srcBufSize, srcBufPtr, srcCtlPtr = undefined , srcRequestPtr = undefined) {
    const destClientId = rankToClientId[dest];
    const srcSab = rankToSab[src]; // 送信元rankのSAB
    const payload = new Uint8Array(srcSab, srcBufPtr, srcBufSize); // 送信元バッファビュー

    transferSocket.send(JSON.stringify({
        type: "mpi-message-to-server",
        src,
        dest,
        tag,
        commId,
        bufSize: srcBufSize,
        payload: Array.from(payload), // Uint8ArrayからArrayに変換
        destClientId,
    }));

    if (srcCtlPtr !== undefined) { // Sendの場合
        if(srcCtlPtr === 0) {
            console.error("Error: srcCtlPtr is 0");
        }
        const srcCtlView = new Int32Array(srcSab, srcCtlPtr, 1); // 送信元制御ビュー
        Atomics.store(srcCtlView, 0, READY);
        Atomics.notify(srcCtlView, 0, 1);
    } else if (srcRequestPtr !== undefined) { // Isendの場合
        if(srcRequestPtr === 0) {
            console.error("Error: srcRequestPtr is 0");
        }
        const srcRequestView = new Int32Array(srcSab, srcRequestPtr, 5); // リクエストビュー
        srcRequestView.set([srcRequestView[0], READY, length, src, tag]);
        Atomics.notify(srcRequestView, 1, 1);
    }
}

// recvが先に出ていて同一client内で完結する場合
function copyDataBetweenLocalWorkers(src, tag, srcBufSize, srcBufPtr, srcCtlPtr = undefined, srcRequestPtr = undefined, dest, destBufSize, destBufPtr, destCtlPtr = undefined, destStatusPtr = undefined, destRequestPtr = undefined) {
    const srcSab = rankToSab[src]; // 送信元rankのSAB
    const destSab = rankToSab[dest]; // 送信先rankのSAB
    
    const srcBufView = new Uint8Array(srcSab, srcBufPtr, srcBufSize); // 送信元バッファビュー
    const destBufView = new Uint8Array(destSab, destBufPtr, destBufSize); // 送信先バッファビュー
    const length = Math.min(srcBufSize, destBufSize);

    destBufView.set(srcBufView.subarray(0, length), 0); // 送信元SABから送信先SABへコピー

    // コピーを作成して送信バッファは利用可能となったため，READYに設定して通知
    if (srcCtlPtr !== undefined) { // Sendの場合
        const srcCtlView = new Int32Array(srcSab, srcCtlPtr, 1); // 送信元制御ビュー
        Atomics.store(srcCtlView, 0, READY);
        Atomics.notify(srcCtlView, 0, 1);
    } else if (srcRequestPtr !== undefined) { // Isendの場合
        const srcRequestView = new Int32Array(srcSab, srcRequestPtr, 5); // リクエストビュー
        srcRequestView.set([srcRequestView[0], READY, length, src, tag]);
        Atomics.notify(srcRequestView, 1, 1);
    }
    
    // 受信側のステータス・制御ビューの更新および通知
    if (destStatusPtr !== undefined && destCtlPtr !== undefined) { // Recvの場合
        const statusView = new Int32Array(destSab, destStatusPtr, 4); // ステータスビュー
        statusView.set([length, src, tag, 0]); 

        const destCtlView = new Int32Array(destSab, destCtlPtr, 1); // 送信先制御ビュー
        Atomics.store(destCtlView, 0, READY);
        Atomics.notify(destCtlView, 0, 1);
    } else if (destRequestPtr !== undefined) { // Irecvの場合
        const destRequestView = new Int32Array(destSab, destRequestPtr, 5); // リクエストビュー
        destRequestView.set([destRequestView[0], READY, length, src, tag]);
        Atomics.notify(destRequestView, 1, 1);
    }
}

// sendが先に出ていて同一client内で完結する場合
function copyPayloadTodestBuf(src, tag, payload, dest, destBufSize, destBufPtr, destCtlPtr = undefined, destStatusPtr = undefined, destRequestPtr = undefined) {
    const destSab = rankToSab[dest]; // 送信先rankのSAB
    
    const destBufView = new Uint8Array(destSab, destBufPtr, destBufSize); // 送信先バッファビュー
    const length = Math.min(payload.byteLength, destBufSize);
    
    destBufView.set(payload.subarray(0, length), 0);

    if (destStatusPtr !== undefined && destCtlPtr !== undefined) { // Recvの場合
        const statusView = new Int32Array(destSab, destStatusPtr, 4); // ステータスビュー
        statusView.set([length, src, tag, 0]); 

        const destCtlView = new Int32Array(destSab, destCtlPtr, 1); // 送信先制御ビュー
        Atomics.store(destCtlView, 0, READY);
        Atomics.notify(destCtlView, 0, 1);
    } else if (destRequestPtr !== undefined) {
        const destRequestView = new Int32Array(destSab, destRequestPtr, 5); // リクエストビュー
        destRequestView.set([destRequestView[0], READY, length, src, tag]);
        Atomics.notify(destRequestView, 1, 1);
    }
}

export function sendMpiMessage(src, dest, tag, commId, srcBufSize, srcBufPtr, srcCtlPtr = undefined, srcRequestPtr = undefined) {
    const srcClientId = rankToClientId[src];
    const destClientId = rankToClientId[dest];
    // 送信元と送信先が同一clientの場合
    if (srcClientId === destClientId) {
        let index = recvMatches(src, tag, commId, expectedQueue);
        if (index >= 0) {
            // const requestId = expectedQueue[index].requestId ?? undefined;
            copyDataBetweenLocalWorkers(src, 
                                        tag, 
                                        srcBufSize, 
                                        srcBufPtr, 
                                        srcCtlPtr, // Send用
                                        srcRequestPtr, // Isend用（srcCtlPtrの機能をメンバ変数で代替）
                                        dest, 
                                        expectedQueue[index].bufSize, 
                                        expectedQueue[index].bufPtr, 
                                        expectedQueue[index].ctlPtr, // Recv用
                                        expectedQueue[index].destStatusPtr, // Recv用
                                        expectedQueue[index].destRequestPtr); // Irecv用
            // expectedQueueから該当エントリを削除
            expectedQueue.splice(index, 1);
        } else {
            // recvがまだ出ていないのでsrcBufPtrからデータをarraybufferにコピーして保存しておく
            const srcSab = rankToSab[src]; // 送信元rankのSAB

            const srcBufView = new Uint8Array(srcSab, srcBufPtr, srcBufSize); // 送信元バッファビュー

            const payload = new Uint8Array(srcBufView); // コピーを作成（コピーなしではSABが共有されてしまう）

            // コピーを作成して送信バッファは利用可能となったため，READYに設定して通知
            if (srcCtlPtr !== undefined) { // Sendの場合
                const srcCtlView = new Int32Array(srcSab, srcCtlPtr, 1); // 送信元制御ビュー
                Atomics.store(srcCtlView, 0, READY);
                Atomics.notify(srcCtlView, 0, 1);
            } else if (srcRequestPtr !== undefined) { // Isendの場合
                const srcRequestView = new Int32Array(srcSab, srcRequestPtr, 5); // リクエストビュー
                srcRequestView.set([srcRequestView[0], READY, length, src, tag]);
                Atomics.notify(srcRequestView, 1, 1);
            }

            unexpectedQueue.push({
                src,
                dest,
                tag,
                commId,
                payload,
            });
        }
    } else {
        // 送信先が異なるclientの場合はサーバ経由で送信
        transferDataToServer(src, dest, tag, commId, srcBufSize, srcBufPtr, srcCtlPtr, srcRequestPtr);
    }
}

export async function recvMpiMessage(src, dest, tag, commId, destBufSize, destBufPtr, destCtlPtr, destStatusPtr = undefined, destRequestPtr = undefined) {
    let index = sendMatches(src, tag, commId, unexpectedQueue);
    if (index >= 0) {
        // unexpectedQueueから該当エントリを論理削除（ここで消さないのはpayloadのコピーを避けるため） 
        unexpectedQueue[index].matched = true;

        copyPayloadTodestBuf(unexpectedQueue[index].src, // MPI_ANY_SOURCE対応
                             unexpectedQueue[index].tag, // MPI_ANY_TAG対応
                             unexpectedQueue[index].payload,
                             dest, 
                             destBufSize, 
                             destBufPtr, 
                             destCtlPtr, 
                             destStatusPtr, 
                             destRequestPtr);
        
        // 受信バッファに書き込んだ後にunexpectedQueueから該当エントリを削除
        unexpectedQueue.splice(index, 1);
    } else {
        expectedQueue.push({
            src,
            dest,
            tag,
            commId,
            bufSize: destBufSize,
            destStatusPtr,
            destRequestPtr,
            bufPtr: destBufPtr,
            ctlPtr: destCtlPtr,
        });
    }
}

transferSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "mpi-message-to-client") {
        const payload = Uint8Array.from(data.payload); // ArrayからUint8Arrayに変換
        let index = recvMatches(data.src, data.tag, data.commId, expectedQueue);
        if (index >= 0) {
            copyPayloadTodestBuf(data.src, // MPI_ANY_SOURCE対応
                                 data.tag, // MPI_ANY_TAG対応
                                 payload,
                                 expectedQueue[index].dest, 
                                 expectedQueue[index].bufSize, 
                                 expectedQueue[index].bufPtr, 
                                 expectedQueue[index].ctlPtr, 
                                 expectedQueue[index].destStatusPtr, 
                                 expectedQueue[index].destRequestPtr);

            // expectedQueueから該当エントリを削除
            expectedQueue.splice(index, 1);
        } else {
            // recvがまだ出ていないのでpayloadを保存しておく
            unexpectedQueue.push({
                src: data.src,
                dest: data.dest,
                tag: data.tag,
                commId: data.commId,
                payload,
            });
        }  
    }
}

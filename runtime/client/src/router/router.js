import { rankToClientId } from "./client.js"
import { rankToWorker } from "./client.js"

const messageQueue = [];
const requestQueue = [];

export function sendMpiMessage(data, source) {
    const destClientId = rankToClientId[data.dest];
    const sourceClientId = rankToClientId[source]
    // 送信元と送信先が同一clientの場合
    if (destClientId === sourceClientId) {
        const matchedMsgIndex = requestQueue.findIndex(msg =>
            msg.dest === data.dest && // 送信先が同じ
            (msg.source === data.source || msg.source === null) && // 送信元が同じがMPI_ANY_SOURCE
            (msg.tag === data.tag || msg.tag === null) && // タグが同じかMPI_ANY_TAG
            msg.commId === data.commId // コミュニケータが同じ
        );
        // リクエスト待ちの場合はメッセージキューに格納
        if (matchedMsgIndex !== -1) {
            messageQueue.push({
                source,
                dest: data.dest,
                tag: data.tag,
                commId: data.commId,
                count: data.count,
                datatypeId: data.datatypeId,
                payload: data.payload,
            });
        }else{
            
        }
    } else {
        console.log("送信先が異なる");
    }
}

export function requsetMpiMessage(data, dest) {
    requestQueue.push({
        dest,
        source: data.source,
        tag: data.tag,
        commId: data.commId
    });
}

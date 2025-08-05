import { rankToClientId } from "./client.js"
import { rankToWorker } from "./client.js"

const messageQueue = [];
const requestQueue = [];

export function sendMpiMessage(data, source) {
    // 送信先が同じclientの場合
    const destClientId = rankToClientId[data.dest];
    const sourceClientId = rankToClientId[source]
    if (destClientId === sourceClientId) {
        const matchedMsgIndex = requestQueue.findIndex(msg =>
            (msg.source === data.source || msg.source === null) &&
            (msg.tag === data.tag || msg.tag === null) &&
            msg.commId === data.commId
        );
        if (matchedMsgIndex !== -1) {
            // console.log("送信先が同じ");
            // 送信先ごとにキューを管理
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
        source: data.source,
        dest,
        tag: data.tag,
        commId: data.commId
        // destは？
    });
}

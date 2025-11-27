#include "mpi.h"
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <emscripten.h>

// 通信定義
// TODO 自作コミュニケータに対応させる．
MPI_Comm MPI_COMM_WORLD;

// 内部設定関数（JS側から設定する）

void mpi_internal_init_world_comm(int rank, int size) {
    MPI_COMM_WORLD.commId = 0;
    MPI_COMM_WORLD.commRank = rank;
    MPI_COMM_WORLD.commSize = size;
}

// 補助関数

int mpi_get_size(MPI_Datatype dtype) {
    return (dtype >> 8) & 0xFF;
}

int mpi_get_id(MPI_Datatype dtype) {
    return dtype & 0xFF;
}

// MPI関数実装
EM_JS(void, js_call_init_comm, (), {
    if (typeof Module._mpi_internal_init_world_comm === "function") {
        Module._mpi_internal_init_world_comm(Module.rank, Module.size);
    } else {
        console.error("[ERR] mpi_internal_init_world_comm not found");
    }
});

int MPI_Init(int *argc, char ***argv) {
    js_call_init_comm();
    return MPI_SUCCESS;
}

int MPI_Comm_size(MPI_Comm comm, int *size) {
    *size = comm.commSize;
    return MPI_SUCCESS;
}

int MPI_Comm_rank(MPI_Comm comm, int *rank) {
    *rank = comm.commRank;
    return MPI_SUCCESS;
}

EM_JS(void, js_mpi_wait, (intptr_t requestPtr, intptr_t statusPtr), {

});

int MPI_Wait(MPI_Request *request, MPI_Status *status) {
    // TODO 非同期通信の実装
    intptr_t request_ptr = (intptr_t)(request);
    intptr_t status_ptr = (intptr_t)(status);
    js_mpi_wait(request_ptr, status_ptr);
    request->isComplete = 1;
    return MPI_SUCCESS;
}

EM_JS(void, js_mpi_send_eager, (intptr_t ptr, int dest, int tag, int commId, int size), {
    // HEAP8はwasmのメモリに張られたビュー．
    // それを新しいarraybufferにコピーしてそれに張られたUint8Array(=buf)を作成
    // buf.bufferがarraybufferそのもの．
    // bufはUint8Array（ビュー）
    const buf = HEAPU8.slice(ptr, ptr + size);
    // OPTIMIZE 以下を参考にコピーではなく移譲にする．（現状2回コピーが発生している．）
    // 論文：オーバーヘッドを比較する．
    // https://qiita.com/Quramy/items/8c12e6c3ad208c97c99a
    postMessage({
        type: "mpi-send-eager",
        dest,
        tag,
        commId,
        payload: buf,
    });
});

int MPI_Send(const void *buf, int count, MPI_Datatype datatype, int dest, int tag, MPI_Comm comm) {
    intptr_t ptr = (intptr_t)buf;  // wasm上のアドレスを取得
    int buf_bytes = count * mpi_get_size(datatype);
    js_mpi_send_eager(ptr, dest, tag, comm.commId, buf_bytes);
    return MPI_SUCCESS;
}

EM_JS(void, js_mpi_isend_eager, (intptr_t ptr, int dest, int tag, int commId, int size, intptr_t requestPtr), {
    const buf = HEAPU8.slice(ptr, ptr + size);
    const requestId = requestPtr; // リクエスト識別子としてポインタを使用
    // 受け取り側未実装
    postMessage({
        type: "mpi-isend-eager",
        dest,
        tag,
        commId,
        payload: buf,
        requestId,
    });
});

int MPI_Isend(const void *buf, int count, MPI_Datatype datatype, int dest, int tag, MPI_Comm comm, MPI_Request *request) {
    intptr_t ptr = (intptr_t)buf;  // wasm上のアドレスを取得
    intptr_t request_ptr = (intptr_t)(request);
    int buf_bytes = count * mpi_get_size(datatype);
    js_mpi_isend_eager(ptr, dest, tag, comm.commId, buf_bytes, request_ptr);
    return MPI_SUCCESS;
}

EM_JS(void, js_mpi_recv, (intptr_t bufPtr, int count, int datatypeId, int src, int tag, int commId, intptr_t statusPtr, int bufBytes), {
    const sab = Module.eagerSab;
    const HEADER_SIZE = Module.HEADER_SIZE;
    const PAYLOAD_SIZE = Module.PAYLOAD_SIZE;

    // ブロッキング用Worker制御用（EMPTY = 0, FULL = 1）
    const ctlBlockingWorkerView = new Int32Array(sab, 0, 1);
    // ノンブロッキング用Worker制御用（EMPTY = 0, FULL = 1）
    const ctlNonBlockingWorkerView = new Int32Array(sab, 4, 1);
    // router制御用（EMPTY = 0, FULL = 1）
    const ctlRouterView = new Int32Array(sab, 8, 1);
    // ノンブロッキング用RequestId伝達用
    const requestIdView = new Uint32Array(sab, 12, 1);
    const lenView = new Int32Array(sab, 16, 1); // length            
    const metaView = new Int32Array(sab, 20, 3); // src, tag, commId,
    const dataView = new Uint8Array(sab, HEADER_SIZE, PAYLOAD_SIZE); // データ領域

    const EMPTY = 0;
    const FULL = 1;

    postMessage({
        type: "mpi-recv",
        src,
        tag,
        commId,
    });

    // 受信完了まで待機
    while (Atomics.load(ctlBlockingWorkerView, 0) === EMPTY) {
        Atomics.wait(ctlBlockingWorkerView, 0, EMPTY);
    }

    const len = Atomics.load(lenView, 0);
    const realSrc = Atomics.load(metaView, 0);
    const realTag = Atomics.load(metaView, 1);
    
    const realLen = Math.min(len, bufBytes);

    // ステータス情報を設定
    const base = statusPtr / 4;
    if (statusPtr) {
        HEAP32[base + 0] = realLen;
        HEAP32[base + 1] = realSrc;
        HEAP32[base + 2] = realTag;
        HEAP32[base + 3] = 0; // MPI_SUCCESS
    }

    // 受信データをWASMメモリにコピー
    HEAPU8.set(dataView.subarray(0, realLen), bufPtr);

    // 受信完了したらEMPTYに戻してSABが開いたことを通知
    Atomics.store(ctlBlockingWorkerView, 0, EMPTY);
    Atomics.store(ctlNonBlockingWorkerView, 0, EMPTY);
    Atomics.store(ctlRouterView, 0, EMPTY);
    Atomics.notify(ctlRouterView, 0, 1);
});

// TODO MPI_Status必要
int MPI_Recv(void *buf, int count, MPI_Datatype datatype, int src, int tag, MPI_Comm comm, MPI_Status *status) {
    intptr_t buf_ptr = (intptr_t)(buf);  // wasm上のアドレスを取得
    intptr_t status_ptr = (intptr_t)(status);
    int buf_bytes = count * mpi_get_size(datatype);
    js_mpi_recv(buf_ptr, count, datatype, src, tag, comm.commId, status_ptr, buf_bytes);
    return MPI_SUCCESS;
}

EM_JS(void, js_mpi_irecv, (intptr_t bufPtr, int count, int datatypeId, int src, int tag, int commId, intptr_t requestPtr, int bufBytes), {
    const sab = Module.eagerSab;
    const HEADER_SIZE = Module.HEADER_SIZE;
    const PAYLOAD_SIZE = Module.PAYLOAD_SIZE;

    // ブロッキング用Worker制御用（EMPTY = 0, FULL = 1）
    const ctlBlockingWorkerView = new Int32Array(sab, 0, 1);
    // ノンブロッキング用Worker制御用（EMPTY = 0, FULL = 1）
    const ctlNonBlockingWorkerView = new Int32Array(sab, 4, 1);
    // 制御もブロッキング用とノンブロッキング用を分けないといけないかも
    // 分けなくてよい．
    // router制御用（EMPTY = 0, FULL = 1）
    const ctlRouterView = new Int32Array(sab, 8, 1);
    // ノンブロッキング用RequestId伝達用
    const requestIdView = new Uint32Array(sab, 12, 1);
    const lenView = new Int32Array(sab, 16, 1); // length            
    const metaView = new Int32Array(sab, 20, 3); // src, tag, commId,
    const dataView = new Uint8Array(sab, HEADER_SIZE, PAYLOAD_SIZE); // データ領域

    const EMPTY = 0;
    const FULL = 1;

    const requestId = requestPtr; // リクエスト識別子としてポインタを使用

    postMessage({
        type: "mpi-irecv",
        src,
        tag,
        commId,
        requestId,
    });

    console.log("[mpi-irecv] wait start for requestId:", requestId);

    (async () => {
        while (true) {
            const result = Atomics.waitAsync(ctlNonBlockingWorkerView, 0, EMPTY);
            console.log("[mpi-irecv] waitAsync result:", result);
            if(!result.async) { // FULLの場合
                // requestIdとrequestIdViewを比較して，一致したら処理を進める
                // 一致しなければ待機を継続
                const currentRequestId = Atomics.load(requestIdView, 0);
                console.log("[mpi-irecv] currentRequestId:", currentRequestId, " requestId:", requestId);
                // 自分あてだった場合ループを抜けて処理を行う
                if (currentRequestId === requestId) {
                    break;
                }
                // 自分宛ではなかった場合EMPTYに戻さずに再度待機
                while (Atomics.load(ctlNonBlockingWorkerView, 0) === FULL) {
                    const result2 = Atomics.waitAsync(ctlNonBlockingWorkerView, 0, FULL);
                    if (result2.async) {
                        console.log("[mpi-irecv] 再待機 waitAsync result:", result2);
                        await result2.value; // 誰かがEMPTYにするまでsleep
                        console.log("[mpi-irecv] 再待機から復帰");
                    } 
                }
            }
            console.log("到達確認0");
            await result.value; // EMPTYの場合は待機
        }
        console.log("到達確認1");

        const len = Atomics.load(lenView, 0);
        const realSrc = Atomics.load(metaView, 0);
        const realTag = Atomics.load(metaView, 1);
        
        const realLen = Math.min(len, bufBytes);

        // ステータス情報を設定
        const base = requestPtr / 4;
        if (requestPtr) {
            HEAP32[base + 0] = requestId;
            HEAP32[base + 1] = 1;
            HEAP32[base + 2] = realLen;
            HEAP32[base + 3] = realSrc;
            HEAP32[base + 4] = realTag;
        }

        console.log("到達確認2");

        // 受信データをWASMメモリにコピー
        HEAPU8.set(dataView.subarray(0, realLen), bufPtr);

        // 受信完了したらEMPTYに戻してSABが開いたことを通知
        Atomics.store(ctlBlockingWorkerView, 0, EMPTY);
        Atomics.store(ctlNonBlockingWorkerView, 0, EMPTY);
        Atomics.store(ctlRouterView, 0, EMPTY);
        Atomics.notify(ctlNonBlockingWorkerView, 0); // ノンブロッキングwaitを起こす
        Atomics.notify(ctlRouterView, 0, 1);
        console.log("到達確認3");
    })();
});

int MPI_Irecv(void *buf, int count, MPI_Datatype datatype, int src, int tag, MPI_Comm comm, MPI_Request *request) {
    intptr_t buf_ptr = (intptr_t)(buf);  // wasm上のアドレスを取得
    intptr_t request_ptr = (intptr_t)(request);
    int buf_bytes = count * mpi_get_size(datatype);
    js_mpi_irecv(buf_ptr, count, datatype, src, tag, comm.commId, request_ptr, buf_bytes);
    return MPI_SUCCESS;
}

EM_JS(void, js_mpi_finalize, (), {
    postMessage({
        type: "mpi-finalize",
    });
});

int MPI_Finalize(void) {
    fflush(stdout);
    js_mpi_finalize();
    return MPI_SUCCESS;
}

int MPI_Get_count(MPI_Status *status, MPI_Datatype datatype, int *count) {
    if (!status || !count) {
        return MPI_ERR_ARG;
    }
    if(status->bytes % mpi_get_size(datatype) != 0) {
        return MPI_UNDEFINED;
    }
    *count = status->bytes / mpi_get_size(datatype);
    return MPI_SUCCESS;
}  

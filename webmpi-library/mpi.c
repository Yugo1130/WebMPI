#include "mpi.h"
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <emscripten.h>

const int WAITING = 0;
const int READY = 1;

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

EM_JS(void, js_mpi_send_eager, (intptr_t bufPtr, int dest, int tag, int commId, int bufSize, intptr_t ctlPtr), {
    postMessage({
        type: "mpi-send-eager",
        dest,
        tag,
        commId,
        bufSize,
        bufPtr,
        ctlPtr,
    });

    const WAITING = 0;
    const READY = 1;

    const ctlView = new Int32Array(Module.wasmMemory.buffer, ctlPtr, 1);

    while(Atomics.load(ctlView, 0) === WAITING) {
        Atomics.wait(ctlView, 0, WAITING);
    }
});

int MPI_Send(const void *buf_ptr, int count, MPI_Datatype datatype, int dest, int tag, MPI_Comm comm) {
    int buf_size = count * mpi_get_size(datatype);

    int32_t *ctl_ptr = (int32_t*)malloc(sizeof(int32_t));
    if(ctl_ptr == NULL) return MPI_ERR_NO_MEM;
    *ctl_ptr = WAITING; // WAITINGで初期化

    js_mpi_send_eager((intptr_t)buf_ptr, dest, tag, comm.commId, buf_size, (intptr_t)(ctl_ptr));
    free(ctl_ptr);
    return MPI_SUCCESS;
}

EM_JS(void, js_mpi_isend_eager, (intptr_t ptr, int dest, int tag, int commId, int bufSize, intptr_t requestPtr), {
    const requestId = requestPtr; // リクエスト識別子としてポインタを使用
});

int MPI_Isend(const void *buf, int count, MPI_Datatype datatype, int dest, int tag, MPI_Comm comm, MPI_Request *request) {
    // intptr_t ptr = (intptr_t)buf;  // wasm上のアドレスを取得
    // intptr_t request_ptr = (intptr_t)(request);
    // int buf_size = count * mpi_get_size(datatype);
    // js_mpi_isend_eager(ptr, dest, tag, comm.commId, buf_size, request_ptr);
    return MPI_SUCCESS;
}

EM_JS(void, js_mpi_recv, (intptr_t bufPtr, int src, int tag, int commId, intptr_t statusPtr, int bufSize, intptr_t ctlPtr), {
    postMessage({
        type: "mpi-recv",
        src,
        tag,
        commId,
        bufSize,
        bufPtr,
        ctlPtr,
        statusPtr,
    });

    const WAITING = 0;
    const READY = 1;

    const ctlView = new Int32Array(Module.wasmMemory.buffer, ctlPtr, 1);

    // 受信完了まで待機
    // C側でemscripten_futex_waitを使う方法もある（どちらでも良い）
    while (Atomics.load(ctlView, 0) === WAITING) {
        Atomics.wait(ctlView, 0, WAITING);
    }
});

// TODO MPI_Status必要
int MPI_Recv(void *buf_ptr, int count, MPI_Datatype datatype, int src, int tag, MPI_Comm comm, MPI_Status *status_ptr) {
    int buf_size = count * mpi_get_size(datatype);

    int32_t *ctl_ptr = (int32_t*)malloc(sizeof(int32_t));
    if(ctl_ptr == NULL) return MPI_ERR_NO_MEM;
    *ctl_ptr = WAITING; // WAITINGで初期化

    js_mpi_recv((intptr_t)buf_ptr, src, tag, comm.commId, (intptr_t)status_ptr, buf_size, (intptr_t)(ctl_ptr));
    free(ctl_ptr);

    return MPI_SUCCESS;
}

// EM_JS(void, js_mpi_irecv, (intptr_t bufPtr, int count, int datatypeId, int src, int tag, int commId, intptr_t requestPtr, int bufSize), {
//     const sab = Module.eagerSab;

//     const WAITING = 0;
//     const READY = 1;

//     const requestId = requestPtr; // リクエスト識別子としてポインタを使用

//     postMessage({
//         type: "mpi-irecv",
//         src,
//         tag,
//         commId,
//         requestId,
//     });

//     console.log("[mpi-irecv] wait start for requestId:", requestId);

//     (async () => {
//         while (true) {
//             while (Atomics.load(ctlNonBlockingWorkerView, 0) === WAITING) {
//                 const result = Atomics.waitAsync(ctlNonBlockingWorkerView, 0, WAITING);
//                 if (result.async) {
//                     console.log("[mpi-irecv] 待機中...", requestId);
//                     await result.value; // WAITINGの間は待機
//                 }
//             }

//             // ここに来た時点でFULLになっている
//             // 自分宛かどうかを確認する
//             const currentRequestId = Atomics.load(requestIdView, 0);
//             console.log("[mpi-irecv] currentRequestId:", currentRequestId, " requestId:", requestId);
//             if (currentRequestId === requestId) {
//                 break; // 自分宛だった場合ループを抜けて処理を行う
//             }

//             const result2 = Atomics.waitAsync(ctlNonBlockingWorkerView, 0, READY);
//             if (result2.async) {
//                 console.log("[mpi-irecv] 自分宛ではなかったため再待機 waitAsync result:", requestId);
//                 await result2.value;
//                 console.log("[mpi-irecv] 再待機から復帰", requestId);
//             } 

//             // 自分宛ではなかった場合WAITINGに戻さずに再度待機
//             // while (Atomics.load(ctlNonBlockingWorkerView, 0) === READY) {
//             //     const result2 = Atomics.waitAsync(ctlNonBlockingWorkerView, 0, READY);
//             //     if (result2.async) {
//             //         console.log("[mpi-irecv] 再待機 waitAsync result:", result2);
//             //         await result2.value; // 誰かがWAITINGにするまでsleep
//             //         console.log("[mpi-irecv] 再待機から復帰");
//             //     } 
//             // }
//         }
//         console.log("到達確認1");

//         const len = Atomics.load(lenView, 0);
//         const realSrc = Atomics.load(metaView, 0);
//         const realTag = Atomics.load(metaView, 1);
        
//         const realLen = Math.min(len, bufSize);

//         // console.log("bufPtr    =", bufPtr);
//         // console.log("requestPtr=", requestPtr);
//         // console.log("bufPtr/4  =", bufPtr / 4);
//         // console.log("requestPtr/4 =", requestPtr / 4);


//         // ステータス情報を設定
//         const base = requestPtr / 4;
//         if (requestPtr) {
//             HEAP32[base + 0] = requestId;
//             HEAP32[base + 1] = 1;
//             HEAP32[base + 2] = realLen;
//             HEAP32[base + 3] = realSrc;
//             HEAP32[base + 4] = realTag;
//         }

//         console.log("到達確認2");

//         // 受信データをWASMメモリにコピー
//         HEAPU8.set(dataView.subarray(0, realLen), bufPtr);

//         // 受信完了したらWAITINGに戻してSABが開いたことを通知
//         Atomics.store(ctlBlockingWorkerView, 0, WAITING);
//         Atomics.store(ctlNonBlockingWorkerView, 0, WAITING);
//         Atomics.store(ctlRouterView, 0, WAITING);
//         // const workerwake = Atomics.notify(ctlNonBlockingWorkerView, 0); // ノンブロッキングwaitを起こす
//         Atomics.notify(ctlRouterView, 0, 1);
//         console.log("到達確認3");
//     })();
// });

int MPI_Irecv(void *buf, int count, MPI_Datatype datatype, int src, int tag, MPI_Comm comm, MPI_Request *request) {
    // intptr_t buf_ptr = (intptr_t)(buf);  // wasm上のアドレスを取得
    // intptr_t request_ptr = (intptr_t)(request);
    // int buf_size = count * mpi_get_size(datatype);
    // printf("MPI_Irecv called with buf_ptr: %ld, count: %d, datatype: %d, src: %d, tag: %d, commId: %d, request_ptr: %ld, buf_size: %d\n",
    //        buf_ptr, count, datatype, src, tag, comm.commId, request_ptr, buf_size);
    // js_mpi_irecv(buf_ptr, count, datatype, src, tag, comm.commId, request_ptr, buf_size);
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

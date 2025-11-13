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

EM_JS(void, js_mpi_recv, (intptr_t bufPtr, int count, int datatypeId, int src, int tag, int commId, intptr_t statusPtr, int bufBytes), {
    const sab = Module.eagerSab;
    const HEADER_SIZE = Module.HEADER_SIZE;
    const PAYLOAD_SIZE = Module.PAYLOAD_SIZE;

    const ctlView = new Int32Array(sab, 0, 1);
    const lenView = new Int32Array(sab, 4, 1);
    const metaView = new Int32Array(sab, 8, 6);
    const dataView = new Uint8Array(sab, HEADER_SIZE, PAYLOAD_SIZE);

    const EMPTY = 0;
    const FULL = 1;

    postMessage({
        type: "mpi-recv",
        src,
        tag,
        commId,
    });

    // 受信完了まで待機
    Atomics.wait(ctlView, 0, EMPTY);

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

    // 受信完了を通知
    Atomics.store(ctlView, 0, EMPTY);
    Atomics.notify(ctlView, 0, 1);
});

// TODO MPI_Status必要
int MPI_Recv(void *buf, int count, MPI_Datatype datatype, int src, int tag, MPI_Comm comm, MPI_Status *status) {
    intptr_t buf_ptr = (intptr_t)(buf);  // wasm上のアドレスを取得
    intptr_t status_ptr = (intptr_t)(status);
    int buf_bytes = count * mpi_get_size(datatype);
    js_mpi_recv(buf_ptr, count, datatype, src, tag, comm.commId, status_ptr, buf_bytes);

    // 通信処理はここに追加（JS経由）
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

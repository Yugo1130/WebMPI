#include "mpi.h"
#include <stdio.h>
#include <string.h>
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

// OPTIMIZE postmessageからarraybufferもしくはsharedarraybufferに変えるべき．
EM_JS(void, js_mpi_send, (int ptr, int count, int datatypeId, int dest, int tag, int commId, int size), {
    const buf = HEAPU8.slice(ptr, ptr + size);
    postMessage({
        type: "mpi-send",
        count,
        datatypeId,
        dest,
        tag,
        commId,
        payload: buf,
    });
});

int MPI_Send(const void *buf, int count, MPI_Datatype datatype, int dest, int tag, MPI_Comm comm) {
    int bytes = count * mpi_get_size(datatype);
    int datatypeId = mpi_get_id(datatype);
    int ptr = (int)(buf);  // wasm上のアドレスを取得
    js_mpi_send(ptr, count, datatypeId, dest, tag, comm.commId, bytes);
    return MPI_SUCCESS;
}

EM_JS(void, js_mpi_recv_request, (int source, int tag, int commId), {
    postMessage({
        type: "mpi-recv-request",
        source,
        tag,
        commId,
    });
});

// TODO MPI_Status必要
int MPI_Recv(void *buf, int count, MPI_Datatype datatype, int source, int tag, MPI_Comm comm) {
    js_mpi_recv_request(source, tag, comm.commId);

    int bytes = count * mpi_get_size(datatype);
    // 通信処理はここに追加（JS経由）
    return MPI_SUCCESS;
}

int MPI_Finalize(void) {
    fflush(stdout);
    return MPI_SUCCESS;
}

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
    const WAITING = 0;
    const requestView = new Int32Array(Module.wasmMemory.buffer, requestPtr, 5); // isComplete
    while (Atomics.load(requestView, 1) === WAITING) {
        Atomics.wait(requestView, 1, WAITING);
    }
    // ステータス情報をコピー
    const statusView = new Int32Array(Module.wasmMemory.buffer, statusPtr, 4);
    statusView[0] = requestView[2]; // bytes
    statusView[1] = requestView[3]; // MPI_SOURCE
    statusView[2] = requestView[4]; // MPI_TAG
    statusView[3] = 0; // MPI_ERROR
});

int MPI_Wait(MPI_Request *request, MPI_Status *status) {
    js_mpi_wait((intptr_t)request, (intptr_t)status);
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
    // 現状eager方式のみ実装
    int buf_size = count * mpi_get_size(datatype);

    int32_t *ctl_ptr = (int32_t*)malloc(sizeof(int32_t));
    if(ctl_ptr == NULL) return MPI_ERR_NO_MEM;
    *ctl_ptr = WAITING; // WAITINGで初期化

    js_mpi_send_eager((intptr_t)buf_ptr, dest, tag, comm.commId, buf_size, (intptr_t)(ctl_ptr));

    free(ctl_ptr);
    return MPI_SUCCESS;
}

EM_JS(void, js_mpi_isend_eager, (intptr_t bufPtr, int dest, int tag, int commId, int bufSize, intptr_t requestPtr), {
    postMessage({
        type: "mpi-isend-eager",
        dest,
        tag,
        commId,
        bufSize,
        bufPtr,
        requestPtr,
    });
});

int MPI_Isend(const void *buf_ptr, int count, MPI_Datatype datatype, int dest, int tag, MPI_Comm comm, MPI_Request *request_ptr) {
    // 現状eager方式のみ実装
    int buf_size = count * mpi_get_size(datatype);

    // 動的確保ではなく，requestのisCompleteメンバを使う
    request_ptr->isComplete = WAITING; // WAITINGで初期化

    js_mpi_isend_eager((intptr_t)buf_ptr, dest, tag, comm.commId, buf_size, (intptr_t)(request_ptr));

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

EM_JS(void, js_mpi_irecv, (intptr_t bufPtr, int src, int tag, int commId, intptr_t requestPtr, int bufSize), {
    postMessage({
        type: "mpi-irecv",
        src,
        tag,
        commId,
        bufSize,
        bufPtr,
        requestPtr,
    });
});

int MPI_Irecv(void *buf_ptr, int count, MPI_Datatype datatype, int src, int tag, MPI_Comm comm, MPI_Request *request_ptr) {
    int buf_size = count * mpi_get_size(datatype);

    request_ptr->isComplete = WAITING; // WAITINGで初期化

    js_mpi_irecv((intptr_t)buf_ptr, src, tag, comm.commId, (intptr_t)request_ptr, buf_size);

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

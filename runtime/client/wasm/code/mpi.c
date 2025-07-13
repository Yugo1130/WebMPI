#include "mpi.h"
#include <stdio.h>
#include <string.h>

// 通信定義
// TODO 自作コミュニケータに対応させる．
MPI_Comm MPI_COMM_WORLD;

// 内部設定関数（JS側から設定する想定）

void mpi_internal_init_world_comm(int rank, int size) {
    MPI_COMM_WORLD.commid = 0;
    MPI_COMM_WORLD.commrank = rank;
    MPI_COMM_WORLD.commsize = size;
}

// 補助関数

int mpi_get_size(MPI_Datatype dtype) {
    return (dtype >> 8) & 0xFF;
}

int mpi_get_id(MPI_Datatype dtype) {
    return dtype & 0xFF;
}

// MPI関数実装

int MPI_Init(int *argc, char ***argv) {
    // TODO 多分ここでjs関数を呼ぶ
    return MPI_SUCCESS;
}

int MPI_Comm_size(MPI_Comm comm, int *size) {
    *size = comm.commsize;
    return MPI_SUCCESS;
}

int MPI_Comm_rank(MPI_Comm comm, int *rank) {
    *rank = comm.commrank;
    return MPI_SUCCESS;
}

int MPI_Send(const void *buf, int count, MPI_Datatype datatype, int dest, int tag, MPI_Comm comm) {
    int bytes = count * mpi_get_size(datatype);
    printf("[Rank %d] to rank %d (byte: %d, type: %d)\n", comm.commrank, dest, bytes, mpi_get_id(datatype));
    // 通信処理はここに追加（JS経由）
    return MPI_SUCCESS;
}

// TODO MPI_Status必要
int MPI_Recv(void *buf, int count, MPI_Datatype datatype, int source, int tag, MPI_Comm comm) {
    int bytes = count * mpi_get_size(datatype);
    printf("[Rank %d] to rank %d (byte: %d, type: %d)\n", comm.commrank, source, bytes, mpi_get_id(datatype));
    // 通信処理はここに追加（JS経由）
    return MPI_SUCCESS;
}

int MPI_Finalize(void) {
    fflush(stdout);
    return MPI_SUCCESS;
}

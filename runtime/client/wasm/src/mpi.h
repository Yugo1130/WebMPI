#ifndef MINI_MPI_H
#define MINI_MPI_H

#ifdef __cplusplus
extern "C" {
#endif

// データ型定義
// 0x4cabcdefの時，
// 0x4c -> magic値
// ab -> 予約
// cd -> サイズ情報
// ef -> ID
typedef int MPI_Datatype;
#define MPI_CHAR           ((MPI_Datatype)0x4c000101)
#define MPI_UNSIGNED_CHAR  ((MPI_Datatype)0x4c000102)
#define MPI_SHORT          ((MPI_Datatype)0x4c000203)
#define MPI_UNSIGNED_SHORT ((MPI_Datatype)0x4c000204)
#define MPI_INT            ((MPI_Datatype)0x4c000405)
#define MPI_UNSIGNED       ((MPI_Datatype)0x4c000406)
#define MPI_LONG           ((MPI_Datatype)0x4c000807)
#define MPI_UNSIGNED_LONG  ((MPI_Datatype)0x4c000808)
#define MPI_LONG_LONG_INT  ((MPI_Datatype)0x4c000809)
#define MPI_FLOAT          ((MPI_Datatype)0x4c00040a)
#define MPI_DOUBLE         ((MPI_Datatype)0x4c00080b)
#define MPI_LONG_DOUBLE    ((MPI_Datatype)0x4c00100c)
#define MPI_BYTE           ((MPI_Datatype)0x4c00010d)
#define MPI_WCHAR          ((MPI_Datatype)0x4c00040e)
#define MPI_PACKED         ((MPI_Datatype)0x4c00010f)
#define MPI_LB             ((MPI_Datatype)0x4c000010)
#define MPI_UB             ((MPI_Datatype)0x4c000011)

// 通信定義

typedef struct {
    int commid; // コミュニケータの識別子（MPI_COMM_WORLD = 0）
    int commrank; // 自ノードのランク
    int commsize; // 総プロセス数
} MPI_Comm;

extern MPI_Comm MPI_COMM_WORLD;

// 関数プロトタイプ

int MPI_Init(int *argc, char ***argv);
int MPI_Comm_size(MPI_Comm comm, int *size);
int MPI_Comm_rank(MPI_Comm comm, int *rank);
int MPI_Send(const void *buf, int count, MPI_Datatype datatype, int dest, int tag, MPI_Comm comm);
int MPI_Recv(void *buf, int count, MPI_Datatype datatype, int source, int tag, MPI_Comm comm);
int MPI_Finalize(void);

// その他定数
// @todo エラーコードの定義
// https://learn.microsoft.com/ja-jp/message-passing-interface/mpi-error

#define MPI_SUCCESS 0

// 内部用：rank/size設定（JSからccallで呼び出す想定）
void mpi_internal_init_world_comm(int rank, int size);

#ifdef __cplusplus
}
#endif

#endif // MINI_MPI_H

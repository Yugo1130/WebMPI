#ifndef MINI_MPI_H
#define MINI_MPI_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct _MPI_Status {
    int count;
    int cancelled;
    int MPI_SOURCE;
    int MPI_TAG;
    int MPI_ERROR;
} MPI_Status;

#define MPI_SUCCESS 0
#define MPI_ERR_BUFFER 1
#define MPI_ERR_COUNT 2
#define MPI_ERR_TYPE 3
#define MPI_ERR_TAG 4
#define MPI_ERR_COMM 5
#define MPI_ERR_RANK 6
#define MPI_ERR_ROOT 7
#define MPI_ERR_GROUP 8
#define MPI_ERR_OP 9
#define MPI_ERR_TOPOLOGY 10
#define MPI_ERR_DIMS 11
#define MPI_ERR_ARG 12
#define MPI_ERR_UNKNOWN 13
#define MPI_ERR_TRUNCATE 14
#define MPI_ERR_OTHER 15
#define MPI_ERR_INTERN 16
#define MPI_ERR_IN_STATUS 17
#define MPI_ERR_PENDING 18
#define MPI_ERR_REQUEST 19
#define MPI_ERR_ACCESS 20
#define MPI_ERR_AMODE 21
#define MPI_ERR_BAD_FILE 22
#define MPI_ERR_CONVERSION 23
#define MPI_ERR_DUP_DATAREP 24
#define MPI_ERR_FILE_EXISTS 25
#define MPI_ERR_FILE_IN_USE 26
#define MPI_ERR_FILE 27
#define MPI_ERR_INFO 28
#define MPI_ERR_INFO_KEY 29
#define MPI_ERR_INFO_VALUE 30
#define MPI_ERR_INFO_NOKEY 31
#define MPI_ERR_IO 32
#define MPI_ERR_NAME 33
#define MPI_ERR_NO_MEM 34
#define MPI_ERR_NOT_SAME 35
#define MPI_ERR_NO_SPACE 36
#define MPI_ERR_NO_SUCH_FILE 37
#define MPI_ERR_PORT 38
#define MPI_ERR_QUOTA 39
#define MPI_ERR_READ_ONLY 40
#define MPI_ERR_SERVICE 41
#define MPI_ERR_SPAWN 42
#define MPI_ERR_UNSUPPORTED_DATAREP 43
#define MPI_ERR_UNSUPPORTED_OPERATION 44
#define MPI_ERR_WIN 45
#define MPI_ERR_BASE 46
#define MPI_ERR_LOCKTYPE 47
#define MPI_ERR_KEYVAL 48
#define MPI_ERR_RMA_CONFLICT 49
#define MPI_ERR_RMA_SYNC 50
#define MPI_ERR_SIZE 51
#define MPI_ERR_DISP 52
#define MPI_ERR_ASSERT 53
#define MPI_ERR_LASTCODE 0x3fffffff

#define MPI_ANY_SOURCE -1
#define MPI_ANY_TAG -1

typedef enum _MPI_Datatype { 
    MPI_CHAR           = 0x4c000101,
    MPI_UNSIGNED_CHAR  = 0x4c000102,
    MPI_SHORT          = 0x4c000203,
    MPI_UNSIGNED_SHORT = 0x4c000204,
    MPI_INT            = 0x4c000405,
    MPI_UNSIGNED       = 0x4c000406,
    MPI_LONG           = 0x4c000807,
    MPI_UNSIGNED_LONG  = 0x4c000808,
    MPI_LONG_LONG_INT  = 0x4c000809,
    MPI_FLOAT          = 0x4c00040a,
    MPI_DOUBLE         = 0x4c00080b,
    MPI_LONG_DOUBLE    = 0x4c00100c,
    MPI_BYTE           = 0x4c00010d,
    MPI_WCHAR          = 0x4c00040e,
    MPI_PACKED         = 0x4c00010f,
    MPI_LB             = 0x4c000010,
    MPI_UB             = 0x4c000011
} MPI_Datatype;

// 通信定義

typedef struct {
    int commId; // コミュニケータの識別子（MPI_COMM_WORLD = 0）
    int commRank; // 自ノードのランク
    int commSize; // 総プロセス数
} MPI_Comm;

extern MPI_Comm MPI_COMM_WORLD;

// 関数プロトタイプ

int MPI_Init(int *argc, char ***argv);
int MPI_Comm_size(MPI_Comm comm, int *size);
int MPI_Comm_rank(MPI_Comm comm, int *rank);
int MPI_Send(const void *buf, int count, MPI_Datatype datatype, int dest, int tag, MPI_Comm comm);
int MPI_Isend(const void *buf, int count, MPI_Datatype datatype, int dest, int tag, MPI_Comm comm);
int MPI_Recv(void *buf, int count, MPI_Datatype datatype, int source, int tag, MPI_Comm comm);
int MPI_Irecv(void *buf, int count, MPI_Datatype datatype, int source, int tag, MPI_Comm comm);
int MPI_Finalize(void);

// その他定数
// TODO エラーコードの定義
// https://learn.microsoft.com/ja-jp/message-passing-interface/mpi-error

// 内部用：rank/size設定（JSからccallで呼び出す想定）
void mpi_internal_init_world_comm(int rank, int size);

#ifdef __cplusplus
}
#endif

#endif // MINI_MPI_H

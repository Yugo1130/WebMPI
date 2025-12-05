#include <iostream>
#include <mpi.h>
#include <unistd.h> 

int main(int argc, char *argv[]){
    int rank, size;
    MPI_Init(&argc, &argv);
    MPI_Comm_size(MPI_COMM_WORLD, &size);
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);

    // サイズが動的な配列をスタックに確保するのは WASM でリスクが高いため、
    // ネイティブMPIの練習としてこのままにしますが、WASM環境ではヒープ確保が推奨されます。
    MPI_Status status[size-1][4];
    MPI_Request request[size-1][4];
    
    printf("Hello from rank %d, size: %d\n", rank, size);

    if(rank == 0){
        printf("run MPI_Test version\n");
        int aa[size-1], bb[size-1], cc[size-1], dd[size-1];
        
        // --- 1. 受信操作の開始 (MPI_Irecv) ---
        for(int i = 1; i < size; i++){
            // request[i-1][0] から request[i-1][3] まで順番に Irecv を開始
            MPI_Irecv(&aa[i-1], 1, MPI_INT, MPI_ANY_SOURCE, MPI_ANY_TAG, MPI_COMM_WORLD, &request[i-1][0]);
            MPI_Irecv(&bb[i-1], 1, MPI_INT, MPI_ANY_SOURCE, MPI_ANY_TAG, MPI_COMM_WORLD, &request[i-1][1]);
            MPI_Irecv(&cc[i-1], 1, MPI_INT, MPI_ANY_SOURCE, MPI_ANY_TAG, MPI_COMM_WORLD, &request[i-1][2]);
            MPI_Irecv(&dd[i-1], 1, MPI_INT, MPI_ANY_SOURCE, MPI_ANY_TAG, MPI_COMM_WORLD, &request[i-1][3]);
        }

        // --- 2. 完了待機 (MPI_Testを使用したポーリング) ---
        for(int i = 1; i < size; i++){
            int all_done = 0; // すべてのリクエストが完了したら 1
            
            // 4つのリクエストを格納する配列 (Waitall/Testall用ではないが、ロジックを整理しやすい)
            MPI_Request* req_array = &request[i-1][0];
            MPI_Status* status_array = &status[i-1][0];

            while(!all_done){
                all_done = 1; // 完了していると仮定

                for(int j = 0; j < 4; j++){
                    int completed;
                    
                    // MPI_Testで完了したかを確認
                    MPI_Test(&req_array[j], &completed, &status_array[j]);
                    
                    if(!completed){
                        // 1つでも未完了ならフラグをリセットし、ループを継続
                        all_done = 0;
                        break; 
                    }
                }
                // (WASM環境を考慮し、ここではsleepを省略)
            }
        }
        
        // --- 3. 結果の出力 ---
        for(int i = 1; i < size; i++){
            printf("aa rank %d: %d tag: %d src: %d\n", i, aa[i-1], status[i-1][0].MPI_TAG, status[i-1][0].MPI_SOURCE);
            printf("bb rank %d: %d tag: %d src: %d\n", i, bb[i-1], status[i-1][1].MPI_TAG, status[i-1][1].MPI_SOURCE);
            printf("cc rank %d: %d tag: %d src: %d\n", i, cc[i-1], status[i-1][2].MPI_TAG, status[i-1][2].MPI_SOURCE);
            printf("dd rank %d: %d tag: %d src: %d\n", i, dd[i-1], status[i-1][3].MPI_TAG, status[i-1][3].MPI_SOURCE);
        }
        
    } else {
        // rank > 0 の送信側プロセス
        int a = 1111, b = 2222, c = 3333, d = 4444;
        
        // --- 1. 送信操作の開始 (MPI_Isend) ---
        MPI_Isend(&a, 1, MPI_INT, 0, 11, MPI_COMM_WORLD, &request[rank-1][0]);
        MPI_Isend(&b, 1, MPI_INT, 0, 22, MPI_COMM_WORLD, &request[rank-1][1]);
        MPI_Isend(&c, 1, MPI_INT, 0, 33, MPI_COMM_WORLD, &request[rank-1][2]);
        MPI_Isend(&d, 1, MPI_INT, 0, 44, MPI_COMM_WORLD, &request[rank-1][3]);

        // --- 2. 完了待機 (MPI_Testを使用したポーリング) ---
        int all_done = 0; 
        MPI_Request* req_array = &request[rank-1][0];
        MPI_Status* status_array = &status[rank-1][0];

        while(!all_done){
            all_done = 1;
            for(int j = 0; j < 4; j++){
                int completed;
                MPI_Test(&req_array[j], &completed, &status_array[j]);
                if(!completed){
                    all_done = 0;
                    break;
                }
            }
        }
    }
    
    MPI_Finalize();
    return 0;
}
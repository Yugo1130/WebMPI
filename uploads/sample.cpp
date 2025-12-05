#include <iostream>
#include <mpi.h>
#include <unistd.h> // sleep用

int main(int argc, char *argv[]){
    int rank, size;
    MPI_Init(&argc, &argv);
    MPI_Comm_size(MPI_COMM_WORLD, &size);
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Status status[size-1][4];
    MPI_Request request[size-1][4];
    printf("Hello from rank %d, size: %d\n", rank, size);
    if(rank == 0){
        int aa[size-1], bb[size-1], cc[size-1], dd[size-1];
        // sleep(1);
        for(int i = 1; i < size; i++){
            MPI_Irecv(&aa[i-1], 1, MPI_INT, MPI_ANY_SOURCE, MPI_ANY_TAG, MPI_COMM_WORLD, &request[i-1][0]);
            MPI_Irecv(&bb[i-1], 1, MPI_INT, MPI_ANY_SOURCE, MPI_ANY_TAG, MPI_COMM_WORLD, &request[i-1][1]);
            MPI_Irecv(&dd[i-1], 1, MPI_INT, MPI_ANY_SOURCE, MPI_ANY_TAG, MPI_COMM_WORLD, &request[i-1][3]);
            MPI_Irecv(&cc[i-1], 1, MPI_INT, MPI_ANY_SOURCE, MPI_ANY_TAG, MPI_COMM_WORLD, &request[i-1][2]);
            // sleep(1); 
            // MPI_Recv(&aa[i-1], 1, MPI_INT, i, 11, MPI_COMM_WORLD, &status[i-1][0]);
            // MPI_Recv(&bb[i-1], 1, MPI_INT, i, 22, MPI_COMM_WORLD, &status[i-1][1]);
            // MPI_Recv(&cc[i-1], 1, MPI_INT, i, 33, MPI_COMM_WORLD, &status[i-1][2]);
            // MPI_Recv(&dd[i-1], 1, MPI_INT, i, 44, MPI_COMM_WORLD, &status[i-1][3]);
        }
        for(int i = 1; i < size; i++){
            MPI_Wait(&request[i-1][0], &status[i-1][0]);
            MPI_Wait(&request[i-1][1], &status[i-1][1]);
            MPI_Wait(&request[i-1][2], &status[i-1][2]);
            MPI_Wait(&request[i-1][3], &status[i-1][3]);
        }    
        // sleep(2); // 全プロセスからの送信完了を待つ
        for(int i = 1; i < size; i++){
            printf("aa rank %d: %d tag: %d src: %d\n", i, aa[i-1], status[i-1][0].MPI_TAG, status[i-1][0].MPI_SOURCE);
            printf("bb rank %d: %d tag: %d src: %d\n", i, bb[i-1], status[i-1][1].MPI_TAG, status[i-1][1].MPI_SOURCE);
            printf("cc rank %d: %d tag: %d src: %d\n", i, cc[i-1], status[i-1][2].MPI_TAG, status[i-1][2].MPI_SOURCE);
            printf("dd rank %d: %d tag: %d src: %d\n", i, dd[i-1], status[i-1][3].MPI_TAG, status[i-1][3].MPI_SOURCE);
        }
    } else {
        int a = 111, b = 222, c = 333, d = 444;
        // sleep(1);
        // MPI_Send(&a, 1, MPI_INT, 0, 11, MPI_COMM_WORLD);
        // MPI_Send(&b, 1, MPI_INT, 0, 22, MPI_COMM_WORLD);
        // MPI_Send(&c, 1, MPI_INT, 0, 33, MPI_COMM_WORLD);
        // MPI_Send(&d, 1, MPI_INT, 0, 44, MPI_COMM_WORLD);

        MPI_Isend(&a, 1, MPI_INT, 0, 11, MPI_COMM_WORLD, &request[rank-1][0]);
        MPI_Isend(&b, 1, MPI_INT, 0, 22, MPI_COMM_WORLD, &request[rank-1][1]);
        MPI_Isend(&c, 1, MPI_INT, 0, 33, MPI_COMM_WORLD, &request[rank-1][2]);
        MPI_Isend(&d, 1, MPI_INT, 0, 44, MPI_COMM_WORLD, &request[rank-1][3]);

        MPI_Wait(&request[rank-1][0], &status[rank-1][0]);
        MPI_Wait(&request[rank-1][1], &status[rank-1][1]);
        MPI_Wait(&request[rank-1][2], &status[rank-1][2]);
        MPI_Wait(&request[rank-1][3], &status[rank-1][3]);
    }
    MPI_Finalize();
    return 0;
}
#include <iostream>
#include <mpi.h>
#include <unistd.h> // sleep用

int main(int argc, char *argv[]){
    int rank, size;
    MPI_Status status;
    MPI_Init(&argc, &argv);
    MPI_Comm_size(MPI_COMM_WORLD, &size);
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    printf("Hello from rank %d, size: %d\n", rank, size);
    if(rank == 0){
        int aa[size-1], bb[size-1], cc[size-1], dd[size-1];
        // 1秒待機
        // sleep(1);
        for(int i = 1; i < size; i++){
            MPI_Recv(&cc[i-1], 1, MPI_INT, i, 33, MPI_COMM_WORLD, &status);
            MPI_Recv(&bb[i-1], 1, MPI_INT, i, 22, MPI_COMM_WORLD, &status);
            MPI_Recv(&dd[i-1], 1, MPI_INT, i, 44, MPI_COMM_WORLD, &status);
            MPI_Recv(&aa[i-1], 1, MPI_INT, i, 11, MPI_COMM_WORLD, &status);
            // printf("Received from rank: %d\n", status.MPI_SOURCE);
            // printf("Received tag: %d\n", status.MPI_TAG);
            // int count;
            // MPI_Get_count(&status, MPI_INT, &count);
            // printf("Received count: %d\n", count);
        }
        for(int i = 1; i < size; i++){
            printf("aa rank %d: %d\n", i, aa[i-1]);
            printf("bb rank %d: %d\n", i, bb[i-1]);
            printf("cc rank %d: %d\n", i, cc[i-1]);
            printf("dd rank %d: %d\n", i, dd[i-1]);
        }
    } else {
        int a = 111, b = 222, c = 333, d = 444;
        // 1秒待機
        // sleep(1);
        MPI_Send(&a, 1, MPI_INT, 0, 11, MPI_COMM_WORLD);
        MPI_Send(&b, 1, MPI_INT, 0, 22, MPI_COMM_WORLD);
        MPI_Send(&c, 1, MPI_INT, 0, 33, MPI_COMM_WORLD);
        MPI_Send(&d, 1, MPI_INT, 0, 44, MPI_COMM_WORLD);
        // printf("a: %d\n", a);
        // printf("b: %d\n", b);
        // printf("c: %d\n", c);
        // printf("d: %d\n", d);
    }
    MPI_Finalize();
    return 0;
}
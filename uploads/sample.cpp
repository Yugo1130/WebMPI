#include <iostream>
#include "mpi.h"

int main(int argc, char *argv[]){
    int rank, size;
    // MPI_Status status;
    MPI_Init(&argc, &argv);
    MPI_Comm_size(MPI_COMM_WORLD, &size);
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    printf("Hello from rank %d, size: %d\n", rank, size);
    if(rank == 0){
        int a = 1024;
        MPI_Send(&a, 1, MPI_INT, 1, 0, MPI_COMM_WORLD);
    }
    if(rank == 1){
        int b;
        MPI_Recv(&b, 5, MPI_INT, 0, 0, MPI_COMM_WORLD /* , &status */);
        printf("%d", b);
    }
    MPI_Finalize();
    return 0;
}
#include <iostream>
#include "mpi.h"

int main(int argc, char *argv[]){
    int rank, size;
    // MPI_Status status;
    // MPI_Init(&argc, &argv);
    // MPI_Comm_size(MPI_COMM_WORLD, &size);
    // MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    // printf("Hello from rank %d\n", rank);
    printf("hello!");
    int a = 100;
    // if(rank == 0){
    //     MPI_Send(&a, 1, MPI_INT, 1, 0, MPI_COMM_WORLD);
    //     printf("rank 0");
    // }
    // if(rank == 1){
    //     MPI_Recv(&a, 1, MPI_INT, 0, 0, MPI_COMM_WORLD);
    //     printf("rank 1");
    // }
    // MPI_Finalize();
    return 0;
}
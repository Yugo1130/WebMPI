#include <iostream>
#include "../webmpi-library/mpi.h"

int main(int argc, char *argv[]){
    int rank, size;
    MPI_Status status;
    MPI_Init(&argc, &argv);
    MPI_Comm_size(MPI_COMM_WORLD, &size);
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    printf("Hello from rank %d, size: %d\n", rank, size);
    if(rank == 0){
        int a = 1024;
        MPI_Isend(&a, 1, MPI_INT, 1, 20, MPI_COMM_WORLD);
        printf("%d", a);
    }
    if(rank == 1){
        int b;
        MPI_Recv(&b, 1, MPI_INT, 0, 20, MPI_COMM_WORLD, &status);
        printf("Received from rank: %d\n", status.MPI_SOURCE);
        printf("Received tag: %d\n", status.MPI_TAG);
        int count;
        MPI_Get_count(&status, MPI_INT, &count);
        printf("Received count: %d\n", count);
        printf("%d", b);
    }
    MPI_Finalize();
    return 0;
}